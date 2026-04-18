import { copyFile, link, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "~/env";

const ROOT_FILE_SENTINEL = "__root__";

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

function toAbsoluteStorageRoot() {
  return path.isAbsolute(env.ARCHIVE_STORAGE_DIR)
    ? env.ARCHIVE_STORAGE_DIR
    : path.resolve(process.cwd(), env.ARCHIVE_STORAGE_DIR);
}

function toAbsoluteHotStorageRoot() {
  return path.isAbsolute(env.ARCHIVE_HOT_STORAGE_DIR)
    ? env.ARCHIVE_HOT_STORAGE_DIR
    : path.resolve(process.cwd(), env.ARCHIVE_HOT_STORAGE_DIR);
}

function cleanRelativePath(relativePath: string | null | undefined) {
  const safePath = (relativePath ?? "").replace(/^\/+/, "");

  if (safePath.includes("..")) {
    throw new Error("Refusing to work with a relative path that escapes the archive root.");
  }

  return safePath || ROOT_FILE_SENTINEL;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/g, "");
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

async function promoteHotFileToCold(hotPath: string, coldPath: string) {
  if (await pathExists(coldPath)) {
    return;
  }

  await ensureParentDirectory(coldPath);

  try {
    await link(hotPath, coldPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      return;
    }

    await copyFile(hotPath, coldPath);
  }
}

async function requestRustArchiver<T>(
  endpoint: string,
  payload: Record<string, unknown>,
) {
  if (!env.ARCHIVE_ARCHIVER_URL) {
    return null;
  }

  const response = await fetch(
    `${trimTrailingSlash(env.ARCHIVE_ARCHIVER_URL)}${endpoint}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(detail?.error ?? `Rust archiver request failed with ${response.status}.`);
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
    throw new Error(`Unable to download CID ${input.cid} because no source URL was available.`);
  }

  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent": "foundation-archive/0.1 (+https://foundation.app)",
    },
    signal: AbortSignal.timeout(60_000),
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
  });

  if (!response.ok) {
    throw new Error(`Kubo pin failed for ${cid}: ${response.status}`);
  }

  const result = (await response.json()) as { Pins?: string[]; Pinned?: string };

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

export function getArchivedFilePath(cid: string, relativePath: string | null | undefined) {
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

export async function downloadFileToArchive(input: {
  cid: string;
  relativePath: string | null | undefined;
  gatewayUrl: string | null | undefined;
  originalUrl: string | null | undefined;
}) {
  if (env.ARCHIVE_ARCHIVER_URL) {
    try {
      const response = await requestRustArchiver<RustArchiverDownloadResponse>(
        "/archive/root",
        {
          cid: input.cid,
          relative_path: input.relativePath,
          gateway_url: input.gatewayUrl,
          original_url: input.originalUrl,
          final_root_dir: getArchiveStorageRoot(),
          hot_root_dir: getArchiveHotStorageRoot(),
        },
      );

      if (response) {
        return {
          absolutePath: response.absolute_path,
          localDirectory: response.local_directory,
          byteSize: response.byte_size,
          mimeType: response.mime_type,
        };
      }
    } catch (error) {
      console.warn(
        "[archive] Rust archiver download failed, falling back to Node storage path:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return downloadFileToArchiveWithJs(input);
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

export async function archivedAssetExists(cid: string, relativePath: string | null | undefined) {
  try {
    await stat(getArchivedFilePath(cid, relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function ensureArchiveRoot() {
  await mkdir(path.join(getArchiveStorageRoot(), "ipfs"), { recursive: true });
  await mkdir(path.join(getArchiveHotStorageRoot(), "ipfs"), { recursive: true });
}

export async function pinCidWithKubo(cid: string) {
  if (env.ARCHIVE_ARCHIVER_URL && env.KUBO_API_URL) {
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
        return response;
      }
    } catch (error) {
      console.warn(
        "[archive] Rust archiver pin failed, falling back to Node Kubo path:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return pinCidWithKuboFromNode(cid);
}
