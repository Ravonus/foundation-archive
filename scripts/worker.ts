/* eslint-disable complexity */

import "dotenv/config";

import { env } from "~/env";
import { archivePaceConfigForContractsPerTick } from "~/lib/archive-pace";
import { updateWorkerHeartbeat, runWorkerCycle } from "~/server/archive/worker";
import { getArchivePolicyState } from "~/server/archive/state";
import { db } from "~/server/db";

function readFlag(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function readBooleanFlag(name: string) {
  return process.argv.includes(name);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertProductionPinningConfig() {
  if (env.NODE_ENV !== "production" || env.KUBO_API_URL) {
    return;
  }

  throw new Error(
    "KUBO_API_URL is required in production. Without it the worker downloads roots but never pins them.",
  );
}

async function readWorkerLoopConfig(input: {
  fallbackMs: number;
  hadActivity: boolean;
  explicitLimit: number | null;
}) {
  const { fallbackMs, hadActivity, explicitLimit } = input;

  try {
    const policy = await getArchivePolicyState(db);
    const pace = archivePaceConfigForContractsPerTick(policy.contractsPerTick);
    return {
      delayMs: hadActivity
        ? pace.busyDelayMs
        : Math.max(fallbackMs, pace.idleDelayMs),
      limit: explicitLimit ?? pace.queueLimit,
    };
  } catch {
    return {
      delayMs: fallbackMs,
      limit: explicitLimit ?? 25,
    };
  }
}

async function main() {
  assertProductionPinningConfig();

  const workerKey = readFlag("--worker-key") ?? "default-worker";
  const label = readFlag("--label") ?? "Automatic queue worker";
  const explicitLimitFlag = readFlag("--limit");
  const parsedExplicitLimit =
    explicitLimitFlag === null ? Number.NaN : Number(explicitLimitFlag);
  const explicitLimit =
    explicitLimitFlag === null || !Number.isFinite(parsedExplicitLimit)
      ? null
      : parsedExplicitLimit;
  const intervalMs = Number(readFlag("--interval-ms") ?? "15000");
  const once = readBooleanFlag("--once");
  let stopping = false;

  const markStopped = async (
    status: "STARTING" | "IDLE" | "RUNNING" | "ERROR" | "STOPPED",
    lastError?: string,
  ) => {
    await updateWorkerHeartbeat(db, {
      workerKey,
      label,
      mode: once ? "manual" : "daemon",
      status,
      lastError: lastError ?? null,
      lastRunFinishedAt: new Date(),
    });
  };

  const stop = async (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    await markStopped("STOPPED", `Worker stopped by ${signal}`);
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void stop("SIGINT");
  });
  process.on("SIGTERM", () => {
    void stop("SIGTERM");
  });

  await updateWorkerHeartbeat(db, {
    workerKey,
    label,
    mode: once ? "manual" : "daemon",
    status: "STARTING",
    lastError: null,
  });

  for (;;) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- stop requests arrive from signal handlers outside the loop body.
    if (stopping) {
      return;
    }

    try {
      const currentConfig = await readWorkerLoopConfig({
        fallbackMs: intervalMs,
        hadActivity: false,
        explicitLimit,
      });
      const result = await runWorkerCycle(db, {
        workerKey,
        label,
        limit: currentConfig.limit,
        mode: once ? "manual" : "daemon",
        // ARCHIVE_INGRESS_PAUSED stops automatic discovery / crawl /
        // market indexer / rebalance during the cold-storage -> kubo
        // migration but keeps the user-initiated queue drain running,
        // so search + "save this" flows still resolve in real time.
        allowIngress: !env.ARCHIVE_INGRESS_PAUSED,
      });
      const completed = result.results.filter(
        (item) => item.status === "completed",
      ).length;
      const deferred = result.results.filter(
        (item) => item.status === "deferred",
      ).length;
      const failed = result.results.filter(
        (item) => item.status === "failed",
      ).length;

      console.log(
        `[worker] processed=${result.processed} completed=${completed} deferred=${deferred} failed=${failed} discovery_source=${result.discovery.source} discovery_page=${result.discovery.page} discovery_new=${result.discovery.newContracts} discovery_paused=${result.discovery.pausedForBacklog} crawl_scanned=${result.crawl.scannedContracts} crawl_queued=${result.crawl.queuedTokens} crawl_paused=${result.crawl.pausedForBacklog} crawl_headroom=${result.crawl.backlogHeadroomJobs}`,
      );

      if (once) {
        await markStopped("IDLE");
        return;
      }

      const nextConfig = await readWorkerLoopConfig({
        fallbackMs: intervalMs,
        hadActivity: result.hadActivity,
        explicitLimit,
      });
      await sleep(nextConfig.delayMs);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown worker failure";
      console.error(`[worker] ${message}`);

      if (once) {
        await markStopped("ERROR", message);
        process.exitCode = 1;
        return;
      }

      const nextConfig = await readWorkerLoopConfig({
        fallbackMs: intervalMs,
        hadActivity: false,
        explicitLimit,
      });
      await sleep(nextConfig.delayMs);
    }
  }
}

void main().finally(async () => {
  await db.$disconnect();
});
