/* eslint-disable complexity */

import "dotenv/config";

import { updateWorkerHeartbeat, runWorkerCycle } from "~/server/archive/worker";
import { db } from "~/server/db";

function readFlag(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function readBooleanFlag(name: string) {
  return process.argv.includes(name);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const workerKey = readFlag("--worker-key") ?? "default-worker";
  const label = readFlag("--label") ?? "Automatic queue worker";
  const limit = Number(readFlag("--limit") ?? "25");
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
      const result = await runWorkerCycle(db, {
        workerKey,
        label,
        limit,
        mode: once ? "manual" : "daemon",
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

      const delay = result.hadActivity ? 1000 : intervalMs;
      await sleep(delay);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown worker failure";
      console.error(`[worker] ${message}`);

      if (once) {
        await markStopped("ERROR", message);
        process.exitCode = 1;
        return;
      }

      await sleep(intervalMs);
    }
  }
}

void main().finally(async () => {
  await db.$disconnect();
});
