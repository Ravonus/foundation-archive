/* eslint-disable max-lines */

import {
  BackupStatus,
  type Prisma,
  QueueJobKind,
  QueueJobStatus,
  type QueueJob,
} from "~/server/prisma-client";
import { archivePaceConfigForContractsPerTick } from "~/lib/archive-pace";
import { emitArchiveEvent } from "~/server/archive/live-events";
import { getArchivePolicyState } from "~/server/archive/state";
import {
  BACKUP_PRIORITY,
  CONTRACT_TOKEN_PRIORITY,
  FAILED_ROOT_RETRY_COOLDOWN_MS,
  archivePinningEnabled,
  type DatabaseClient,
  FOUNDATION_URL_PRIORITY,
  normalizeAddress,
} from "./shared";
import {
  artworkBlockedBySmartBudget,
  nextProcessableRootPriority,
} from "./smart-budget";

const SMART_BUDGET_ROOT_SELECT = {
  backupStatus: true,
  pinStatus: true,
  localDirectory: true,
  estimatedByteSize: true,
  byteSize: true,
} as const;

function queueJobSummary(kind: QueueJobKind) {
  switch (kind) {
    case QueueJobKind.INGEST_FOUNDATION_URL:
      return "Queued a Foundation page ingest job.";
    case QueueJobKind.INGEST_CONTRACT_TOKEN:
      return "Queued a contract token ingest job.";
    case QueueJobKind.SCAN_CONTRACT_TOKENS:
      return "Queued a contract scan job.";
    case QueueJobKind.BACKUP_ARTWORK:
      return "Queued an archive backup job.";
    case QueueJobKind.VERIFY_ROOT:
      return "Queued a root verification job.";
  }
}

type QueueJobInput = {
  kind: QueueJobKind;
  payload: unknown;
  dedupeKey?: string;
  priority?: number;
  maxAttempts?: number;
  availableAt?: Date;
};

async function emitQueueEvent(
  client: DatabaseClient,
  type: string,
  job: QueueJob,
) {
  await emitArchiveEvent(client, {
    type,
    summary: queueJobSummary(job.kind),
    data: {
      jobId: job.id,
      kind: job.kind,
      status: job.status,
      priority: job.priority,
    },
  });
}

async function updateActiveExistingJob(args: {
  client: DatabaseClient;
  existing: QueueJob;
  payload: string;
  priority: number;
  maxAttempts: number;
}) {
  const { client, existing, payload, priority, maxAttempts } = args;
  const priorityIncreased = priority > existing.priority;
  const changed =
    payload !== existing.payload ||
    priorityIncreased ||
    maxAttempts !== existing.maxAttempts;

  if (!changed) return existing;

  const job = await client.queueJob.update({
    where: { id: existing.id },
    data: {
      payload,
      priority: Math.max(existing.priority, priority),
      availableAt:
        existing.status === QueueJobStatus.PENDING && priorityIncreased
          ? new Date()
          : undefined,
      maxAttempts,
    },
  });

  await emitQueueEvent(client, "queue.job-updated", job);
  return job;
}

async function requeueInactiveExistingJob(args: {
  client: DatabaseClient;
  existing: QueueJob;
  payload: string;
  priority: number;
  maxAttempts: number;
  availableAt: Date | undefined;
}) {
  const { client, existing, payload, priority, maxAttempts, availableAt } =
    args;

  const job = await client.queueJob.update({
    where: { id: existing.id },
    data: {
      status: QueueJobStatus.PENDING,
      payload,
      priority,
      maxAttempts,
      attempts: 0,
      availableAt: availableAt ?? new Date(),
      startedAt: null,
      finishedAt: null,
      lastError: null,
    },
  });

  await emitQueueEvent(client, "queue.job-requeued", job);
  return job;
}

async function handleExistingDedupedJob(args: {
  client: DatabaseClient;
  existing: QueueJob;
  input: QueueJobInput;
}) {
  const { client, existing, input } = args;
  const payload = JSON.stringify(input.payload);
  const priority = input.priority ?? existing.priority;
  const maxAttempts = input.maxAttempts ?? existing.maxAttempts;

  if (
    existing.status === QueueJobStatus.PENDING ||
    existing.status === QueueJobStatus.RUNNING
  ) {
    return updateActiveExistingJob({
      client,
      existing,
      payload,
      priority,
      maxAttempts,
    });
  }

  return requeueInactiveExistingJob({
    client,
    existing,
    payload,
    priority,
    maxAttempts,
    availableAt: input.availableAt,
  });
}

async function createNewQueueJob(client: DatabaseClient, input: QueueJobInput) {
  const job = await client.queueJob.create({
    data: {
      kind: input.kind,
      payload: JSON.stringify(input.payload),
      dedupeKey: input.dedupeKey,
      priority: input.priority ?? 0,
      maxAttempts: input.maxAttempts ?? 3,
      availableAt: input.availableAt,
    },
  });

  await emitQueueEvent(client, "queue.job-queued", job);
  return job;
}

export async function queueJob(client: DatabaseClient, input: QueueJobInput) {
  if (input.dedupeKey) {
    const existing = await client.queueJob.findUnique({
      where: {
        kind_dedupeKey: {
          kind: input.kind,
          dedupeKey: input.dedupeKey,
        },
      },
    });

    if (existing) {
      return handleExistingDedupedJob({ client, existing, input });
    }
  }

  return createNewQueueJob(client, input);
}

export async function enqueueFoundationMintIngest(
  client: DatabaseClient,
  url: string,
  backupPriority?: number,
) {
  return queueJob(client, {
    kind: QueueJobKind.INGEST_FOUNDATION_URL,
    payload: { url, backupPriority },
    dedupeKey: url,
    priority: FOUNDATION_URL_PRIORITY,
  });
}

export async function enqueueContractTokenIngest(
  client: DatabaseClient,
  input: {
    chainId?: number;
    contractAddress: string;
    tokenId: string;
    priority?: number;
    backupPriority?: number;
  },
) {
  const normalizedAddress = normalizeAddress(input.contractAddress);

  return queueJob(client, {
    kind: QueueJobKind.INGEST_CONTRACT_TOKEN,
    payload: {
      chainId: input.chainId ?? 1,
      contractAddress: normalizedAddress,
      tokenId: input.tokenId,
      backupPriority: input.backupPriority,
    },
    dedupeKey: `${normalizedAddress}:${input.tokenId}`,
    priority: input.priority ?? CONTRACT_TOKEN_PRIORITY,
  });
}

export async function queueArtworkBackup({
  client,
  artworkId,
  priority = BACKUP_PRIORITY,
  availableAt,
}: {
  client: DatabaseClient;
  artworkId: string;
  priority?: number;
  availableAt?: Date;
}) {
  return queueJob(client, {
    kind: QueueJobKind.BACKUP_ARTWORK,
    payload: { artworkId },
    dedupeKey: artworkId,
    priority,
    availableAt,
  });
}

export async function countJobsAhead(
  client: DatabaseClient,
  job: Pick<QueueJob, "id" | "priority" | "availableAt" | "createdAt">,
) {
  return client.queueJob.count({
    where: {
      id: {
        not: job.id,
      },
      status: {
        in: [QueueJobStatus.PENDING, QueueJobStatus.RUNNING],
      },
      OR: [
        {
          priority: {
            gt: job.priority,
          },
        },
        {
          priority: job.priority,
          availableAt: {
            lt: job.availableAt,
          },
        },
        {
          priority: job.priority,
          availableAt: job.availableAt,
          createdAt: {
            lt: job.createdAt,
          },
        },
      ],
    },
  });
}

export {
  finalizeJobDeferred,
  finalizeJobFailure,
  finalizeJobSuccess,
  markJobRunning,
  recoverStaleRunningJobs,
} from "./queue-state";

type ActiveJobSummary = {
  id: string;
  kind: QueueJobKind;
  status: QueueJobStatus;
  priority: number;
  dedupeKey: string | null;
  availableAt: Date | null;
  createdAt: Date;
};

type RebalanceAnalysis = {
  queueBudget: number;
  protectedReadyJobs: ActiveJobSummary[];
  automaticRunningJobs: ActiveJobSummary[];
  automaticReadyPendingJobs: ActiveJobSummary[];
  delayedPendingJobs: number;
  automaticPendingTarget: number;
  overflowPendingJobs: ActiveJobSummary[];
  readyPendingJobs: number;
  refillResumeThreshold: number;
  activeDedupeKeys: Set<string>;
};

function isReadyPendingJob(
  job: Pick<ActiveJobSummary, "status" | "availableAt">,
  now = Date.now(),
) {
  return (
    job.status === QueueJobStatus.PENDING &&
    (job.availableAt?.getTime() ?? 0) <= now
  );
}

async function fetchActiveJobs(client: DatabaseClient) {
  return client.queueJob.findMany({
    where: {
      status: {
        in: [QueueJobStatus.PENDING, QueueJobStatus.RUNNING],
      },
    },
    select: {
      id: true,
      kind: true,
      status: true,
      priority: true,
      dedupeKey: true,
      availableAt: true,
      createdAt: true,
    },
    orderBy: [
      { priority: "desc" },
      { availableAt: "asc" },
      { createdAt: "asc" },
    ],
  });
}

async function blockedArtworkIdsForSmartBudget(args: {
  client: DatabaseClient;
  artworkIds: string[];
  smartPinMaxBytes: number;
}) {
  const { client, artworkIds, smartPinMaxBytes } = args;
  if (artworkIds.length === 0) {
    return new Set<string>();
  }

  const artworks = await client.artwork.findMany({
    where: {
      id: {
        in: artworkIds,
      },
    },
    select: {
      id: true,
      metadataRoot: {
        select: SMART_BUDGET_ROOT_SELECT,
      },
      mediaRoot: {
        select: SMART_BUDGET_ROOT_SELECT,
      },
    },
  });

  return new Set(
    artworks
      .filter((artwork) =>
        artworkBlockedBySmartBudget(artwork, smartPinMaxBytes),
      )
      .map((artwork) => artwork.id),
  );
}

async function parkBlockedAutomaticBackupJobs(args: {
  client: DatabaseClient;
  activeJobs: ActiveJobSummary[];
  smartPinMaxBytes: number;
}) {
  const { client, activeJobs, smartPinMaxBytes } = args;
  const automaticPendingJobs = activeJobs.filter(
    (job) =>
      job.kind === QueueJobKind.BACKUP_ARTWORK &&
      job.status === QueueJobStatus.PENDING &&
      job.priority <= BACKUP_PRIORITY &&
      Boolean(job.dedupeKey),
  );

  if (automaticPendingJobs.length === 0) {
    return 0;
  }

  const blockedArtworkIds = await blockedArtworkIdsForSmartBudget({
    client,
    artworkIds: automaticPendingJobs
      .map((job) => job.dedupeKey)
      .filter((value): value is string => Boolean(value)),
    smartPinMaxBytes,
  });

  const blockedJobIds = automaticPendingJobs
    .filter((job) => job.dedupeKey && blockedArtworkIds.has(job.dedupeKey))
    .map((job) => job.id);

  if (blockedJobIds.length === 0) {
    return 0;
  }

  await client.queueJob.updateMany({
    where: {
      id: {
        in: blockedJobIds,
      },
      status: QueueJobStatus.PENDING,
    },
    data: {
      status: QueueJobStatus.CANCELLED,
      finishedAt: new Date(),
      lastError: null,
    },
  });

  return blockedJobIds.length;
}

function analyseRebalance(
  policy: Awaited<ReturnType<typeof getArchivePolicyState>>,
  activeJobs: ActiveJobSummary[],
): RebalanceAnalysis {
  const now = Date.now();
  const queueBudget = archivePaceConfigForContractsPerTick(
    policy.contractsPerTick,
  ).maxPendingJobs;

  const protectedJobs = activeJobs.filter(
    (job) =>
      job.kind !== QueueJobKind.BACKUP_ARTWORK ||
      job.priority > BACKUP_PRIORITY,
  );
  const automaticBackupJobs = activeJobs.filter(
    (job) =>
      job.kind === QueueJobKind.BACKUP_ARTWORK &&
      job.priority <= BACKUP_PRIORITY,
  );
  const automaticRunningJobs = automaticBackupJobs.filter(
    (job) => job.status === QueueJobStatus.RUNNING,
  );
  const automaticPendingJobs = automaticBackupJobs.filter(
    (job) => job.status === QueueJobStatus.PENDING,
  );
  const protectedReadyJobs = protectedJobs.filter(
    (job) =>
      job.status === QueueJobStatus.RUNNING || isReadyPendingJob(job, now),
  );
  const automaticReadyPendingJobs = automaticPendingJobs.filter((job) =>
    isReadyPendingJob(job, now),
  );
  const delayedPendingJobs = activeJobs.filter(
    (job) =>
      job.status === QueueJobStatus.PENDING && !isReadyPendingJob(job, now),
  ).length;

  const automaticPendingTarget = Math.max(
    queueBudget - protectedReadyJobs.length - automaticRunningJobs.length,
    0,
  );
  const overflowPendingJobs = automaticReadyPendingJobs.slice(
    automaticPendingTarget,
  );
  const readyPendingJobs = activeJobs.filter((job) =>
    isReadyPendingJob(job, now),
  ).length;
  const refillResumeThreshold = Math.max(
    queueBudget - policy.discoveryPerPage,
    0,
  );

  const activeDedupeKeys = new Set(
    activeJobs
      .map((job) => job.dedupeKey)
      .filter((value): value is string => Boolean(value)),
  );

  return {
    queueBudget,
    protectedReadyJobs,
    automaticRunningJobs,
    automaticReadyPendingJobs,
    delayedPendingJobs,
    automaticPendingTarget,
    overflowPendingJobs,
    readyPendingJobs,
    refillResumeThreshold,
    activeDedupeKeys,
  };
}

function refillCandidateOr(failedRetryCutoff: Date) {
  const candidates: Prisma.ArtworkWhereInput[] = [
    {
      metadataRootId: { not: null },
      metadataStatus: {
        equals: BackupStatus.PENDING,
      },
    },
    {
      mediaRootId: { not: null },
      mediaStatus: {
        equals: BackupStatus.PENDING,
      },
    },
    {
      metadataRootId: { not: null },
      metadataStatus: BackupStatus.FAILED,
      metadataRoot: {
        is: {
          updatedAt: {
            lte: failedRetryCutoff,
          },
        },
      },
    },
    {
      mediaRootId: { not: null },
      mediaStatus: BackupStatus.FAILED,
      mediaRoot: {
        is: {
          updatedAt: {
            lte: failedRetryCutoff,
          },
        },
      },
    },
  ];

  if (!archivePinningEnabled()) {
    return candidates;
  }

  candidates.push(
    {
      metadataRootId: { not: null },
      metadataStatus: BackupStatus.DOWNLOADED,
      metadataRoot: {
        is: {
          pinStatus: {
            not: BackupStatus.PINNED,
          },
        },
      },
    },
    {
      mediaRootId: { not: null },
      mediaStatus: BackupStatus.DOWNLOADED,
      mediaRoot: {
        is: {
          pinStatus: {
            not: BackupStatus.PINNED,
          },
        },
      },
    },
  );

  return candidates;
}

async function refillAutomaticBackups(args: {
  client: DatabaseClient;
  refillSlots: number;
  activeDedupeKeys: Set<string>;
  smartPinMaxBytes: number;
}) {
  const { client, refillSlots, activeDedupeKeys, smartPinMaxBytes } = args;
  if (refillSlots <= 0) return 0;
  const failedRetryCutoff = new Date(
    Date.now() - FAILED_ROOT_RETRY_COOLDOWN_MS,
  );

  const candidateArtworks = await client.artwork.findMany({
    where: {
      OR: refillCandidateOr(failedRetryCutoff),
    },
    select: {
      id: true,
      metadataRoot: {
        select: SMART_BUDGET_ROOT_SELECT,
      },
      mediaRoot: {
        select: SMART_BUDGET_ROOT_SELECT,
      },
    },
    orderBy: [{ lastIndexedAt: "asc" }, { createdAt: "asc" }],
    take: Math.min(Math.max(refillSlots * 256, 1_024), 10_000),
  });

  const orderedCandidates = candidateArtworks
    .map((artwork) => ({
      artwork,
      priority: nextProcessableRootPriority(artwork, smartPinMaxBytes),
    }))
    .filter((entry) => entry.priority.rank < 2)
    .sort((left, right) => {
      const rankGap = left.priority.rank - right.priority.rank;
      if (rankGap !== 0) {
        return rankGap;
      }

      const sizeGap = left.priority.size - right.priority.size;
      if (sizeGap !== 0) {
        return sizeGap;
      }

      return 0;
    });

  let refilledCount = 0;
  for (const { artwork } of orderedCandidates) {
    if (activeDedupeKeys.has(artwork.id)) continue;
    if (artworkBlockedBySmartBudget(artwork, smartPinMaxBytes)) continue;

    await queueArtworkBackup({
      client,
      artworkId: artwork.id,
      priority: BACKUP_PRIORITY,
    });
    activeDedupeKeys.add(artwork.id);
    refilledCount += 1;

    if (refilledCount >= refillSlots) break;
  }

  return refilledCount;
}

export async function rebalanceAutomaticBackupQueue(client: DatabaseClient) {
  const policy = await getArchivePolicyState(client);
  const initialActiveJobs = await fetchActiveJobs(client);
  const parkedBlockedJobs = await parkBlockedAutomaticBackupJobs({
    client,
    activeJobs: initialActiveJobs,
    smartPinMaxBytes: policy.smartPinMaxBytes,
  });
  const activeJobs =
    parkedBlockedJobs > 0 ? await fetchActiveJobs(client) : initialActiveJobs;
  const analysis = analyseRebalance(policy, activeJobs);
  const {
    queueBudget,
    protectedReadyJobs,
    automaticRunningJobs,
    automaticReadyPendingJobs,
    delayedPendingJobs,
    automaticPendingTarget,
    overflowPendingJobs,
    readyPendingJobs,
    refillResumeThreshold,
    activeDedupeKeys,
  } = analysis;

  if (overflowPendingJobs.length > 0) {
    await client.queueJob.deleteMany({
      where: {
        id: {
          in: overflowPendingJobs.map((job) => job.id),
        },
      },
    });
  }

  const automaticActiveCount =
    automaticRunningJobs.length +
    Math.min(automaticReadyPendingJobs.length, automaticPendingTarget);
  const refillSlots =
    readyPendingJobs <= refillResumeThreshold
      ? Math.max(
          queueBudget - protectedReadyJobs.length - automaticActiveCount,
          0,
        )
      : 0;

  const refilledCount = await refillAutomaticBackups({
    client,
    refillSlots,
    activeDedupeKeys,
    smartPinMaxBytes: policy.smartPinMaxBytes,
  });

  if (
    overflowPendingJobs.length > 0 ||
    refilledCount > 0 ||
    parkedBlockedJobs > 0
  ) {
    await emitArchiveEvent(client, {
      type: "queue.backlog-rebalanced",
      summary:
        parkedBlockedJobs > 0
          ? `Parked ${parkedBlockedJobs} oversized backup job${parkedBlockedJobs === 1 ? "" : "s"} until a later smart-pin tier opens.`
          : overflowPendingJobs.length > 0
            ? `Rebalanced the automatic queue: kept ${automaticPendingTarget} active backup jobs and deferred ${overflowPendingJobs.length}.`
            : `Topped the automatic queue back up with ${refilledCount} backup job${refilledCount === 1 ? "" : "s"}.`,
      data: {
        queueBudget,
        protectedJobs: protectedReadyJobs.length,
        readyPendingJobs,
        delayedPendingJobs,
        refillResumeThreshold,
        automaticPendingTarget,
        parkedBlockedJobs,
        trimmedAutomaticJobs: overflowPendingJobs.length,
        refilledAutomaticJobs: refilledCount,
      },
    });
  }

  return {
    queueBudget,
    protectedJobs: protectedReadyJobs.length,
    totalPendingJobs: readyPendingJobs + delayedPendingJobs,
    refillResumeThreshold,
    automaticPendingTarget,
    parkedBlockedJobs,
    trimmedAutomaticJobs: overflowPendingJobs.length,
    refilledAutomaticJobs: refilledCount,
  };
}
