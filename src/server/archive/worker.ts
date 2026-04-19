import type { PrismaClient } from "~/server/prisma-client";

import {
  maybeAdvanceSmartPinBudget,
  runAutomaticContractDiscoveryTick,
  runAutomaticContractCrawlerTick,
} from "~/server/archive/automation";
import { runFoundationMarketIndexerTick } from "~/server/archive/foundation-market";
import { emitArchiveEvent } from "~/server/archive/live-events";
import {
  processQueuedJobs,
  rebalanceAutomaticBackupQueue,
} from "~/server/archive/jobs";

type DatabaseClient = PrismaClient;

export type WorkerStatus =
  | "STARTING"
  | "IDLE"
  | "RUNNING"
  | "ERROR"
  | "STOPPED";
const RUNNING_HEARTBEAT_INTERVAL_MS = 20_000;
const ARCHIVE_INGRESS_LOCK_FIRST_KEY = 6_145;
const ARCHIVE_INGRESS_LOCK_SECOND_KEY = 31_816;

function cycleHadActivity(input: {
  processed: number;
  discovery: {
    seenContracts: number;
    newContracts: number;
  };
  crawl: {
    scannedContracts: number;
    queuedTokens: number;
  };
  marketIndexer: {
    scannedRanges: number;
    processedEvents: number;
  };
  budget: {
    advanced: boolean;
  };
  rebalance: {
    parkedBlockedJobs: number;
    trimmedAutomaticJobs: number;
    refilledAutomaticJobs: number;
  };
}) {
  return (
    input.processed > 0 ||
    input.discovery.seenContracts > 0 ||
    input.discovery.newContracts > 0 ||
    input.crawl.scannedContracts > 0 ||
    input.crawl.queuedTokens > 0 ||
    input.marketIndexer.scannedRanges > 0 ||
    input.marketIndexer.processedEvents > 0 ||
    input.budget.advanced ||
    input.rebalance.parkedBlockedJobs > 0 ||
    input.rebalance.trimmedAutomaticJobs > 0 ||
    input.rebalance.refilledAutomaticJobs > 0
  );
}

function disabledDiscoveryResult() {
  return {
    source: "paused",
    page: 0,
    query: null as string | null,
    seenContracts: 0,
    newContracts: 0,
    completedFoundationPass: false,
    pausedForBacklog: true,
    backlogMaxPendingJobs: 0,
    backlogHeadroomJobs: 0,
  };
}

function disabledCrawlerResult() {
  return {
    scannedContracts: 0,
    queuedTokens: 0,
    pausedForBacklog: false,
    backlogMaxPendingJobs: 0,
    backlogHeadroomJobs: 0,
    allowedCrawlerContracts: 0,
  };
}

function idleDiscoveryResult() {
  return {
    source: "idle",
    page: 0,
    query: null as string | null,
    seenContracts: 0,
    newContracts: 0,
    completedFoundationPass: false,
    pausedForBacklog: false,
    backlogMaxPendingJobs: 0,
    backlogHeadroomJobs: 0,
  };
}

function idleBudgetResult() {
  return {
    advanced: false,
  };
}

function idleMarketIndexerResult() {
  return {
    scannedRanges: 0,
    processedEvents: 0,
  };
}

function idleRebalanceResult() {
  return {
    queueBudget: 0,
    protectedJobs: 0,
    totalPendingJobs: 0,
    refillResumeThreshold: 0,
    automaticPendingTarget: 0,
    parkedBlockedJobs: 0,
    trimmedAutomaticJobs: 0,
    refilledAutomaticJobs: 0,
  };
}

const STALE_INGRESS_LOCK_IDLE_SECONDS = 120;

async function withArchiveIngressLock<T>(
  client: DatabaseClient,
  callback: () => Promise<T>,
): Promise<T | null> {
  // pg advisory locks are session-scoped, but Prisma pools connections —
  // lock + unlock can easily land on different backends, orphaning the
  // lock on the original one forever. Before attempting to acquire, kill
  // any stale backend that has been holding this specific lock while idle
  // for more than STALE_INGRESS_LOCK_IDLE_SECONDS. Self-healing, cheap.
  try {
    await client.$queryRawUnsafe(
      `SELECT pg_terminate_backend(l.pid)
       FROM pg_locks l
       JOIN pg_stat_activity a ON a.pid = l.pid
       WHERE l.locktype = 'advisory'
         AND l.classid = $1
         AND l.objid = $2
         AND l.granted = TRUE
         AND a.state = 'idle'
         AND a.state_change < NOW() - make_interval(secs => $3)`,
      ARCHIVE_INGRESS_LOCK_FIRST_KEY,
      ARCHIVE_INGRESS_LOCK_SECOND_KEY,
      STALE_INGRESS_LOCK_IDLE_SECONDS,
    );
  } catch {
    // Non-fatal: if we can't sweep stale holders we still try to acquire.
  }

  const result: Array<{ locked: boolean }> = await client.$queryRawUnsafe(
    "SELECT pg_try_advisory_lock($1, $2) AS locked",
    ARCHIVE_INGRESS_LOCK_FIRST_KEY,
    ARCHIVE_INGRESS_LOCK_SECOND_KEY,
  );

  if (!result[0]?.locked) {
    return null;
  }

  try {
    return await callback();
  } finally {
    await client.$queryRawUnsafe(
      "SELECT pg_advisory_unlock($1, $2)",
      ARCHIVE_INGRESS_LOCK_FIRST_KEY,
      ARCHIVE_INGRESS_LOCK_SECOND_KEY,
    );
  }
}

// eslint-disable-next-line complexity
async function runIngressCycle(
  client: DatabaseClient,
  allowIngress: boolean,
) {
  const fallbackBudget = idleBudgetResult();
  const fallbackDiscovery = allowIngress
    ? idleDiscoveryResult()
    : disabledDiscoveryResult();
  const fallbackCrawl = disabledCrawlerResult();
  const fallbackRebalance = idleRebalanceResult();
  const fallbackMarketIndexer = idleMarketIndexerResult();

  const ingressResults = allowIngress
    ? await withArchiveIngressLock(client, async () => {
        const rebalance = await rebalanceAutomaticBackupQueue(client);
        const discovery = await runAutomaticContractDiscoveryTick(client);
        const crawl = await runAutomaticContractCrawlerTick(client);
        const marketIndexer = await runFoundationMarketIndexerTick(client);
        const budget = await maybeAdvanceSmartPinBudget(client, {
          completedFoundationPass: discovery.completedFoundationPass,
        });

        return {
          budget,
          discovery,
          crawl,
          marketIndexer,
          rebalance,
        };
      })
    : null;

  return {
    budget: ingressResults?.budget ?? fallbackBudget,
    discovery: ingressResults?.discovery ?? fallbackDiscovery,
    crawl: ingressResults?.crawl ?? fallbackCrawl,
    marketIndexer: ingressResults?.marketIndexer ?? fallbackMarketIndexer,
    rebalance: ingressResults?.rebalance ?? fallbackRebalance,
  };
}

export async function updateWorkerHeartbeat(
  client: DatabaseClient,
  input: {
    workerKey: string;
    label: string;
    mode?: string;
    status: WorkerStatus;
    lastError?: string | null;
    lastProcessedCount?: number;
    lastRunStartedAt?: Date | null;
    lastRunFinishedAt?: Date | null;
    emitEvent?: boolean;
  },
) {
  const heartbeat = await client.workerHeartbeat.upsert({
    where: { workerKey: input.workerKey },
    create: {
      workerKey: input.workerKey,
      label: input.label,
      mode: input.mode ?? "daemon",
      status: input.status,
      lastError: input.lastError ?? null,
      lastProcessedCount: input.lastProcessedCount ?? 0,
      lastRunStartedAt: input.lastRunStartedAt ?? null,
      lastRunFinishedAt: input.lastRunFinishedAt ?? null,
      lastSeenAt: new Date(),
    },
    update: {
      label: input.label,
      mode: input.mode ?? undefined,
      status: input.status,
      lastError: input.lastError === undefined ? undefined : input.lastError,
      lastProcessedCount: input.lastProcessedCount ?? undefined,
      lastRunStartedAt: input.lastRunStartedAt ?? undefined,
      lastRunFinishedAt: input.lastRunFinishedAt ?? undefined,
      lastSeenAt: new Date(),
    },
  });

  if (input.emitEvent !== false) {
    await emitArchiveEvent(client, {
      type: "worker.status",
      summary: `${input.label} is ${input.status.toLowerCase()}.`,
      data: {
        workerKey: heartbeat.workerKey,
        status: heartbeat.status,
        mode: heartbeat.mode,
        lastProcessedCount: heartbeat.lastProcessedCount,
        lastError: heartbeat.lastError,
      },
    });
  }

  return heartbeat;
}

export async function readLatestWorkerHeartbeat(client: DatabaseClient) {
  return client.workerHeartbeat.findFirst({
    orderBy: [{ lastSeenAt: "desc" }],
  });
}

// eslint-disable-next-line max-lines-per-function, complexity
export async function runWorkerCycle(
  client: DatabaseClient,
  input: {
    workerKey?: string;
    label?: string;
    limit?: number;
    mode?: string;
    allowIngress?: boolean;
  } = {},
) {
  const workerKey = input.workerKey ?? "default-worker";
  const label = input.label ?? "Automatic queue worker";
  const mode = input.mode ?? "daemon";
  const limit = input.limit ?? 25;
  const allowIngress = input.allowIngress ?? true;
  const startedAt = new Date();
  let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

  try {
    await updateWorkerHeartbeat(client, {
      workerKey,
      label,
      mode,
      status: "RUNNING",
      lastError: null,
      lastRunStartedAt: startedAt,
    });

    keepAliveInterval = setInterval(() => {
      void updateWorkerHeartbeat(client, {
        workerKey,
        label,
        mode,
        status: "RUNNING",
        lastError: null,
        lastRunStartedAt: startedAt,
        emitEvent: false,
      }).catch(() => null);
    }, RUNNING_HEARTBEAT_INTERVAL_MS);
    keepAliveInterval.unref();

    const initialQueueResult = await processQueuedJobs(client, limit);
    const { budget, discovery, crawl, marketIndexer, rebalance } =
      await runIngressCycle(client, allowIngress);
    const remainingQueueCapacity = Math.max(
      limit - initialQueueResult.processed,
      0,
    );
    const postIngressQueueResult =
      allowIngress && remainingQueueCapacity > 0
        ? await processQueuedJobs(client, remainingQueueCapacity)
        : { processed: 0, results: [] as typeof initialQueueResult.results };
    const queueResult =
      postIngressQueueResult.processed > 0
        ? {
            processed:
              initialQueueResult.processed + postIngressQueueResult.processed,
            results: [
              ...initialQueueResult.results,
              ...postIngressQueueResult.results,
            ],
          }
        : initialQueueResult;
    const hadActivity = cycleHadActivity({
      processed: queueResult.processed,
      discovery,
      crawl,
      marketIndexer,
      budget,
      rebalance,
    });

    await updateWorkerHeartbeat(client, {
      workerKey,
      label,
      mode,
      status: "IDLE",
      lastError: null,
      lastProcessedCount: queueResult.processed,
      lastRunFinishedAt: new Date(),
      lastRunStartedAt: startedAt,
    });

    return {
      ...queueResult,
      discovery,
      crawl,
      marketIndexer,
      budget,
      rebalance,
      hadActivity,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown worker failure";

    await updateWorkerHeartbeat(client, {
      workerKey,
      label,
      mode,
      status: "ERROR",
      lastError: message,
      lastRunFinishedAt: new Date(),
      lastRunStartedAt: startedAt,
    });

    throw error;
  } finally {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
    }
  }
}
