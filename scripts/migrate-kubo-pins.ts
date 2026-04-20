import "dotenv/config";

import { createReadStream } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { env } from "~/env";
import { getCidDirectory } from "~/server/archive/storage";
import { db } from "~/server/db";

/// Migrates the file-tree archive on NAS into kubo's blockstore without
/// touching the UI: for each unique CID that's in cold-storage, we ask
/// kubo to pin it (which fetches the real blocks from the network and
/// preserves the original Foundation CID), then — once kubo confirms —
/// we drop the cold-storage copy so we're not double-storing.
///
/// Runs with worker-style concurrency straight against the DB + kubo
/// HTTP API. No archive events, no BackupRun rows, no status flips: the
/// UI already reads `pinStatus=PINNED` for these rows, and pinStatus
/// stays that way the whole time — we just make it retroactively true
/// at the kubo level.
///
/// The /ipfs/<cid>/* route falls back to kubo's gateway when cold-storage
/// misses, so in-flight CIDs never 404 during the swap.

const DEFAULT_CONCURRENCY = 12;
const DEFAULT_PIN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes per CID
const PROGRESS_EVERY = 25;

type Summary = {
  considered: number;
  localAdds: number;
  networkFallbacks: number;
  deleted: number;
  missingOnDisk: number;
  cidMismatchUnrecoverable: number;
  failedLocalAdd: number;
  failedNetworkPin: number;
  failedDelete: number;
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

async function* walkCidTree(
  rootDir: string,
  relativePrefix = "",
): AsyncGenerator<{
  absolutePath: string;
  relativePath: string;
  isDirectory: boolean;
}> {
  const here = relativePrefix
    ? path.join(rootDir, relativePrefix)
    : rootDir;
  const entries = await readdir(here, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const childRelative = relativePrefix
      ? `${relativePrefix}/${entry.name}`
      : entry.name;
    const childAbsolute = path.join(here, entry.name);
    if (entry.isDirectory()) {
      yield {
        absolutePath: childAbsolute,
        relativePath: childRelative,
        isDirectory: true,
      };
      yield* walkCidTree(rootDir, childRelative);
    } else if (entry.isFile()) {
      yield {
        absolutePath: childAbsolute,
        relativePath: childRelative,
        isDirectory: false,
      };
    }
  }
}

async function* buildAddMultipartBody(args: {
  cidDir: string;
  cidDirName: string;
  boundary: string;
}): AsyncGenerator<Uint8Array> {
  const { cidDir, cidDirName, boundary } = args;
  const encoder = new TextEncoder();
  const emit = (chunk: string) => encoder.encode(chunk);

  let index = 0;
  const partHeader = (
    filename: string,
    contentType: string,
  ) => {
    const prefix = index === 0 ? "" : "\r\n";
    const suffix = index === 0 ? "" : `-${index}`;
    index += 1;
    return (
      `${prefix}--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file${suffix}"; ` +
      `filename="${encodeURIComponent(filename)}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`
    );
  };

  yield emit(partHeader(cidDirName, "application/x-directory"));

  for await (const entry of walkCidTree(cidDir)) {
    const namedPath = `${cidDirName}/${entry.relativePath}`;
    if (entry.isDirectory) {
      yield emit(partHeader(namedPath, "application/x-directory"));
      continue;
    }
    yield emit(partHeader(namedPath, "application/octet-stream"));
    const fileStream = createReadStream(entry.absolutePath);
    for await (const chunk of fileStream) {
      yield chunk instanceof Uint8Array
        ? chunk
        : new Uint8Array(chunk as Buffer);
    }
  }

  yield emit(`\r\n--${boundary}--\r\n`);
}

/// Primary path: re-add the CID's on-disk directory through kubo's
/// default chunker. Matches Foundation's original CID for complete
/// directories (empirically ~99% of our roots), preserves it on the
/// network, and doesn't round-trip bitswap. Returns the CID kubo
/// produced for the top-level directory.
async function kuboAddLocalDirectory(cid: string, timeoutMs: number) {
  if (!env.KUBO_API_URL) {
    throw new Error("KUBO_API_URL is not configured.");
  }

  const cidDir = getCidDirectory(cid);
  const cidDirName = path.basename(cidDir);
  const boundary = `----agorix-migrate-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  const bodyStream = Readable.toWeb(
    Readable.from(buildAddMultipartBody({ cidDir, cidDirName, boundary })),
  ) as ReadableStream<Uint8Array>;

  const url = new URL("/api/v0/add", env.KUBO_API_URL);
  url.searchParams.set("pin", "true");
  url.searchParams.set("quieter", "true");
  url.searchParams.set("cid-version", "0");
  url.searchParams.set("wrap-with-directory", "false");
  url.searchParams.set("stream-channels", "true");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      ...(env.KUBO_API_AUTH_HEADER
        ? { Authorization: env.KUBO_API_AUTH_HEADER }
        : {}),
    },
    body: bodyStream,
    duplex: "half",
    signal: AbortSignal.timeout(timeoutMs),
  } as RequestInit & { duplex: "half" });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `kubo add ${cid} failed: ${response.status} ${text.slice(0, 300)}`,
    );
  }

  const rawBody = await response.text();
  let rootHash: string | null = null;
  for (const line of rawBody.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const obj = JSON.parse(trimmed) as { Name?: string; Hash?: string };
    if (obj.Name === cidDirName && obj.Hash) rootHash = obj.Hash;
  }
  if (!rootHash) {
    throw new Error(
      `kubo add ${cid} returned no entry named "${cidDirName}".`,
    );
  }
  return rootHash;
}

async function kuboPinRemove(cidToRemove: string, timeoutMs: number) {
  if (!env.KUBO_API_URL) return;
  try {
    const url = new URL("/api/v0/pin/rm", env.KUBO_API_URL);
    url.searchParams.set("arg", cidToRemove);
    await fetch(url, {
      method: "POST",
      headers: env.KUBO_API_AUTH_HEADER
        ? { Authorization: env.KUBO_API_AUTH_HEADER }
        : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Best-effort cleanup — if the pin/rm fails, stale pin will be GC'd
    // eventually.
  }
}

/// Fallback path: ask kubo to fetch the CID via bitswap. Slow (network
/// bound) but handles the cases where our cold-storage copy is a partial
/// subset of the original directory (rare — edition-metadata dirs where
/// we downloaded one token but the original dir had hundreds).
async function kuboPinAddFromNetwork(cid: string, timeoutMs: number) {
  if (!env.KUBO_API_URL) {
    throw new Error("KUBO_API_URL is not configured.");
  }

  const url = new URL("/api/v0/pin/add", env.KUBO_API_URL);
  url.searchParams.set("arg", cid);
  url.searchParams.set("progress", "false");

  const response = await fetch(url, {
    method: "POST",
    headers: env.KUBO_API_AUTH_HEADER
      ? { Authorization: env.KUBO_API_AUTH_HEADER }
      : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `kubo pin/add ${cid} failed: ${response.status} ${text.slice(0, 300)}`,
    );
  }
}

async function pathExists(target: string) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function removeColdStorageDirectory(cid: string) {
  const dir = getCidDirectory(cid);
  if (!(await pathExists(dir))) {
    return { removed: false, missing: true as const };
  }
  await rm(dir, { recursive: true, force: true });
  return { removed: true, missing: false as const };
}

async function processCid(args: {
  cid: string;
  timeoutMs: number;
  dryRun: boolean;
  summary: Summary;
}) {
  const { cid, timeoutMs, dryRun, summary } = args;
  summary.considered += 1;

  const cidDir = getCidDirectory(cid);
  if (!(await pathExists(cidDir))) {
    summary.missingOnDisk += 1;
    return;
  }

  // Primary: re-add from local disk. If the chunker reproduces the
  // original CID (overwhelmingly the case for complete dirs), kubo now
  // has the blocks and the file-tree copy is redundant.
  let localCid: string | null = null;
  try {
    localCid = await kuboAddLocalDirectory(cid, timeoutMs);
  } catch (error) {
    summary.failedLocalAdd += 1;
    console.warn(
      `[migrate] Local add failed for ${cid}: ${(error as Error).message}`,
    );
  }

  if (localCid === cid) {
    summary.localAdds += 1;
  } else if (localCid) {
    // Mismatch. The local dir isn't a complete reproduction of the
    // original (likely a partial edition-metadata dir). Unpin the
    // mismatched CID kubo just created, then try a network fetch for
    // the real one.
    await kuboPinRemove(localCid, 30_000);
    try {
      await kuboPinAddFromNetwork(cid, timeoutMs);
      summary.networkFallbacks += 1;
    } catch (error) {
      summary.failedNetworkPin += 1;
      summary.cidMismatchUnrecoverable += 1;
      console.warn(
        `[migrate] Network pin fallback failed for ${cid}: ${(error as Error).message}`,
      );
      return;
    }
  } else {
    // Local add threw entirely — try network before giving up.
    try {
      await kuboPinAddFromNetwork(cid, timeoutMs);
      summary.networkFallbacks += 1;
    } catch (error) {
      summary.failedNetworkPin += 1;
      console.warn(
        `[migrate] Network pin fallback failed for ${cid}: ${(error as Error).message}`,
      );
      return;
    }
  }

  if (dryRun) return;

  try {
    const result = await removeColdStorageDirectory(cid);
    if (result.removed) summary.deleted += 1;
  } catch (error) {
    summary.failedDelete += 1;
    console.warn(
      `[migrate] Delete failed for ${cid} (${cidDir}): ${(error as Error).message}`,
    );
  }
}

async function main() {
  const concurrency = parseNumericArg("--concurrency", DEFAULT_CONCURRENCY);
  const timeoutMs = parseNumericArg(
    "--timeout-ms",
    DEFAULT_PIN_TIMEOUT_MS,
  );
  const limit = parseNumericArg("--limit", 0); // 0 = no limit
  const dryRun = hasFlag("--dry-run");

  console.log(
    `[migrate] Planning run: concurrency=${concurrency} timeoutMs=${timeoutMs} limit=${limit || "all"} dryRun=${dryRun}`,
  );

  // Pull every downloaded root's CID. We pin by the TOP-level CID kubo
  // knows about; duplicates (many roots can share a CID, and multiple
  // artworks often share a metadata CID) collapse into one pin. Using
  // distinct cuts the workload by a lot.
  const distinctRows = await db.ipfsRoot.findMany({
    where: {
      backupStatus: "DOWNLOADED",
    },
    select: { cid: true },
    distinct: ["cid"],
    orderBy: { lastDownloadedAt: "asc" },
    ...(limit > 0 ? { take: limit } : {}),
  });

  const cids = distinctRows.map((row) => row.cid);
  console.log(`[migrate] ${cids.length} unique CID(s) to process.`);

  const summary: Summary = {
    considered: 0,
    localAdds: 0,
    networkFallbacks: 0,
    deleted: 0,
    missingOnDisk: 0,
    cidMismatchUnrecoverable: 0,
    failedLocalAdd: 0,
    failedNetworkPin: 0,
    failedDelete: 0,
  };

  let nextIndex = 0;
  async function workerLoop() {
    while (true) {
      const index = nextIndex++;
      if (index >= cids.length) return;
      const cid = cids[index];
      if (!cid) return;
      await processCid({ cid, timeoutMs, dryRun, summary });
      if (summary.considered % PROGRESS_EVERY === 0) {
        console.log(
          `[migrate] progress: ${summary.considered}/${cids.length} (` +
            `local=${summary.localAdds} network=${summary.networkFallbacks} ` +
            `deleted=${summary.deleted} missing=${summary.missingOnDisk} ` +
            `failedLocal=${summary.failedLocalAdd} failedNet=${summary.failedNetworkPin} ` +
            `failedDelete=${summary.failedDelete})`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => workerLoop()),
  );

  console.log(`[migrate] done: ${JSON.stringify(summary)}`);

  // Reveal whatever's left on disk under the ipfs tree — helpful for
  // verifying end-state size after a full drain.
  try {
    const remaining = await db.ipfsRoot.count({
      where: { backupStatus: "DOWNLOADED" },
    });
    console.log(`[migrate] IpfsRoot backupStatus=DOWNLOADED remaining: ${remaining}`);
  } catch {
    // Best-effort — not critical.
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

