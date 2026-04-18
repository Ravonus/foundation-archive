import { type QueueJob, QueueJobKind, QueueJobStatus } from "~/server/prisma-client";
import {
  backupArtworkJobPayloadSchema,
  foundationJobPayloadSchema,
  ingestContractTokenJobPayloadSchema,
} from "~/server/archive/schemas";
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
import { artworkBlockedBySmartBudget } from "./smart-budget";
import {
  ingestContractToken,
  ingestFoundationMintUrl,
  scanContractTokens,
} from "./ingest";

async function processSingleJob(client: DatabaseClient, job: QueueJob) {
  switch (job.kind) {
    case QueueJobKind.INGEST_FOUNDATION_URL: {
      const payload = foundationJobPayloadSchema.parse(
        JSON.parse(job.payload) as unknown,
      );
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

async function jobBlockedBySmartBudget(args: {
  client: DatabaseClient;
  job: QueueJob;
  smartPinMaxBytes: number;
}) {
  const { client, job, smartPinMaxBytes } = args;

  if (
    job.kind !== QueueJobKind.BACKUP_ARTWORK ||
    shouldBypassSmartBudget(job.priority)
  ) {
    return false;
  }

  const payload = backupArtworkJobPayloadSchema.parse(
    JSON.parse(job.payload) as unknown,
  );
  const artwork = await client.artwork.findUnique({
    where: { id: payload.artworkId },
    select: {
      metadataRoot: {
        select: {
          backupStatus: true,
          pinStatus: true,
          localDirectory: true,
          estimatedByteSize: true,
          byteSize: true,
        },
      },
      mediaRoot: {
        select: {
          backupStatus: true,
          pinStatus: true,
          localDirectory: true,
          estimatedByteSize: true,
          byteSize: true,
        },
      },
    },
  });

  if (!artwork) {
    return false;
  }

  return artworkBlockedBySmartBudget(artwork, smartPinMaxBytes);
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

  const policy = await getArchivePolicyState(client);
  const selected: QueueJob[] = [];

  for (const job of jobs) {
    if (selected.length >= limit) break;

    if (
      await jobBlockedBySmartBudget({
        client,
        job,
        smartPinMaxBytes: policy.smartPinMaxBytes,
      })
    ) {
      continue;
    }

    selected.push(job);
  }

  return selected;
}

export async function processQueuedJobs(
  client: DatabaseClient,
  limit = 10,
) {
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
