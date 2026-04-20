import "dotenv/config";

import { pinCidWithKubo } from "~/server/archive/storage";
import { db } from "~/server/db";

/// Walks every DOWNLOADED cold-storage root and runs it through kubo's
/// plain `ipfs add -r` (via pinCidWithKubo) to migrate the file-tree
/// archive into kubo's blockstore on the same NAS share. Matching CID
/// → kubo owns the content, file-tree copy is dropped. Mismatching CID
/// (partial directory) → no harm done, the next run after hydration
/// fills in siblings will pick it up.
///
/// Silent by design: doesn't touch the UI, doesn't flip pinStatus
/// (rows are already PINNED from the legacy flow), doesn't emit live
/// events. Run it in the worker container:
///
///   docker exec -d foundation-archive-worker-1 pnpm migrate:kubo-pins --loop
///
/// Flags: --concurrency N --limit N --loop --interval-ms N

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_INTERVAL_MS = 60_000;
const PROGRESS_EVERY = 25;

type Summary = {
  considered: number;
  pinned: number;
  skippedPartialDir: number;
  missing: number;
  failed: number;
  freedBytes: number;
};

function parseNumericArg(flag: string, fallback: number) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return fallback;
  const raw = process.argv[index + 1];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

async function processCid(cid: string, summary: Summary) {
  summary.considered += 1;
  try {
    const result = await pinCidWithKubo(cid);
    if (!result.pinned) {
      summary.skippedPartialDir += 1;
      return;
    }
    summary.pinned += 1;
    summary.freedBytes += result.freedDiskBytes ?? 0;
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("local archive directory") && message.includes("is missing")) {
      summary.missing += 1;
      return;
    }
    summary.failed += 1;
    console.warn(`[migrate] ${cid} failed: ${message}`);
  }
}

async function runOnePass(args: {
  concurrency: number;
  limit: number;
}) {
  const { concurrency, limit } = args;

  const rows = await db.ipfsRoot.findMany({
    where: { backupStatus: "DOWNLOADED" },
    select: { cid: true },
    distinct: ["cid"],
    orderBy: { lastDownloadedAt: "asc" },
    ...(limit > 0 ? { take: limit } : {}),
  });

  const cids = rows.map((row) => row.cid);
  if (cids.length === 0) {
    console.log(`[migrate] nothing left to migrate.`);
    return { summary: null as Summary | null, drained: true };
  }

  console.log(`[migrate] processing ${cids.length} CID(s) with concurrency=${concurrency}.`);

  const summary: Summary = {
    considered: 0,
    pinned: 0,
    skippedPartialDir: 0,
    missing: 0,
    failed: 0,
    freedBytes: 0,
  };

  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= cids.length) return;
      const cid = cids[index];
      if (!cid) return;
      await processCid(cid, summary);
      if (summary.considered % PROGRESS_EVERY === 0) {
        console.log(
          `[migrate] progress: ${summary.considered}/${cids.length} ` +
            `pinned=${summary.pinned} skippedPartial=${summary.skippedPartialDir} ` +
            `missing=${summary.missing} failed=${summary.failed} ` +
            `freedMB=${(summary.freedBytes / (1024 * 1024)).toFixed(1)}`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  console.log(`[migrate] pass done: ${JSON.stringify(summary)}`);

  // Track whether we made any progress this pass. If a pass only
  // produces skippedPartialDir results, we're at the hydration wall for
  // now — looping again immediately doesn't help until the normal
  // worker fills in sibling files.
  const madeProgress = summary.pinned > 0;
  const everythingSkipped =
    summary.pinned === 0 && summary.skippedPartialDir === summary.considered;

  return {
    summary,
    drained: cids.length < 1,
    madeProgress,
    everythingSkipped,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const concurrency = parseNumericArg("--concurrency", DEFAULT_CONCURRENCY);
  const limit = parseNumericArg("--limit", 0);
  const intervalMs = parseNumericArg("--interval-ms", DEFAULT_INTERVAL_MS);
  const loop = hasFlag("--loop");

  console.log(
    `[migrate] starting: concurrency=${concurrency} limit=${limit || "all"} loop=${loop} intervalMs=${intervalMs}`,
  );

  for (;;) {
    const pass = await runOnePass({ concurrency, limit });

    if (!loop) return;

    if (pass.drained) {
      console.log(`[migrate] drain reached — sleeping ${intervalMs}ms before rechecking.`);
    } else if (pass.everythingSkipped) {
      console.log(
        `[migrate] everything skipped this pass (waiting on hydration). Sleeping ${intervalMs}ms.`,
      );
    }

    await sleep(intervalMs);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect().catch(() => {});
  });
