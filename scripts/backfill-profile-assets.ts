import "dotenv/config";

import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { env } from "~/env";
import {
  archiveFoundationProfileBackfillArtist,
  countFoundationProfileBackfillArtists,
  loadFoundationProfileBackfillBatch,
  type FoundationProfileBackfillArtist,
} from "~/server/archive/profile-assets";
import { db } from "~/server/db";

type PendingBackfillArtist = FoundationProfileBackfillArtist & {
  attempts: number;
  availableAt: string;
};

type BackfillCheckpoint = {
  version: 2;
  cursor: string | null;
  processed: number;
  archived: number;
  missing: number;
  failed: number;
  pending: PendingBackfillArtist[];
  completed: boolean;
  updatedAt: string;
};

type BackfillSummary = {
  totalArtists: number;
  percentComplete: number;
  remainingArtists: number;
  processedThisRun: number;
  archivedThisRun: number;
  missingThisRun: number;
  failedThisRun: number;
  processedOverall: number;
  archivedOverall: number;
  missingOverall: number;
  failedOverall: number;
  pendingOverall: number;
  nextCursor: string | null;
  nextRetryAt: string | null;
  completed: boolean;
  checkpointPath: string;
};

type BackfillAttemptTotals = {
  processedThisRun: number;
  archivedThisRun: number;
  missingThisRun: number;
  failedThisRun: number;
};

type BackfillArtistResult =
  | Awaited<ReturnType<typeof archiveFoundationProfileBackfillArtist>>
  | {
      status: "failed";
      artistWallet: string;
      artistUsername: string;
      message: string;
    };

function readNumberFlag(name: string, fallback: number) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

function percentComplete(processed: number, totalArtists: number) {
  if (totalArtists <= 0) return 100;
  return roundPercent((processed / totalArtists) * 100);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function archiveStorageRoot() {
  return path.isAbsolute(env.ARCHIVE_STORAGE_DIR)
    ? env.ARCHIVE_STORAGE_DIR
    : path.resolve(
        /* turbopackIgnore: true */ process.cwd(),
        env.ARCHIVE_STORAGE_DIR,
      );
}

function checkpointPath() {
  return path.join(
    archiveStorageRoot(),
    "foundation-profile-assets",
    "backfill-checkpoint.json",
  );
}

async function loadCheckpoint(filePath: string): Promise<BackfillCheckpoint> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<
      BackfillCheckpoint & {
        version?: number;
        pending?: Array<Partial<PendingBackfillArtist>>;
      }
    >;
    const parsedVersion =
      typeof parsed.version === "number" ? parsed.version : 1;
    if (parsedVersion !== 1 && parsedVersion !== 2) {
      throw new Error("Unsupported checkpoint version.");
    }
    return {
      version: 2,
      cursor: parsed.cursor ?? null,
      processed: parsed.processed ?? 0,
      archived: parsed.archived ?? 0,
      missing: parsed.missing ?? 0,
      failed: parsed.failed ?? 0,
      pending:
        parsed.pending?.flatMap((artist) => {
          if (!artist.artistWallet || !artist.artistUsername) return [];
          return [
            {
              artistWallet: artist.artistWallet,
              artistUsername: artist.artistUsername,
              attempts:
                typeof artist.attempts === "number" && artist.attempts > 0
                  ? artist.attempts
                  : 0,
              availableAt:
                artist.availableAt ?? new Date(0).toISOString(),
            },
          ];
        }) ?? [],
      completed: parsed.completed ?? false,
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    };
  } catch {
    return {
      version: 2,
      cursor: null,
      processed: 0,
      archived: 0,
      missing: 0,
      failed: 0,
      pending: [],
      completed: false,
      updatedAt: new Date(0).toISOString(),
    };
  }
}

async function saveCheckpoint(
  filePath: string,
  checkpoint: BackfillCheckpoint,
) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
}

async function clearCheckpoint(filePath: string) {
  await rm(filePath, { force: true });
}

async function runWithConcurrency<TInput, TOutput>(args: {
  items: TInput[];
  concurrency: number;
  worker: (item: TInput) => Promise<TOutput>;
}) {
  const results = new Array<TOutput | undefined>(args.items.length);
  let nextIndex = 0;

  async function consume() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= args.items.length) return;
      const item = args.items[index];
      if (item === undefined) return;
      results[index] = await args.worker(item);
    }
  }

  const workerCount = Math.min(args.concurrency, args.items.length);
  await Promise.all(Array.from({ length: workerCount }, () => consume()));

  return results.filter((result): result is TOutput => result !== undefined);
}

function printProgress(args: {
  totalArtists: number;
  checkpoint: BackfillCheckpoint;
  processedThisRun: number;
}) {
  const totalKnown =
    args.totalArtists > 0 ? args.totalArtists : args.checkpoint.processed;
  const percent = percentComplete(args.checkpoint.processed, totalKnown);
  const remaining = Math.max(totalKnown - args.checkpoint.processed, 0);
  console.log(
    `[profiles] processed=${args.checkpoint.processed}/${totalKnown} (${percent}%) remaining=${remaining} archived=${args.checkpoint.archived} missing=${args.checkpoint.missing} failed=${args.checkpoint.failed} pending=${args.checkpoint.pending.length} run_processed=${args.processedThisRun} cursor=${args.checkpoint.cursor ?? "start"}`,
  );
}

function buildSummary(args: {
  checkpoint: BackfillCheckpoint;
  checkpointFile: string;
  totalArtists: number;
  totals?: BackfillAttemptTotals;
}): BackfillSummary {
  const processedOverall = Math.min(
    args.checkpoint.processed,
    args.totalArtists,
  );
  const remainingArtists = Math.max(args.totalArtists - processedOverall, 0);

  return {
    totalArtists: args.totalArtists,
    percentComplete: percentComplete(processedOverall, args.totalArtists),
    remainingArtists,
    processedThisRun: args.totals?.processedThisRun ?? 0,
    archivedThisRun: args.totals?.archivedThisRun ?? 0,
    missingThisRun: args.totals?.missingThisRun ?? 0,
    failedThisRun: args.totals?.failedThisRun ?? 0,
    processedOverall,
    archivedOverall: args.checkpoint.archived,
    missingOverall: args.checkpoint.missing,
    failedOverall: args.checkpoint.failed,
    pendingOverall: args.checkpoint.pending.length,
    nextCursor: args.checkpoint.completed ? null : args.checkpoint.cursor,
    nextRetryAt:
      args.checkpoint.pending
        .map((artist) => artist.availableAt)
        .sort()[0] ?? null,
    completed: args.checkpoint.completed,
    checkpointPath: args.checkpointFile,
  };
}

function isRetryableFoundationFailureMessage(message: string) {
  return /Foundation API request failed: 403/i.test(message);
}

function takeDuePendingArtists(
  checkpoint: BackfillCheckpoint,
  take: number,
): PendingBackfillArtist[] {
  const now = Date.now();
  const ready: PendingBackfillArtist[] = [];
  const pending: PendingBackfillArtist[] = [];

  for (const artist of checkpoint.pending) {
    if (
      ready.length < take &&
      new Date(artist.availableAt).getTime() <= now
    ) {
      ready.push(artist);
    } else {
      pending.push(artist);
    }
  }

  checkpoint.pending = pending;
  return ready;
}

function scheduleRetryableArtist(args: {
  checkpoint: BackfillCheckpoint;
  artist: FoundationProfileBackfillArtist;
  attempts: number;
  retryCooldownMs: number;
}) {
  const availableAt = new Date(Date.now() + args.retryCooldownMs).toISOString();
  const existingIndex = args.checkpoint.pending.findIndex(
    (pendingArtist) =>
      pendingArtist.artistWallet === args.artist.artistWallet.toLowerCase(),
  );
  const scheduled: PendingBackfillArtist = {
    artistWallet: args.artist.artistWallet.toLowerCase(),
    artistUsername: args.artist.artistUsername,
    attempts: args.attempts,
    availableAt,
  };

  if (existingIndex >= 0) {
    args.checkpoint.pending[existingIndex] = scheduled;
    return;
  }
  args.checkpoint.pending.push(scheduled);
}

function nextRetryDelayMs(checkpoint: BackfillCheckpoint) {
  const nextRetryAt = checkpoint.pending
    .map((artist) => new Date(artist.availableAt).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)[0];
  if (!nextRetryAt) return null;
  return Math.max(nextRetryAt - Date.now(), 0);
}

async function processBatch(args: {
  artists: FoundationProfileBackfillArtist[];
  concurrency: number;
  checkpoint: BackfillCheckpoint;
  checkpointFile: string;
  totals: BackfillAttemptTotals;
  totalArtists: number;
  retryCooldownMs: number;
  pendingAttempts?: Map<string, number>;
  cursorAfterBatch: string | null;
}) {
  const results = await runWithConcurrency({
    items: args.artists,
    concurrency: args.concurrency,
    worker: async (artist): Promise<BackfillArtistResult> => {
      try {
        return await archiveFoundationProfileBackfillArtist(db, artist);
      } catch (error) {
        return {
          status: "failed" as const,
          artistWallet: artist.artistWallet,
          artistUsername: artist.artistUsername,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  for (const result of results) {
    const priorAttempts =
      args.pendingAttempts?.get(result.artistWallet.toLowerCase()) ?? 0;

    if (
      result.status === "failed" &&
      "message" in result &&
      isRetryableFoundationFailureMessage(result.message)
    ) {
      scheduleRetryableArtist({
        checkpoint: args.checkpoint,
        artist: {
          artistWallet: result.artistWallet,
          artistUsername: result.artistUsername,
        },
        attempts: priorAttempts + 1,
        retryCooldownMs: args.retryCooldownMs,
      });
      console.warn(
        `[profiles] deferred ${result.artistUsername} (${result.artistWallet}) after retryable failure: ${result.message}`,
      );
      continue;
    }

    args.checkpoint.processed += 1;
    args.totals.processedThisRun += 1;

    if (result.status === "archived") {
      args.checkpoint.archived += 1;
      args.totals.archivedThisRun += 1;
    } else if (result.status === "missing") {
      args.checkpoint.missing += 1;
      args.totals.missingThisRun += 1;
    } else {
      args.checkpoint.failed += 1;
      args.totals.failedThisRun += 1;
      console.warn(
        `[profiles] failed ${result.artistUsername} (${result.artistWallet})${"message" in result && result.message ? `: ${result.message}` : ""}`,
      );
    }
  }

  if (args.cursorAfterBatch) {
    args.checkpoint.cursor = args.cursorAfterBatch.toLowerCase();
  }

  args.checkpoint.completed = false;
  args.checkpoint.updatedAt = new Date().toISOString();
  await saveCheckpoint(args.checkpointFile, args.checkpoint);

  printProgress({
    totalArtists: args.totalArtists,
    checkpoint: args.checkpoint,
    processedThisRun: args.totals.processedThisRun,
  });
}

async function main() {
  const batchSize = readNumberFlag("--batch-size", 120);
  const concurrency = readNumberFlag("--concurrency", 6);
  const batchDelayMs = readNumberFlag("--batch-delay-ms", 0);
  const retryCooldownMs = readNumberFlag("--retry-cooldown-ms", 15 * 60 * 1000);
  const reset = hasFlag("--reset");
  const statusOnly = hasFlag("--status");
  const checkpointFile = checkpointPath();

  if (reset) {
    await clearCheckpoint(checkpointFile);
  }

  const checkpoint = await loadCheckpoint(checkpointFile);
  const totalArtists = await countFoundationProfileBackfillArtists(db);
  const totals = {
    processedThisRun: 0,
    archivedThisRun: 0,
    missingThisRun: 0,
    failedThisRun: 0,
  };

  if (statusOnly) {
    const summary = buildSummary({
      checkpoint,
      checkpointFile,
      totalArtists,
    });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (
    checkpoint.completed &&
    checkpoint.pending.length === 0 &&
    checkpoint.processed >= totalArtists
  ) {
    const summary = buildSummary({
      checkpoint,
      checkpointFile,
      totalArtists,
      totals,
    });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  for (;;) {
    const duePendingArtists = takeDuePendingArtists(checkpoint, batchSize);
    const pendingAttempts = new Map(
      duePendingArtists.map((artist) => [
        artist.artistWallet.toLowerCase(),
        artist.attempts,
      ]),
    );
    const artists =
      duePendingArtists.length > 0
        ? duePendingArtists.map(({ artistWallet, artistUsername }) => ({
            artistWallet,
            artistUsername,
          }))
        : await loadFoundationProfileBackfillBatch(db, {
            cursor: checkpoint.cursor,
            take: batchSize,
          });
    const cursorAfterBatch =
      duePendingArtists.length > 0
        ? null
        : artists.at(-1)?.artistWallet ?? checkpoint.cursor;

    if (artists.length === 0) {
      if (checkpoint.pending.length === 0) {
        break;
      }

      const waitMs = nextRetryDelayMs(checkpoint);
      if (waitMs === null) {
        break;
      }
      console.log(
        `[profiles] waiting ${waitMs}ms for ${checkpoint.pending.length} deferred artists`,
      );
      await sleep(waitMs);
      continue;
    }

    await processBatch({
      artists,
      concurrency,
      checkpoint,
      checkpointFile,
      totals,
      totalArtists,
      retryCooldownMs,
      pendingAttempts,
      cursorAfterBatch,
    });

    if (batchDelayMs > 0) {
      await sleep(batchDelayMs);
    }
  }

  const completed =
    checkpoint.pending.length === 0 && checkpoint.processed >= totalArtists;
  checkpoint.completed = completed;
  checkpoint.updatedAt = new Date().toISOString();
  await saveCheckpoint(checkpointFile, checkpoint);

  const summary = buildSummary({
    checkpoint,
    checkpointFile,
    totalArtists,
    totals,
  });

  console.log(JSON.stringify(summary, null, 2));
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
