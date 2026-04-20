import {
  copyFile,
  link,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { env } from "~/env";
import { formatBytes } from "~/lib/utils";
import { buildGatewayUrl } from "~/server/archive/ipfs";

const ROOT_FILE_SENTINEL = "__root__";
const ARCHIVE_DOWNLOAD_TIMEOUT_MS = 60 * 60 * 1000;
const ARCHIVE_PIN_TIMEOUT_MS = 10 * 60 * 1000;

type RustArchiverDownloadResponse = {
  absolute_path: string;
  local_directory: string;
  byte_size: number;
  mime_type: string | null;
};

type RustArchiverPinResponse = {
  pinned: boolean;
  provider: string;
  reference: string | null;
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

  const sourceUrl = input.gatewayUrl ?? input.originalUrl;
  if (!sourceUrl) {
    throw new Error(
      `Unable to download CID ${input.cid} because no source URL was available.`,
    );
  }

  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent": "foundation-archive/0.1 (+https://foundation.app)",
    },
    signal: AbortSignal.timeout(ARCHIVE_DOWNLOAD_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${sourceUrl}: ${response.status}`);
  }

  await ensureParentDirectory(hotPath);
  const tempHotPath = temporaryFilePath(hotPath);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(tempHotPath, buffer);

  try {
    await rename(tempHotPath, hotPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }

    await rm(tempHotPath, { force: true });
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

async function pinCidWithKuboFromNode(cid: string) {
  if (!env.KUBO_API_URL) {
    return {
      pinned: false,
      provider: "none",
      reference: null,
    };
  }

  const endpoint = new URL("/api/v0/pin/add", env.KUBO_API_URL);
  endpoint.searchParams.set("arg", cid);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: env.KUBO_API_AUTH_HEADER
      ? {
          Authorization: env.KUBO_API_AUTH_HEADER,
        }
      : undefined,
    signal: AbortSignal.timeout(ARCHIVE_PIN_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Kubo pin failed for ${cid}: ${response.status}`);
  }

  const result = (await response.json()) as {
    Pins?: string[];
    Pinned?: string;
  };

  return {
    pinned: true,
    provider: "kubo",
    reference: result.Pinned ?? result.Pins?.[0] ?? cid,
  };
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

function buildGatewayFallbackUrls(
  cid: string,
  relativePath: string | null | undefined,
  primaryGatewayUrl: string | null | undefined,
): string[] {
  const pathSuffix = relativePath
    ? `/${relativePath.replace(/^\/+/, "")}`
    : "";
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

  push(`https://ipfs.foundation.app/ipfs/${cid}${pathSuffix}`);
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
}) {
  const gatewayUrls = buildGatewayFallbackUrls(
    input.cid,
    input.relativePath,
    input.gatewayUrl,
  );

  if (env.ARCHIVE_ARCHIVER_URL && shouldAttemptRustArchiver()) {
    try {
      const response = await requestRustArchiver<RustArchiverDownloadResponse>(
        "/archive/root",
        {
          cid: input.cid,
          relative_path: input.relativePath,
          gateway_url: input.gatewayUrl,
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

const KUBO_LS_TIMEOUT_MS = 20_000;
const KUBO_DIRECTORY_TYPES = new Set([1, 5]);
const KUBO_LS_MAX_DEPTH = 8;

type DirectoryEntry = {
  path: string;
  cid: string;
  size: number;
};

async function kuboLsLinks(arg: string): Promise<KuboLink[]> {
  if (!env.KUBO_API_URL) return [];

  const endpoint = new URL("/api/v0/ls", env.KUBO_API_URL);
  endpoint.searchParams.set("arg", arg);

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

async function expandKuboLink(args: {
  rootCid: string;
  basePath: string;
  link: KuboLink;
  depth: number;
}): Promise<DirectoryEntry[]> {
  const name = args.link.Name?.trim();
  if (!name) return [];

  const childPath = args.basePath ? `${args.basePath}/${name}` : name;
  const isDirectory =
    args.link.Type !== undefined && KUBO_DIRECTORY_TYPES.has(args.link.Type);

  if (isDirectory) {
    return kuboLsRecursive(args.rootCid, childPath, args.depth + 1);
  }

  return [
    {
      path: childPath,
      cid: args.link.Hash ?? "",
      size: args.link.Size ?? 0,
    },
  ];
}

async function kuboLsRecursive(
  rootCid: string,
  basePath = "",
  depth = 0,
): Promise<DirectoryEntry[]> {
  if (depth > KUBO_LS_MAX_DEPTH) return [];

  const arg = basePath ? `${rootCid}/${basePath}` : rootCid;
  const links = await kuboLsLinks(arg);
  const out: DirectoryEntry[] = [];

  for (const link of links) {
    const expanded = await expandKuboLink({ rootCid, basePath, link, depth });
    out.push(...expanded);
  }

  return out;
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
    entries = await kuboLsRecursive(args.cid);
  } catch (error) {
    console.warn(
      `[archive] Skipping sibling hydration for ${args.cid}: Kubo ls failed —`,
      formatErrorMessage(error),
    );
    return empty;
  }

  if (entries.length === 0) {
    return empty;
  }

  const cleanedSkip = args.skipPath
    ? cleanRelativePath(args.skipPath)
    : null;

  let attempted = 0;
  let downloaded = 0;
  let skipped = 0;
  let totalBytes = 0;
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

    if (entry.size > 0 && totalBytes + entry.size > sizeBudget) {
      truncatedByBudget = true;
      console.warn(
        `[archive] Sibling hydration for ${args.cid} stopped at ${formatBytes(totalBytes)} (budget ${formatBytes(sizeBudget)}); ${entries.length - attempted} entries remaining.`,
      );
      break;
    }

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

export async function pinCidWithKubo(cid: string) {
  if (
    env.ARCHIVE_ARCHIVER_URL &&
    env.KUBO_API_URL &&
    shouldAttemptRustArchiver()
  ) {
    try {
      const response = await requestRustArchiver<RustArchiverPinResponse>(
        "/pin/cid",
        {
          cid,
          kubo_api_url: env.KUBO_API_URL,
          kubo_api_auth_header: env.KUBO_API_AUTH_HEADER ?? null,
        },
      );

      if (response) {
        clearRustArchiverCooldown();
        return response;
      }
    } catch (error) {
      warnRustArchiverFallback("pin", "Node Kubo path", error);
    }
  }

  return pinCidWithKuboFromNode(cid);
}
