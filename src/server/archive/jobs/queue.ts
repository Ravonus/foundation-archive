import {
  BackupStatus,
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
  type DatabaseClient,
  FOUNDATION_URL_PRIORITY,
  normalizeAddress,
} from "./shared";

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

async function createNewQueueJob(
  client: DatabaseClient,
  input: QueueJobInput,
) {
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

export async function queueJob(
  client: DatabaseClient,
  input: QueueJobInput,
) {
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
  protectedJobs: ActiveJobSummary[];
  automaticRunningJobs: ActiveJobSummary[];
  automaticPendingJobs: ActiveJobSummary[];
  automaticPendingTarget: number;
  overflowPendingJobs: ActiveJobSummary[];
  totalPendingJobs: number;
  refillResumeThreshold: number;
  activeDedupeKeys: Set<string>;
};

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
    orderBy: [{ priority: "desc" }, { availableAt: "asc" }, { createdAt: "asc" }],
  });
}

async function analyseRebalance(
  client: DatabaseClient,
): Promise<RebalanceAnalysis> {
  const policy = await getArchivePolicyState(client);
  const queueBudget = archivePaceConfigForContractsPerTick(
    policy.contractsPerTick,
  ).maxPendingJobs;

  const activeJobs = await fetchActiveJobs(client);

  const protectedJobs = activeJobs.filter(
    (job) =>
      job.kind !== QueueJobKind.BACKUP_ARTWORK || job.priority > BACKUP_PRIORITY,
  );
  const automaticBackupJobs = activeJobs.filter(
    (job) =>
      job.kind === QueueJobKind.BACKUP_ARTWORK && job.priority <= BACKUP_PRIORITY,
  );
  const automaticRunningJobs = automaticBackupJobs.filter(
    (job) => job.status === QueueJobStatus.RUNNING,
  );
  const automaticPendingJobs = automaticBackupJobs.filter(
    (job) => job.status === QueueJobStatus.PENDING,
  );

  const automaticPendingTarget = Math.max(
    queueBudget - protectedJobs.length - automaticRunningJobs.length,
    0,
  );
  const overflowPendingJobs = automaticPendingJobs.slice(automaticPendingTarget);
  const totalPendingJobs = activeJobs.filter(
    (job) => job.status === QueueJobStatus.PENDING,
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
    protectedJobs,
    automaticRunningJobs,
    automaticPendingJobs,
    automaticPendingTarget,
    overflowPendingJobs,
    totalPendingJobs,
    refillResumeThreshold,
    activeDedupeKeys,
  };
}

async function refillAutomaticBackups(args: {
  client: DatabaseClient;
  refillSlots: number;
  activeDedupeKeys: Set<string>;
}) {
  const { client, refillSlots, activeDedupeKeys } = args;
  if (refillSlots <= 0) return 0;

  const candidateArtworks = await client.artwork.findMany({
    where: {
      OR: [
        {
          metadataRootId: { not: null },
          metadataStatus: {
            in: [BackupStatus.PENDING, BackupStatus.FAILED],
          },
        },
        {
          mediaRootId: { not: null },
          mediaStatus: {
            in: [BackupStatus.PENDING, BackupStatus.FAILED],
          },
        },
      ],
    },
    select: { id: true },
    orderBy: [{ lastIndexedAt: "asc" }, { createdAt: "asc" }],
    take: Math.min(Math.max(refillSlots * 8, 96), 2_000),
  });

  let refilledCount = 0;
  for (const artwork of candidateArtworks) {
    if (activeDedupeKeys.has(artwork.id)) continue;

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
  const analysis = await analyseRebalance(client);
  const {
    queueBudget,
    protectedJobs,
    automaticRunningJobs,
    automaticPendingJobs,
    automaticPendingTarget,
    overflowPendingJobs,
    totalPendingJobs,
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
    Math.min(automaticPendingJobs.length, automaticPendingTarget);
  const refillSlots =
    totalPendingJobs <= refillResumeThreshold
      ? Math.max(queueBudget - protectedJobs.length - automaticActiveCount, 0)
      : 0;

  const refilledCount = await refillAutomaticBackups({
    client,
    refillSlots,
    activeDedupeKeys,
  });

  if (overflowPendingJobs.length > 0 || refilledCount > 0) {
    await emitArchiveEvent(client, {
      type: "queue.backlog-rebalanced",
      summary:
        overflowPendingJobs.length > 0
          ? `Rebalanced the automatic queue: kept ${automaticPendingTarget} active backup jobs and deferred ${overflowPendingJobs.length}.`
          : `Topped the automatic queue back up with ${refilledCount} backup job${refilledCount === 1 ? "" : "s"}.`,
      data: {
        queueBudget,
        protectedJobs: protectedJobs.length,
        totalPendingJobs,
        refillResumeThreshold,
        automaticPendingTarget,
        trimmedAutomaticJobs: overflowPendingJobs.length,
        refilledAutomaticJobs: refilledCount,
      },
    });
  }

  return {
    queueBudget,
    protectedJobs: protectedJobs.length,
    totalPendingJobs,
    refillResumeThreshold,
    automaticPendingTarget,
    trimmedAutomaticJobs: overflowPendingJobs.length,
    refilledAutomaticJobs: refilledCount,
  };
}
