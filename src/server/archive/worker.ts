import type { PrismaClient } from "~/server/prisma-client";

import {
  maybeAdvanceSmartPinBudget,
  runAutomaticContractDiscoveryTick,
  runAutomaticContractCrawlerTick,
} from "~/server/archive/automation";
import { emitArchiveEvent } from "~/server/archive/live-events";
import { processQueuedJobs, rebalanceAutomaticBackupQueue } from "~/server/archive/jobs";

type DatabaseClient = PrismaClient;

export type WorkerStatus = "STARTING" | "IDLE" | "RUNNING" | "ERROR" | "STOPPED";

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
  budget: {
    advanced: boolean;
  };
  rebalance: {
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
    input.budget.advanced ||
    input.rebalance.trimmedAutomaticJobs > 0 ||
    input.rebalance.refilledAutomaticJobs > 0
  );
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

  return heartbeat;
}

export async function readLatestWorkerHeartbeat(client: DatabaseClient) {
  return client.workerHeartbeat.findFirst({
    orderBy: [{ lastSeenAt: "desc" }],
  });
}

export async function runWorkerCycle(
  client: DatabaseClient,
  input: {
    workerKey?: string;
    label?: string;
    limit?: number;
    mode?: string;
  } = {},
) {
  const workerKey = input.workerKey ?? "default-worker";
  const label = input.label ?? "Automatic queue worker";
  const mode = input.mode ?? "daemon";
  const limit = input.limit ?? 25;
  const startedAt = new Date();

  await updateWorkerHeartbeat(client, {
    workerKey,
    label,
    mode,
    status: "RUNNING",
    lastError: null,
    lastRunStartedAt: startedAt,
  });

  try {
    const queueResult = await processQueuedJobs(client, limit);
    const budgetResult = await maybeAdvanceSmartPinBudget(client);
    const discoveryResult = await runAutomaticContractDiscoveryTick(client);
    const crawlResult = await runAutomaticContractCrawlerTick(client);
    const rebalanceResult = await rebalanceAutomaticBackupQueue(client);
    const hadActivity = cycleHadActivity({
      processed: queueResult.processed,
      discovery: discoveryResult,
      crawl: crawlResult,
      budget: budgetResult,
      rebalance: rebalanceResult,
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
      discovery: discoveryResult,
      crawl: crawlResult,
      budget: budgetResult,
      rebalance: rebalanceResult,
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
  }
}
