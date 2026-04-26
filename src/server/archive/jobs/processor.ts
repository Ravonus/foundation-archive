import {
  type QueueJob,
  QueueJobKind,
  QueueJobStatus,
} from "~/server/prisma-client";
import {
  backupArtworkJobPayloadSchema,
  foundationJobPayloadSchema,
  ingestContractTokenJobPayloadSchema,
} from "~/server/archive/schemas";
import { foundationLiveLookupsEnabled } from "~/server/archive/foundation-live";
import {
  BACKUP_PRIORITY,
  type DatabaseClient,
  shouldBypassSmartBudget,
} from "./shared";
import { getArchivePolicyState } from "~/server/archive/state";
import {
  finalizeJobDeferred,
  finalizeJobFailure,
  finalizeJobSuccess,
  markJobRunning,
  recoverStaleRunningJobs,
} from "./queue";
import { backupArtwork } from "./backup";
import {
  artworkNeedsOnlyFailedRootRepair,
  artworkBlockedBySmartBudget,
  type SmartBudgetArtworkSnapshot,
  unsatisfiedSmartBudgetRootIds,
} from "./smart-budget";
import {
  ingestContractToken,
  ingestFoundationMintUrl,
  scanContractTokens,
} from "./ingest";

const FAILED_REPAIR_JOBS_PER_BATCH_FRACTION = 0.25;

async function processSingleJob(client: DatabaseClient, job: QueueJob) {
  switch (job.kind) {
    case QueueJobKind.INGEST_FOUNDATION_URL: {
      const payload = foundationJobPayloadSchema.parse(
        JSON.parse(job.payload) as unknown,
      );
      if (!foundationLiveLookupsEnabled()) {
        return {
          skipped: true,
          reason:
            "Foundation URL ingest skipped because Foundation live lookups are disabled.",
          url: payload.url,
        };
      }

      return ingestFoundationMintUrl(
        client,
        payload.url,
        payload.backupPriority ?? BACKUP_PRIORITY,
      );
    }

    case QueueJobKind.INGEST_CONTRACT_TOKEN: {
      const payload = ingestContractTokenJobPayloadSchema.parse(
        JSON.parse(job.payload) as unknown,
      );
      return ingestContractToken(client, payload);
    }

    case QueueJobKind.BACKUP_ARTWORK: {
      const payload = backupArtworkJobPayloadSchema.parse(
        JSON.parse(job.payload) as unknown,
      );
      return backupArtwork(client, payload.artworkId, {
        bypassSmartBudget: shouldBypassSmartBudget(job.priority),
      });
    }

    case QueueJobKind.SCAN_CONTRACT_TOKENS: {
      return scanContractTokens(client, job.payload);
    }

    case QueueJobKind.VERIFY_ROOT:
      return {
        skipped: true,
        reason: "Root verification is reserved for the next worker pass.",
      };
  }
}

type JobResult = {
  jobId: string;
  kind: QueueJobKind;
  status: "completed" | "failed" | "deferred";
  message: string;
};

async function runJob(args: {
  client: DatabaseClient;
  job: QueueJob;
  runningJob: QueueJob;
}): Promise<JobResult> {
  const { client, job, runningJob } = args;
  try {
    const outcome = await processSingleJob(client, runningJob);

    if (
      outcome &&
      typeof outcome === "object" &&
      "outcome" in outcome &&
      outcome.outcome === "deferred"
    ) {
      await finalizeJobDeferred(client, job, {
        availableAt: outcome.availableAt,
        message: outcome.message,
        retainJob: outcome.retainJob,
      });
      return {
        jobId: runningJob.id,
        kind: runningJob.kind,
        status: "deferred",
        message: outcome.message,
      };
    }

    await finalizeJobSuccess(client, runningJob.id);
    return {
      jobId: runningJob.id,
      kind: runningJob.kind,
      status: "completed",
      message: "Processed successfully",
    };
  } catch (error) {
    await finalizeJobFailure(client, runningJob, error);
    return {
      jobId: runningJob.id,
      kind: runningJob.kind,
      status: "failed",
      message: error instanceof Error ? error.message : "Unknown queue error",
    };
  }
}

function budgetArtworkIdForJob(job: QueueJob) {
  if (
    job.kind !== QueueJobKind.BACKUP_ARTWORK ||
    shouldBypassSmartBudget(job.priority)
  ) {
    return null;
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(job.payload) as unknown;
  } catch {
    return null;
  }

  const payload = backupArtworkJobPayloadSchema.safeParse(parsedPayload);
  return payload.success ? payload.data.artworkId : null;
}

async function loadSmartBudgetArtworks(
  client: DatabaseClient,
  jobs: QueueJob[],
) {
  const artworkIds = Array.from(
    new Set(
      jobs
        .map((job) => budgetArtworkIdForJob(job))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (artworkIds.length === 0) {
    return new Map<string, SmartBudgetArtworkSnapshot>();
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
        select: {
          id: true,
          backupStatus: true,
          pinStatus: true,
          localDirectory: true,
          estimatedByteSize: true,
          byteSize: true,
        },
      },
      mediaRoot: {
        select: {
          id: true,
          backupStatus: true,
          pinStatus: true,
          localDirectory: true,
          estimatedByteSize: true,
          byteSize: true,
        },
      },
    },
  });

  return new Map<string, SmartBudgetArtworkSnapshot>(
    artworks.map((artwork) => [artwork.id, artwork]),
  );
}

async function selectProcessableJobs(client: DatabaseClient, limit: number) {
  const sampleSize = Math.max(limit * 24, 96);
  const jobs = await client.queueJob.findMany({
    where: {
      status: QueueJobStatus.PENDING,
      availableAt: {
        lte: new Date(),
      },
    },
    orderBy: [
      { priority: "desc" },
      { availableAt: "asc" },
      { createdAt: "asc" },
    ],
    take: sampleSize,
  });

  if (jobs.length === 0) {
    return [];
  }

  const [policy, artworkById] = await Promise.all([
    getArchivePolicyState(client),
    loadSmartBudgetArtworks(client, jobs),
  ]);
  const selected: QueueJob[] = [];
  const selectedRootIds = new Set<string>();
  const failedRepairLimit = Math.max(
    1,
    Math.floor(limit * FAILED_REPAIR_JOBS_PER_BATCH_FRACTION),
  );
  let selectedFailedRepairJobs = 0;

  for (const job of jobs) {
    if (selected.length >= limit) break;

    const artworkId = budgetArtworkIdForJob(job);
    const artwork = artworkId ? (artworkById.get(artworkId) ?? null) : null;
    const failedRepairJob = artworkNeedsOnlyFailedRootRepair(artwork);
    if (failedRepairJob && selectedFailedRepairJobs >= failedRepairLimit) {
      continue;
    }

    if (artworkBlockedBySmartBudget(artwork, policy.smartPinMaxBytes)) {
      continue;
    }

    const rootIds = unsatisfiedSmartBudgetRootIds(artwork);
    if (rootIds.some((rootId) => selectedRootIds.has(rootId))) {
      continue;
    }

    for (const rootId of rootIds) selectedRootIds.add(rootId);
    if (failedRepairJob) selectedFailedRepairJobs += 1;
    selected.push(job);
  }

  return selected;
}

export async function processQueuedJobs(client: DatabaseClient, limit = 10) {
  await recoverStaleRunningJobs(client);

  const jobs = await selectProcessableJobs(client, limit);

  const claimedJobs = (
    await Promise.all(
      jobs.map(async (job) => {
        const runningJob = await markJobRunning(client, job);
        if (!runningJob) return null;

        return {
          job,
          runningJob,
        };
      }),
    )
  ).filter(
    (
      value,
    ): value is {
      job: QueueJob;
      runningJob: QueueJob;
    } => value !== null,
  );

  const results = await Promise.all(
    claimedJobs.map(({ job, runningJob }) =>
      runJob({ client, job, runningJob }),
    ),
  );

  return {
    processed: results.length,
    results,
  };
}
