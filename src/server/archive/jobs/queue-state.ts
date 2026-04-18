import { type QueueJob, QueueJobStatus } from "~/server/prisma-client";
import { emitArchiveEvent } from "~/server/archive/live-events";
import { type DatabaseClient } from "./shared";

export async function markJobRunning(client: DatabaseClient, job: QueueJob) {
  const claim = await client.queueJob.updateMany({
    where: {
      id: job.id,
      status: QueueJobStatus.PENDING,
    },
    data: {
      status: QueueJobStatus.RUNNING,
      startedAt: new Date(),
      attempts: {
        increment: 1,
      },
      lastError: null,
    },
  });

  if (claim.count === 0) return null;

  const runningJob = await client.queueJob.findUnique({
    where: { id: job.id },
  });

  if (!runningJob) return null;

  await emitArchiveEvent(client, {
    type: "queue.job-running",
    summary: `Started ${runningJob.kind.toLowerCase()} on the server worker.`,
    data: {
      jobId: runningJob.id,
      kind: runningJob.kind,
      attempts: runningJob.attempts,
      priority: runningJob.priority,
    },
  });

  return runningJob;
}

const STALE_RUNNING_JOB_MS = 10 * 60 * 1000;

type RunningJobRecoveryReason = "stale" | "unavailable-worker";

function recoverySummary(
  job: QueueJob,
  exhausted: boolean,
  reason: RunningJobRecoveryReason,
) {
  if (reason === "unavailable-worker") {
    return exhausted
      ? `${job.kind.toLowerCase()} was marked failed after the saver went offline.`
      : `${job.kind.toLowerCase()} was re-queued after the saver went offline.`;
  }

  return exhausted
    ? `${job.kind.toLowerCase()} was marked failed after stalling on the server worker.`
    : `${job.kind.toLowerCase()} was recovered after stalling on the server worker.`;
}

async function applyRunningJobRecovery(
  client: DatabaseClient,
  job: QueueJob,
  input: {
    message: string;
    reason: RunningJobRecoveryReason;
  },
) {
  const exhausted = job.attempts >= job.maxAttempts;
  const message = job.lastError ?? input.message;

  const updated = await client.queueJob.updateMany({
    where: {
      id: job.id,
      status: QueueJobStatus.RUNNING,
    },
    data: exhausted
      ? {
          status: QueueJobStatus.FAILED,
          finishedAt: new Date(),
          lastError: message,
        }
      : {
          status: QueueJobStatus.PENDING,
          availableAt: new Date(),
          startedAt: null,
          finishedAt: null,
          lastError: message,
        },
  });

  if (updated.count === 0) return;

  await emitArchiveEvent(client, {
    type: exhausted ? "queue.job-failed" : "queue.job-recovered",
    summary: recoverySummary(job, exhausted, input.reason),
    data: {
      jobId: job.id,
      kind: job.kind,
      attempts: job.attempts,
      exhausted,
    },
  });
}

export async function recoverStaleRunningJobs(client: DatabaseClient) {
  const cutoff = new Date(Date.now() - STALE_RUNNING_JOB_MS);
  const staleJobs = await client.queueJob.findMany({
    where: {
      status: QueueJobStatus.RUNNING,
      startedAt: {
        lte: cutoff,
      },
    },
    orderBy: [{ startedAt: "asc" }],
    take: 100,
  });

  for (const job of staleJobs) {
    await applyRunningJobRecovery(client, job, {
      message:
        "Recovered a stale running job after the archive worker was interrupted.",
      reason: "stale",
    });
  }

  return staleJobs.length;
}

export async function recoverRunningJobsForUnavailableWorker(
  client: DatabaseClient,
  input: {
    limit?: number;
    message?: string;
  } = {},
) {
  const runningJobs = await client.queueJob.findMany({
    where: {
      status: QueueJobStatus.RUNNING,
    },
    orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
    take: input.limit ?? 100,
  });

  for (const job of runningJobs) {
    await applyRunningJobRecovery(client, job, {
      message:
        input.message ??
        "Recovered a running job after the archive saver stopped sending heartbeats.",
      reason: "unavailable-worker",
    });
  }

  return runningJobs.length;
}

export async function finalizeJobSuccess(
  client: DatabaseClient,
  jobId: string,
) {
  const updated = await client.queueJob.updateMany({
    where: {
      id: jobId,
      status: QueueJobStatus.RUNNING,
    },
    data: {
      status: QueueJobStatus.COMPLETED,
      finishedAt: new Date(),
    },
  });

  if (updated.count === 0) return null;

  const completedJob = await client.queueJob.findUnique({
    where: { id: jobId },
  });

  if (!completedJob) return null;

  await emitArchiveEvent(client, {
    type: "queue.job-completed",
    summary: `Completed ${completedJob.kind.toLowerCase()} on the server worker.`,
    data: {
      jobId: completedJob.id,
      kind: completedJob.kind,
      priority: completedJob.priority,
    },
  });

  return completedJob;
}

export async function finalizeJobDeferred(
  client: DatabaseClient,
  job: QueueJob,
  input: {
    availableAt: Date;
    message: string;
    retainJob?: boolean;
  },
) {
  const existingJob = await client.queueJob.findUnique({
    where: { id: job.id },
  });

  if (!existingJob) return null;

  const updated = await client.queueJob.updateMany({
    where: {
      id: job.id,
      status: QueueJobStatus.RUNNING,
    },
    data: input.retainJob
      ? {
          status: QueueJobStatus.PENDING,
          availableAt: input.availableAt,
          startedAt: null,
          finishedAt: null,
          attempts: Math.max(job.attempts - 1, 0),
          lastError: null,
        }
      : {
          status: QueueJobStatus.CANCELLED,
          availableAt: input.availableAt,
          finishedAt: new Date(),
          lastError: null,
        },
  });

  if (updated.count === 0) return null;

  const deferredJob = await client.queueJob.findUnique({
    where: { id: job.id },
  });

  if (!deferredJob) return null;

  await emitArchiveEvent(client, {
    type: "queue.job-deferred",
    summary: input.message,
    data: {
      jobId: deferredJob.id,
      kind: deferredJob.kind,
      priority: deferredJob.priority,
      availableAt: input.availableAt.toISOString(),
    },
  });

  return deferredJob;
}

export async function finalizeJobFailure(
  client: DatabaseClient,
  job: QueueJob,
  error: unknown,
) {
  const message =
    error instanceof Error ? error.message : "Unknown queue error";
  const exhausted = job.attempts >= job.maxAttempts;

  const updated = await client.queueJob.updateMany({
    where: {
      id: job.id,
      status: QueueJobStatus.RUNNING,
    },
    data: exhausted
      ? {
          status: QueueJobStatus.FAILED,
          finishedAt: new Date(),
          lastError: message,
        }
      : {
          status: QueueJobStatus.PENDING,
          availableAt: new Date(Date.now() + 60_000),
          startedAt: null,
          lastError: message,
        },
  });

  if (updated.count === 0) return null;

  const failedJob = await client.queueJob.findUnique({
    where: { id: job.id },
  });

  if (!failedJob) return null;

  await emitArchiveEvent(client, {
    type: exhausted ? "queue.job-failed" : "queue.job-retry-scheduled",
    summary: exhausted
      ? `${job.kind.toLowerCase()} failed: ${message}`
      : `${job.kind.toLowerCase()} hit an error and will retry.`,
    data: {
      jobId: failedJob.id,
      kind: failedJob.kind,
      error: message,
      exhausted,
    },
  });

  return failedJob;
}
