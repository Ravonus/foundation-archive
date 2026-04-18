import { Client } from "pg";

import { archivePaceConfigForContractsPerTick } from "~/lib/archive-pace";
import { ARCHIVE_WORKER_FRESH_MS } from "~/lib/archive-live";
import { env } from "~/env";
import { getArchivePolicyState } from "~/server/archive/state";
import {
  QueueJobStatus,
  type PrismaClient,
  type WorkerHeartbeat,
} from "~/server/prisma-client";

import { recoverRunningJobsForUnavailableWorker } from "./jobs/queue-state";
import { readLatestWorkerHeartbeat, runWorkerCycle } from "./worker";

type DatabaseClient = PrismaClient;

const WATCHDOG_LOCK_FIRST_KEY = 6_144;
const WATCHDOG_LOCK_SECOND_KEY = 31_815;

function workerSeenRecently(
  worker: Pick<WorkerHeartbeat, "lastSeenAt"> | null,
  now = Date.now(),
) {
  return Boolean(
    worker?.lastSeenAt &&
    now - worker.lastSeenAt.getTime() < ARCHIVE_WORKER_FRESH_MS,
  );
}

function workerActivelyRunning(worker: WorkerHeartbeat | null) {
  return workerSeenRecently(worker) && worker?.status === "RUNNING";
}

async function withWatchdogLock<T>(
  callback: () => Promise<T>,
): Promise<T | null> {
  const lockClient = new Client({
    connectionString: env.DATABASE_URL,
  });

  await lockClient.connect();

  try {
    const result = await lockClient.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1, $2) AS locked",
      [WATCHDOG_LOCK_FIRST_KEY, WATCHDOG_LOCK_SECOND_KEY],
    );

    if (!result.rows[0]?.locked) {
      return null;
    }

    return await callback();
  } finally {
    try {
      await lockClient.query("SELECT pg_advisory_unlock($1, $2)", [
        WATCHDOG_LOCK_FIRST_KEY,
        WATCHDOG_LOCK_SECOND_KEY,
      ]);
    } finally {
      await lockClient.end();
    }
  }
}

export async function maybeRecoverArchivePipeline(client: DatabaseClient) {
  const [latestWorker, pendingJobs, runningJobs] = await Promise.all([
    readLatestWorkerHeartbeat(client),
    client.queueJob.count({ where: { status: QueueJobStatus.PENDING } }),
    client.queueJob.count({ where: { status: QueueJobStatus.RUNNING } }),
  ]);

  if (pendingJobs === 0 && runningJobs === 0) {
    return {
      recovered: false,
      reason: "idle" as const,
    };
  }

  if (workerActivelyRunning(latestWorker)) {
    return {
      recovered: false,
      reason: "worker-active" as const,
    };
  }

  const result = await withWatchdogLock(async () => {
    const [lockedWorker, lockedPendingJobs, lockedRunningJobs, policy] =
      await Promise.all([
        readLatestWorkerHeartbeat(client),
        client.queueJob.count({ where: { status: QueueJobStatus.PENDING } }),
        client.queueJob.count({ where: { status: QueueJobStatus.RUNNING } }),
        getArchivePolicyState(client),
      ]);

    if (lockedPendingJobs === 0 && lockedRunningJobs === 0) {
      return {
        recovered: false,
        reason: "idle" as const,
      };
    }

    if (workerActivelyRunning(lockedWorker)) {
      return {
        recovered: false,
        reason: "worker-active" as const,
      };
    }

    const recoveredRunningJobs =
      lockedRunningJobs > 0
        ? await recoverRunningJobsForUnavailableWorker(client)
        : 0;
    const pace = archivePaceConfigForContractsPerTick(policy.contractsPerTick);
    const cycle = await runWorkerCycle(client, {
      workerKey: "web-watchdog-worker",
      label: "Web watchdog worker",
      limit: Math.min(pace.queueLimit, 3),
      mode: "watchdog",
      allowIngress: false,
    });

    return {
      recovered: true,
      reason: "watchdog-ran" as const,
      recoveredRunningJobs,
      processedJobs: cycle.processed,
      hadActivity: cycle.hadActivity,
    };
  });

  if (result) {
    return result;
  }

  return {
    recovered: false,
    reason: "lock-busy" as const,
  };
}
