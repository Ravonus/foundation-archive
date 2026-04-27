/* eslint-disable complexity, max-lines, max-lines-per-function, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unused-vars */

import { createReadStream, createWriteStream } from "node:fs";
import {
  copyFile,
  link,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { env } from "~/env";
import { formatBytes } from "~/lib/utils";
import { buildGatewayUrl } from "~/server/archive/ipfs";

const ROOT_FILE_SENTINEL = "__root__";
const ARCHIVE_DOWNLOAD_TIMEOUT_MS = 60 * 60 * 1000;
const ARCHIVE_SOURCE_FETCH_TIMEOUT_MS = 10 * 60 * 1000;
const ARCHIVE_PIN_TIMEOUT_MS = 10 * 60 * 1000;

type RustArchiverDownloadResponse = {
  absolute_path: string;
  local_directory: string;
  byte_size: number;
  mime_type: string | null;
};

const RUST_ARCHIVER_RETRY_COOLDOWN_MS = 30_000;

class RustArchiverUnavailableError extends Error {
  override cause: unknown;

  constructor(cause: unknown) {
    super("Rust archiver is unreachable.");
    this.name = "RustArchiverUnavailableError";
    this.cause = cause;
  }
}

let rustArchiverRetryAt = 0;

function toAbsoluteStorageRoot() {
  return path.isAbsolute(env.ARCHIVE_STORAGE_DIR)
    ? env.ARCHIVE_STORAGE_DIR
    : path.resolve(
        /* turbopackIgnore: true */ process.cwd(),
        env.ARCHIVE_STORAGE_DIR,
      );
}

function toAbsoluteHotStorageRoot() {
  return path.isAbsolute(env.ARCHIVE_HOT_STORAGE_DIR)
    ? env.ARCHIVE_HOT_STORAGE_DIR
    : path.resolve(
        /* turbopackIgnore: true */ process.cwd(),
        env.ARCHIVE_HOT_STORAGE_DIR,
      );
}

function cleanRelativePath(relativePath: string | null | undefined) {
  const safePath = (relativePath ?? "").replace(/^\/+/, "");

  if (safePath.includes("..")) {
    throw new Error(
      "Refusing to work with a relative path that escapes the archive root.",
    );
  }

  return safePath || ROOT_FILE_SENTINEL;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/g, "");
}

function shouldAttemptRustArchiver() {
  return Date.now() >= rustArchiverRetryAt;
}

function clearRustArchiverCooldown() {
  rustArchiverRetryAt = 0;
}

function pauseRustArchiverRetries() {
  const now = Date.now();
  const wasCoolingDown = rustArchiverRetryAt > now;
  rustArchiverRetryAt = now + RUST_ARCHIVER_RETRY_COOLDOWN_MS;
  return !wasCoolingDown;
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function warnRustArchiverFallback(
  action: "download" | "pin",
  fallbackTarget: "Node storage path" | "Node Kubo path",
  error: unknown,
) {
  if (error instanceof RustArchiverUnavailableError) {
    if (!pauseRustArchiverRetries()) {
      return;
    }

    console.warn(
      `[archive] Rust archiver unavailable for ${action}, falling back to ${fallbackTarget} for ${RUST_ARCHIVER_RETRY_COOLDOWN_MS / 1000}s:`,
      formatErrorMessage(error.cause),
    );
    return;
  }

  console.warn(
    `[archive] Rust archiver ${action} failed, falling back to ${fallbackTarget}:`,
    formatErrorMessage(error),
  );
}

function temporaryFilePath(targetPath: string) {
  return `${targetPath}.part-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureParentDirectory(targetPath: string) {
  await mkdir(path.dirname(targetPath), { recursive: true });
}

async function discardHotFile(hotPath: string) {
  try {
    await rm(hotPath, { force: true });
  } catch (error) {
    console.warn(
      `[archive] Unable to clear promoted hot file ${hotPath}:`,
      formatErrorMessage(error),
    );
  }
}

async function promoteHotFileToCold(hotPath: string, coldPath: string) {
  if (await pathExists(coldPath)) {
    await discardHotFile(hotPath);
    return;
  }

  await ensureParentDirectory(coldPath);

  try {
    await link(hotPath, coldPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      await discardHotFile(hotPath);
      return;
    }

    await copyFile(hotPath, coldPath);
  }

  await discardHotFile(hotPath);
}

async function requestRustArchiver<T>(
  endpoint: string,
  payload: Record<string, unknown>,
  timeoutMs = ARCHIVE_PIN_TIMEOUT_MS,
) {
  if (!env.ARCHIVE_ARCHIVER_URL) {
    return null;
  }

  let response: Response;
  try {
    response = await fetch(
      `${trimTrailingSlash(env.ARCHIVE_ARCHIVER_URL)}${endpoint}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
  } catch (error) {
    throw new RustArchiverUnavailableError(error);
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      detail?.error ?? `Rust archiver request failed with ${response.status}.`,
    );
  }

  return (await response.json()) as T;
}

async function downloadFileToArchiveWithJs(input: {
  cid: string;
  relativePath: string | null | undefined;
  gatewayUrl: string | null | undefined;
  originalUrl: string | null | undefined;
  gatewayUrls?: readonly string[];
}) {
  const targetPath = getArchivedFilePath(input.cid, input.relativePath);
  const hotPath = getHotArchivedFilePath(input.cid, input.relativePath);

  if (await pathExists(targetPath)) {
    await discardHotFile(hotPath);
    const fileStats = await stat(targetPath);

    return {
      absolutePath: targetPath,
      localDirectory: getCidDirectory(input.cid),
      byteSize: fileStats.size,
      mimeType: null,
    };
  }

  if (await pathExists(hotPath)) {
    await promoteHotFileToCold(hotPath, targetPath);
    const fileStats = await stat(targetPath);

    return {
      absolutePath: targetPath,
      localDirectory: getCidDirectory(input.cid),
      byteSize: fileStats.size,
      mimeType: null,
    };
  }

  const sourceUrls = buildGatewayFallbackUrls({
    cid: input.cid,
    relativePath: input.relativePath,
    primaryGatewayUrl: input.gatewayUrl,
    extraGatewayUrls: input.gatewayUrls,
  });
  if (input.originalUrl) {
    sourceUrls.push(input.originalUrl);
  }

  const uniqueSourceUrls = Array.from(new Set(sourceUrls));

  if (uniqueSourceUrls.length === 0) {
    throw new Error(
      `Unable to download CID ${input.cid} because no source URL was available.`,
    );
  }

  let lastError: unknown = null;
  for (const sourceUrl of uniqueSourceUrls) {
    let response: Response;
    try {
      response = await fetch(sourceUrl, {
        headers: {
          "user-agent":
            "foundation-archive/0.1 (+https://foundation.agorix.io)",
        },
        signal: AbortSignal.timeout(ARCHIVE_SOURCE_FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;
      continue;
    }

    if (!response.ok || !response.body) {
      lastError = new Error(
        `Failed to download ${sourceUrl}: ${response.status}`,
      );
      continue;
    }

    await ensureParentDirectory(hotPath);
    const tempHotPath = temporaryFilePath(hotPath);

    try {
      await pipeline(
        Readable.fromWeb(
          response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
        ),
        createWriteStream(tempHotPath),
      );
      await rename(tempHotPath, hotPath);
    } catch (error) {
      await rm(tempHotPath, { force: true });
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        lastError = error;
        continue;
      }
    }

    await promoteHotFileToCold(hotPath, targetPath);
    const fileStats = await stat(targetPath);

    return {
      absolutePath: targetPath,
      localDirectory: getCidDirectory(input.cid),
      byteSize: fileStats.size,
      mimeType: response.headers.get("content-type"),
    };
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Unable to download CID ${input.cid} from any archive source.`);
}

/// Walks the on-disk directory for a cold-storage CID in a deterministic
/// depth-first order so the multipart stream below reproduces the exact
/// UnixFS tree (and therefore the exact CID) that Foundation produced.
async function* walkCidTreeEntries(
  rootDir: string,
  relativePrefix = "",
): AsyncGenerator<{
  absolutePath: string;
  relativePath: string;
  isDirectory: boolean;
}> {
  const here = relativePrefix ? path.join(rootDir, relativePrefix) : rootDir;
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
      yield* walkCidTreeEntries(rootDir, childRelative);
    } else if (entry.isFile()) {
      yield {
        absolutePath: childAbsolute,
        relativePath: childRelative,
        isDirectory: false,
      };
    }
  }
}

async function* streamAddMultipartBody(args: {
  cidDir: string;
  cidDirName: string;
  boundary: string;
}): AsyncGenerator<Uint8Array> {
  const { cidDir, cidDirName, boundary } = args;
  const encoder = new TextEncoder();
  const emit = (chunk: string) => encoder.encode(chunk);

  let index = 0;
  const partHeader = (filename: string, contentType: string) => {
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

  for await (const entry of walkCidTreeEntries(cidDir)) {
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

/// Single-file variant of the multipart body. Foundation stores
/// single-file CIDs on disk as `ipfs/<cid>/__root__` because the
/// download path needs a stable filename, but the CID itself is the
/// bare file — NOT a UnixFS directory containing a file named
/// `__root__`. Wrapping it through `streamAddMultipartBody` produces
/// `Qm<different>` (dir-containing-a-file) and the pin gets skipped as
/// a mismatch. This emits one file part, no directory wrapper, so
/// kubo's /api/v0/add returns the bare-file CID.
async function* streamAddSingleFileBody(args: {
  absolutePath: string;
  boundary: string;
}): AsyncGenerator<Uint8Array> {
  const { absolutePath, boundary } = args;
  const encoder = new TextEncoder();
  yield encoder.encode(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; ` +
      `filename="${encodeURIComponent(ROOT_FILE_SENTINEL)}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
  );
  const fileStream = createReadStream(absolutePath);
  for await (const chunk of fileStream) {
    yield chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as Buffer);
  }
  yield encoder.encode(`\r\n--${boundary}--\r\n`);
}

async function detectCidLayout(
  cidDir: string,
): Promise<
  { kind: "single-file"; absolutePath: string } | { kind: "directory" }
> {
  const entries = await readdir(cidDir, { withFileTypes: true });
  if (
    entries.length === 1 &&
    entries[0]!.isFile() &&
    entries[0]!.name === ROOT_FILE_SENTINEL
  ) {
    return {
      kind: "single-file",
      absolutePath: path.join(cidDir, ROOT_FILE_SENTINEL),
    };
  }
  return { kind: "directory" };
}

async function kuboPinRemoveSilently(rawCid: string) {
  if (!env.KUBO_API_URL) return;
  try {
    const url = new URL("/api/v0/pin/rm", env.KUBO_API_URL);
    url.searchParams.set("arg", rawCid);
    await fetch(url, {
      method: "POST",
      headers: env.KUBO_API_AUTH_HEADER
        ? { Authorization: env.KUBO_API_AUTH_HEADER }
        : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    /* best-effort */
  }
}

// Short enough that bitswap either resolves via peers that actually
// have the content or we bail — avoids the pathological case where 16
// worker jobs each hold a multi-minute pin request open and freeze kubo
// for everyone else (including the Next /ipfs gateway proxy).
const KUBO_NETWORK_PIN_TIMEOUT_MS = 45_000;
const KUBO_NETWORK_PIN_MAX_CONCURRENCY = 3;

// Simple async semaphore: hand out up to N slots, block the rest.
function makeSemaphore(max: number) {
  let active = 0;
  const waiters: Array<() => void> = [];
  const release = () => {
    active -= 1;
    const next = waiters.shift();
    if (next) next();
  };
  return async function acquire<T>(job: () => Promise<T>): Promise<T> {
    if (active >= max) {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    active += 1;
    try {
      return await job();
    } finally {
      release();
    }
  };
}

const networkPinSlot = makeSemaphore(KUBO_NETWORK_PIN_MAX_CONCURRENCY);

/// Fallback pin via bitswap: asks kubo to resolve + fetch the CID from
/// the wider network and store all blocks locally. Used when our local
/// dir is a partial subset and local-add can't reproduce the stored
/// CID. Rate-limited — too many concurrent bitswap requests starve
/// kubo of the attention it needs to answer simple /api/v0/pin/ls
/// and /api/v0/cat calls, which hangs the web pod.
async function kuboNetworkPin(cid: string): Promise<void> {
  if (!env.KUBO_API_URL) {
    throw new Error("KUBO_API_URL is not configured.");
  }
  return networkPinSlot(async () => {
    const url = new URL("/api/v0/pin/add", env.KUBO_API_URL);
    url.searchParams.set("arg", cid);
    url.searchParams.set("progress", "false");
    const response = await fetch(url, {
      method: "POST",
      headers: env.KUBO_API_AUTH_HEADER
        ? { Authorization: env.KUBO_API_AUTH_HEADER }
        : undefined,
      signal: AbortSignal.timeout(KUBO_NETWORK_PIN_TIMEOUT_MS),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Kubo network pin/add failed for ${cid}: ${response.status} ${text.slice(0, 200)}`,
      );
    }
  });
}

/// Cheap pin existence check. Uses `/api/v0/pin/ls?arg=<cid>&type=recursive`,
/// which returns 200 + a JSON body listing the cid if pinned, or 500
/// with an error body otherwise. We treat 200 as "already pinned"; any
/// other outcome means we still need to do the add ourselves.
export async function kuboHasRecursivePin(cid: string): Promise<boolean> {
  if (!env.KUBO_API_URL) return false;
  try {
    const url = new URL("/api/v0/pin/ls", env.KUBO_API_URL);
    url.searchParams.set("arg", cid);
    url.searchParams.set("type", "recursive");
    url.searchParams.set("quiet", "true");
    const response = await fetch(url, {
      method: "POST",
      headers: env.KUBO_API_AUTH_HEADER
        ? { Authorization: env.KUBO_API_AUTH_HEADER }
        : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return false;
    const body = await response.text();
    // `--quiet` prints a line per pinned CID. Any non-empty body means
    // at least one match.
    return body.trim().length > 0;
  } catch {
    return false;
  }
}

/// Re-adds the cold-storage directory for `cid` through kubo's default
/// chunker (plain `ipfs add -r`, NOT `--nocopy` — that flag forces
/// raw-leaves=true which would change the CID). If the produced CID
/// matches the stored one, kubo's blockstore now owns the content and
/// we can discard the file-tree copy so the NAS holds one copy, not
/// two. If it doesn't match (local directory is a partial subset of
/// the original — hydration hasn't filled in siblings yet), we unpin
/// what kubo just added and keep the file-tree copy in place so future
/// passes can retry after hydration.
async function pinCidWithKuboFromNode(cid: string) {
  if (!env.KUBO_API_URL) {
    return {
      pinned: false as const,
      provider: "none",
      reference: null,
      freedDiskBytes: 0,
    };
  }

  const cidDir = getCidDirectory(cid);

  // Fast path: kubo already has the CID pinned — either from a prior
  // worker cycle or from the migration script that walks cold-storage.
  // Don't stream bytes to kubo twice; just clean up whatever cold-
  // storage leftover remains and report success.
  if (await kuboHasRecursivePin(cid)) {
    let freedDiskBytes = 0;
    try {
      const stats = await stat(cidDir);
      if (stats.isDirectory()) {
        try {
          freedDiskBytes = await computeDirectorySize(cidDir);
        } catch {
          freedDiskBytes = 0;
        }
        await rm(cidDir, { recursive: true, force: true });
      }
    } catch {
      // cold-storage dir is already gone — perfect, nothing to clean.
    }
    return {
      pinned: true as const,
      provider: "kubo",
      reference: cid,
      freedDiskBytes,
    };
  }

  let cidStats;
  try {
    cidStats = await stat(cidDir);
  } catch {
    throw new Error(
      `Kubo pin skipped for ${cid}: local archive directory ${cidDir} is missing.`,
    );
  }
  if (!cidStats.isDirectory()) {
    throw new Error(
      `Kubo pin skipped for ${cid}: ${cidDir} is not a directory.`,
    );
  }

  const layout = await detectCidLayout(cidDir);
  const cidDirName = path.basename(cidDir);
  const boundary = `----agorix-kubo-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  const bodyStream = Readable.toWeb(
    Readable.from(
      layout.kind === "single-file"
        ? streamAddSingleFileBody({
            absolutePath: layout.absolutePath,
            boundary,
          })
        : streamAddMultipartBody({ cidDir, cidDirName, boundary }),
    ),
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
    signal: AbortSignal.timeout(ARCHIVE_PIN_TIMEOUT_MS),
  } as RequestInit & { duplex: "half" });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Kubo add failed for ${cid}: ${response.status} ${detail.slice(0, 300)}`,
    );
  }

  const rawBody = await response.text();
  let rootHash: string | null = null;
  if (layout.kind === "single-file") {
    // Single-file response is one NDJSON line with the bare file CID.
    for (const line of rawBody.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const obj = JSON.parse(trimmed) as { Hash?: string };
      if (obj.Hash) rootHash = obj.Hash;
    }
    if (!rootHash) {
      throw new Error(
        `Kubo add for ${cid} (single-file) returned no Hash entry.`,
      );
    }
  } else {
    for (const line of rawBody.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const obj = JSON.parse(trimmed) as { Name?: string; Hash?: string };
      if (obj.Name === cidDirName && obj.Hash) rootHash = obj.Hash;
    }
    if (!rootHash) {
      throw new Error(
        `Kubo add for ${cid} returned no entry named "${cidDirName}".`,
      );
    }
  }

  if (rootHash !== cid) {
    // Partial directory — local add produced a different CID. Unpin
    // the stray CID kubo just created and accept the skip; the old
    // bitswap-network-pin fallback tied up worker slots for minutes
    // per cold CID and ended up halving overall throughput. The row
    // stays DOWNLOADED on disk and will re-attempt on the next worker
    // pass if hydration fills in siblings later.
    await kuboPinRemoveSilently(rootHash);
    return {
      pinned: false as const,
      provider: "skipped-cid-mismatch",
      reference: rootHash,
      freedDiskBytes: 0,
    };
  }

  // Match — kubo's blockstore now owns the DAG. The file-tree copy is
  // redundant. Best-effort delete; if the rm fails (CIFS hiccup, etc.)
  // we leave the copy and a future pass will reconcile.
  let freedDiskBytes = 0;
  try {
    freedDiskBytes = await computeDirectorySize(cidDir);
  } catch {
    freedDiskBytes = 0;
  }
  try {
    await rm(cidDir, { recursive: true, force: true });
  } catch {
    freedDiskBytes = 0;
  }

  return {
    pinned: true as const,
    provider: "kubo",
    reference: cid,
    freedDiskBytes,
  };
}

async function computeDirectorySize(dir: string): Promise<number> {
  let total = 0;
  for await (const entry of walkCidTreeEntries(dir)) {
    if (entry.isDirectory) continue;
    try {
      const s = await stat(entry.absolutePath);
      total += s.size;
    } catch {
      /* ignore */
    }
  }
  return total;
}

export function getArchiveStorageRoot() {
  return toAbsoluteStorageRoot();
}

export function getArchiveHotStorageRoot() {
  return toAbsoluteHotStorageRoot();
}

export function getCidDirectory(cid: string) {
  return path.join(getArchiveStorageRoot(), "ipfs", cid);
}

export function getHotCidDirectory(cid: string) {
  return path.join(getArchiveHotStorageRoot(), "ipfs", cid);
}

export function getArchivedFilePath(
  cid: string,
  relativePath: string | null | undefined,
) {
  const safeRelativePath = cleanRelativePath(relativePath);
  return path.join(getCidDirectory(cid), safeRelativePath);
}

export function getHotArchivedFilePath(
  cid: string,
  relativePath: string | null | undefined,
) {
  const safeRelativePath = cleanRelativePath(relativePath);
  return path.join(getHotCidDirectory(cid), safeRelativePath);
}

function buildGatewayFallbackUrls(input: {
  cid: string;
  relativePath: string | null | undefined;
  primaryGatewayUrl: string | null | undefined;
  extraGatewayUrls?: readonly string[];
}): string[] {
  const { cid, relativePath, primaryGatewayUrl, extraGatewayUrls = [] } = input;
  const pathSuffix = relativePath ? `/${relativePath.replace(/^\/+/, "")}` : "";
  const urls: string[] = [];
  const seen = new Set<string>();
  const push = (url: string | null | undefined) => {
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    urls.push(trimmed);
  };

  for (const url of extraGatewayUrls) {
    push(url);
  }

  push(primaryGatewayUrl);

  if (env.KUBO_API_URL) {
    try {
      const kuboGateway = new URL(env.KUBO_API_URL);
      kuboGateway.port = "8080";
      kuboGateway.pathname = `/ipfs/${cid}${pathSuffix}`;
      kuboGateway.search = "";
      push(kuboGateway.toString());
    } catch {
      // ignore malformed KUBO_API_URL
    }
  }

  for (const host of [
    "https://dweb.link",
    "https://cloudflare-ipfs.com",
    "https://nftstorage.link",
    "https://4everland.io",
  ]) {
    push(`${host}/ipfs/${cid}${pathSuffix}`);
  }

  return urls;
}

export async function downloadFileToArchive(input: {
  cid: string;
  relativePath: string | null | undefined;
  gatewayUrl: string | null | undefined;
  originalUrl: string | null | undefined;
  gatewayUrls?: readonly string[];
}) {
  const gatewayUrls = buildGatewayFallbackUrls({
    cid: input.cid,
    relativePath: input.relativePath,
    primaryGatewayUrl: input.gatewayUrl,
    extraGatewayUrls: input.gatewayUrls,
  });

  if (env.ARCHIVE_ARCHIVER_URL && shouldAttemptRustArchiver()) {
    try {
      const response = await requestRustArchiver<RustArchiverDownloadResponse>(
        "/archive/root",
        {
          cid: input.cid,
          relative_path: input.relativePath,
          gateway_url: gatewayUrls[0] ?? input.gatewayUrl,
          gateway_urls: gatewayUrls,
          original_url: input.originalUrl,
          final_root_dir: getArchiveStorageRoot(),
          hot_root_dir: getArchiveHotStorageRoot(),
        },
        ARCHIVE_DOWNLOAD_TIMEOUT_MS,
      );

      if (response) {
        clearRustArchiverCooldown();
        return {
          absolutePath: response.absolute_path,
          localDirectory: response.local_directory,
          byteSize: response.byte_size,
          mimeType: response.mime_type,
        };
      }
    } catch (error) {
      warnRustArchiverFallback("download", "Node storage path", error);
    }
  }

  return downloadFileToArchiveWithJs(input);
}

type KuboLink = {
  Name?: string;
  Hash?: string;
  Size?: number;
  Type?: number;
};

// Kubo's /api/v0/ls tries bitswap/DHT first and blocks until it
// resolves each link's type + size. For CIDs we've never touched, that
// routinely hits 20 s+ on content that's otherwise instantly available
// from a gateway. Keep the kubo call short so we fall over to the
// gateway path fast.
const KUBO_LS_TIMEOUT_MS = 3_000;
const GATEWAY_LS_TIMEOUT_MS = 10_000;
const HYDRATE_CONCURRENCY = 6;
const KUBO_DIRECTORY_TYPES = new Set([1, 5]);
const KUBO_LS_MAX_DEPTH = 8;

export type DirectoryEntry = {
  path: string;
  cid: string;
  size: number;
};

async function kuboLsLinks(arg: string): Promise<KuboLink[]> {
  if (!env.KUBO_API_URL) return [];

  const endpoint = new URL("/api/v0/ls", env.KUBO_API_URL);
  endpoint.searchParams.set("arg", arg);
  // `size=false` skips the expensive cumulative-size traversal. We only
  // use sizes for the hydration budget; a per-file HEAD during download
  // covers that case already.
  endpoint.searchParams.set("size", "false");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: env.KUBO_API_AUTH_HEADER
      ? { Authorization: env.KUBO_API_AUTH_HEADER }
      : undefined,
    signal: AbortSignal.timeout(KUBO_LS_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Kubo ls failed for ${arg}: ${response.status}`);
  }

  const result = (await response.json()) as {
    Objects?: Array<{ Links?: KuboLink[] }>;
  };

  return result.Objects?.[0]?.Links ?? [];
}

/// Fallback directory listing via HTTP gateway. Ask for
/// `application/vnd.ipld.dag-json` — the gateway returns the UnixFS
/// node as JSON without the bitswap lookup cost kubo's /api/v0/ls pays.
/// Type info is inferred later during recursion (call this again for
/// any child we need to walk into).
async function gatewayLsLinks(arg: string): Promise<KuboLink[]> {
  // `arg` is either "<cid>" or "<cid>/<subpath>". Build gateway URL.
  const separator = arg.indexOf("/");
  const cid = separator < 0 ? arg : arg.slice(0, separator);
  const sub = separator < 0 ? "" : arg.slice(separator);
  const base = env.IPFS_GATEWAY_BASE_URL.replace(/\/+$/, "");
  const url = `${base}/ipfs/${cid}${sub}`;

  const response = await fetch(url, {
    headers: { Accept: "application/vnd.ipld.dag-json" },
    signal: AbortSignal.timeout(GATEWAY_LS_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Gateway ls failed for ${arg}: ${response.status}`);
  }

  const body = (await response.json()) as {
    Links?: Array<{
      Hash?: { "/"?: string } | string;
      Name?: string;
      Tsize?: number;
    }>;
  };

  return (body.Links ?? []).map((link) => {
    const hash =
      typeof link.Hash === "string" ? link.Hash : (link.Hash?.["/"] ?? "");
    return {
      Name: link.Name,
      Hash: hash,
      Size: link.Tsize ?? 0,
      // dag-json doesn't include UnixFS type info. expandKuboLink
      // re-enters gatewayLs if needed; any link whose name indicates a
      // file (has an extension) we treat as a file.
      Type: undefined,
    } satisfies KuboLink;
  });
}

/// Parse the gateway's HTML directory listing as a last-ditch fallback.
/// ipfs.io rejects `Accept: application/vnd.ipld.dag-json` for a lot of
/// Foundation content (returns 406), but it reliably serves the default
/// HTML index, which has `<a href="/ipfs/<childCid>?filename=<name>">`
/// entries for each child. We only need name + CID to continue
/// hydration, so the regex pull is enough.
async function gatewayLsLinksViaHtml(arg: string): Promise<KuboLink[]> {
  const separator = arg.indexOf("/");
  const cid = separator < 0 ? arg : arg.slice(0, separator);
  const sub = separator < 0 ? "" : arg.slice(separator);
  const base = env.IPFS_GATEWAY_BASE_URL.replace(/\/+$/, "");
  // Trailing slash is required — ipfs.io 301s otherwise and the Accept
  // header below is lost on the redirect.
  const url = `${base}/ipfs/${cid}${sub}/`;

  const response = await fetch(url, {
    headers: { Accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(GATEWAY_LS_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Gateway HTML ls failed for ${arg}: ${response.status}`);
  }

  const html = await response.text();
  // Each child file renders as `<a href="/ipfs/<childCid>?filename=<name>">`.
  // (The row also has a `<a href="/ipfs/<rootCid>/<name>">` but that path
  // is resolved through the rootCid rather than pointing at the leaf.)
  const pattern = /href="\/ipfs\/([^"/?]+)\?filename=([^"]+)"/g;
  const links: KuboLink[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(pattern)) {
    const childCid = match[1];
    const rawName = match[2];
    if (!childCid || !rawName) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(rawName);
    } catch {
      decoded = rawName;
    }
    // Dedupe — the HTML sometimes lists the same entry twice (e.g.
    // "copy" buttons include a second href).
    if (seen.has(decoded)) continue;
    seen.add(decoded);
    links.push({
      Name: decoded,
      Hash: childCid,
      Size: 0,
      // HTML listings don't tell us file vs dir. expandKuboLink treats
      // Type=undefined as a file, which is correct for all Foundation
      // content we've observed.
      Type: undefined,
    });
  }
  return links;
}

async function resolveLsLinks(arg: string): Promise<KuboLink[]> {
  try {
    return await kuboLsLinks(arg);
  } catch (kuboError) {
    try {
      return await gatewayLsLinks(arg);
    } catch (dagJsonError) {
      try {
        return await gatewayLsLinksViaHtml(arg);
      } catch (htmlError) {
        const kuboMessage = formatErrorMessage(kuboError);
        const dagJsonMessage = formatErrorMessage(dagJsonError);
        const htmlMessage = formatErrorMessage(htmlError);
        throw new Error(
          `ls failed (kubo: ${kuboMessage}; dag-json: ${dagJsonMessage}; html: ${htmlMessage})`,
        );
      }
    }
  }
}

async function expandKuboLink(args: {
  rootCid: string;
  basePath: string;
  link: KuboLink;
  depth: number;
}): Promise<DirectoryEntry[]> {
  const name = args.link.Name?.trim();
  if (!name) return [];

  const childPath = args.basePath ? `${args.basePath}/${name}` : name;
  const isKnownDirectory =
    args.link.Type !== undefined && KUBO_DIRECTORY_TYPES.has(args.link.Type);

  if (isKnownDirectory) {
    return listDirectoryRecursive(args.rootCid, childPath, args.depth + 1);
  }

  // When the gateway fallback populated the link (Type=undefined), we
  // can't tell directory vs file. Almost all Foundation content is flat
  // dirs of named files (nft.jpg, metadata.json, 1.json, etc). Treat
  // named links as files; callers that need deep recursion should seed
  // a kubo pin first so the richer kubo ls works.
  return [
    {
      path: childPath,
      cid: args.link.Hash ?? "",
      size: args.link.Size ?? 0,
    },
  ];
}

async function listDirectoryRecursive(
  rootCid: string,
  basePath = "",
  depth = 0,
): Promise<DirectoryEntry[]> {
  if (depth > KUBO_LS_MAX_DEPTH) return [];

  const arg = basePath ? `${rootCid}/${basePath}` : rootCid;
  const links = await resolveLsLinks(arg);
  const out: DirectoryEntry[] = [];

  // Expand links in parallel so a dir of many named children doesn't
  // pay N sequential round-trips for its own traversal.
  const expansions = await Promise.all(
    links.map((link) => expandKuboLink({ rootCid, basePath, link, depth })),
  );
  for (const expanded of expansions) {
    out.push(...expanded);
  }

  return out;
}

export function listCidDirectoryEntries(cid: string) {
  return listDirectoryRecursive(cid);
}

export type DirectoryHydrationResult = {
  attempted: number;
  downloaded: number;
  skipped: number;
  totalBytes: number;
  truncatedByBudget: boolean;
};

export async function hydrateCidDirectory(args: {
  cid: string;
  skipPath?: string | null;
  sizeBudget?: number;
}): Promise<DirectoryHydrationResult> {
  const sizeBudget = args.sizeBudget ?? env.ARCHIVE_DIRECTORY_MAX_BYTES;
  const empty: DirectoryHydrationResult = {
    attempted: 0,
    downloaded: 0,
    skipped: 0,
    totalBytes: 0,
    truncatedByBudget: false,
  };

  if (!env.KUBO_API_URL) {
    return empty;
  }

  let entries: DirectoryEntry[];
  try {
    entries = await listDirectoryRecursive(args.cid);
  } catch (error) {
    console.warn(
      `[archive] Skipping sibling hydration for ${args.cid}: ls failed —`,
      formatErrorMessage(error),
    );
    return empty;
  }

  if (entries.length === 0) {
    return empty;
  }

  const cleanedSkip = args.skipPath ? cleanRelativePath(args.skipPath) : null;

  // First pass: drop already-present and the skip path, enforce the
  // size budget in the deterministic entry order. Everything that
  // survives goes into `toDownload` and gets pulled in parallel.
  const toDownload: DirectoryEntry[] = [];
  let skipped = 0;
  let plannedBytes = 0;
  let truncatedByBudget = false;

  for (const entry of entries) {
    const cleanedPath = cleanRelativePath(entry.path);
    if (cleanedPath === cleanedSkip) {
      skipped += 1;
      continue;
    }
    const targetPath = getArchivedFilePath(args.cid, entry.path);
    if (await pathExists(targetPath)) {
      skipped += 1;
      continue;
    }
    if (entry.size > 0 && plannedBytes + entry.size > sizeBudget) {
      truncatedByBudget = true;
      console.warn(
        `[archive] Sibling hydration for ${args.cid} stopped at ${formatBytes(plannedBytes)} (budget ${formatBytes(sizeBudget)}); remaining entries skipped.`,
      );
      break;
    }
    toDownload.push(entry);
    plannedBytes += entry.size;
  }

  let attempted = 0;
  let downloaded = 0;
  let totalBytes = 0;

  // Parallel downloads with a fixed-size worker pool. Keeping this
  // modest (HYDRATE_CONCURRENCY=6) avoids saturating the gateway AND
  // the NAS writes at the same time — the archiver container already
  // runs several artworks concurrently at the worker level.
  let cursor = 0;
  const runOne = async (): Promise<void> => {
    while (true) {
      const index = cursor++;
      if (index >= toDownload.length) return;
      const entry = toDownload[index];
      if (!entry) return;
      attempted += 1;
      try {
        const result = await downloadFileToArchive({
          cid: args.cid,
          relativePath: entry.path,
          gatewayUrl: buildGatewayUrl(args.cid, entry.path),
          originalUrl: null,
        });
        totalBytes += result.byteSize;
        downloaded += 1;
      } catch (error) {
        console.warn(
          `[archive] Sibling hydration failed for ${args.cid}/${entry.path}:`,
          formatErrorMessage(error),
        );
      }
    }
  };

  await Promise.all(
    Array.from({ length: HYDRATE_CONCURRENCY }, () => runOne()),
  );

  return {
    attempted,
    downloaded,
    skipped,
    totalBytes,
    truncatedByBudget,
  };
}

export async function readArchivedAsset(cid: string, parts: string[]) {
  const requestedPath = parts.length > 0 ? parts.join("/") : "";
  const absolutePath = getArchivedFilePath(cid, requestedPath);
  const contents = await readFile(absolutePath);
  return {
    absolutePath,
    contents,
  };
}

export async function archivedAssetExists(
  cid: string,
  relativePath: string | null | undefined,
) {
  try {
    await stat(getArchivedFilePath(cid, relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function ensureArchiveRoot() {
  await mkdir(path.join(getArchiveStorageRoot(), "ipfs"), { recursive: true });
  await mkdir(path.join(getArchiveHotStorageRoot(), "ipfs"), {
    recursive: true,
  });
}

/// The pin step now does a plain `ipfs add -r` against cold-storage
/// instead of asking kubo to fetch the CID via bitswap. With the blocks
/// already on the NAS that kubo's repo also lives on, the add is purely
/// local work. Matching CID → delete the file-tree copy and keep only
/// the kubo-blockstore copy. Non-matching CID (partial directory) →
/// caller can surface the mismatch; the file-tree copy is preserved so
/// a later pass after hydration retries.
///
/// The rust-archiver `/pin/cid` proxy used to forward a bitswap pin/add;
/// it no longer has a role in the pin path and is bypassed. Downloads
/// still route through it.
export async function pinCidWithKubo(cid: string) {
  return pinCidWithKuboFromNode(cid);
}

export async function pinCidWithKuboNetwork(cid: string) {
  await kuboNetworkPin(cid);
  return {
    pinned: true as const,
    provider: "kubo-network",
    reference: cid,
    freedDiskBytes: 0,
  };
}
