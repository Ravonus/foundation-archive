import path from "node:path";

import { env } from "~/env";
import { readArchivedAsset } from "~/server/archive/storage";
import { db } from "~/server/db";

type ArchiveRouteProps = {
  params: Promise<{
    cid: string;
    assetPath?: string[];
  }>;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  ".aac": "audio/aac",
  ".avi": "video/x-msvideo",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".m4a": "audio/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".oga": "audio/ogg",
  ".ogg": "audio/ogg",
  ".ogv": "video/ogg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".usdz": "model/vnd.usdz+zip",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

function chooseContentType(
  extension: string,
  storedMimeType: string | null | undefined,
) {
  const normalizedStored =
    storedMimeType && storedMimeType !== "application/octet-stream"
      ? storedMimeType
      : null;

  return (
    MIME_BY_EXTENSION[extension] ??
    normalizedStored ??
    storedMimeType ??
    "application/octet-stream"
  );
}

function contentDispositionValue(fileName: string) {
  const fallback = fileName.replace(/["\r\n]/g, "_");
  const encoded = encodeURIComponent(fileName);
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/g, "");
}

/// Cold-storage has been migrating into kubo's blockstore (same NAS
/// share, smaller footprint once deduped). As we pin + delete on that
/// migration, this route silently falls through to kubo's own gateway so
/// users never see a 404 for an asset that used to live on disk. The
/// migration keeps the DB row's pinStatus/backupStatus unchanged so no
/// UI badge flicker occurs while a CID is in flight.
async function proxyFromKuboGateway(
  cid: string,
  segments: readonly string[],
  fileName: string | null,
  mimeType: string | null | undefined,
) {
  if (!env.KUBO_GATEWAY_URL) return null;

  const base = trimTrailingSlash(env.KUBO_GATEWAY_URL);
  const suffix = segments.length > 0 ? `/${segments.join("/")}` : "";
  const target = `${base}/ipfs/${encodeURIComponent(cid)}${suffix}`;

  let response: Response;
  try {
    response = await fetch(target, {
      headers: env.KUBO_API_AUTH_HEADER
        ? { Authorization: env.KUBO_API_AUTH_HEADER }
        : undefined,
      // Generous timeout — a first-touch fetch can hit a cold DHT
      // resolve.
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return null;
  }

  if (!response.ok || !response.body) return null;

  const pathForExt =
    segments.length > 0 ? segments[segments.length - 1] ?? cid : cid;
  const extension = path.extname(pathForExt).toLowerCase();
  const upstreamContentType = response.headers.get("content-type");
  const resolvedFileName = fileName ?? path.basename(pathForExt);

  const headers: Record<string, string> = {
    "content-type": chooseContentType(extension, upstreamContentType ?? mimeType),
    "content-disposition": contentDispositionValue(resolvedFileName),
    "cache-control": "public, max-age=31536000, immutable",
  };

  const upstreamLength = response.headers.get("content-length");
  if (upstreamLength) headers["content-length"] = upstreamLength;

  return new Response(response.body, { headers });
}

export async function GET(_request: Request, props: ArchiveRouteProps) {
  const { cid, assetPath } = await props.params;
  const requestedSegments = assetPath ?? [];

  const root = await db.ipfsRoot
    .findUnique({
      where: { cid },
      select: {
        fileName: true,
        mimeType: true,
        relativePath: true,
      },
    })
    .catch(() => null);

  const resolvedAssetPath =
    requestedSegments.length > 0
      ? requestedSegments
      : (root?.relativePath?.split("/").filter(Boolean) ?? []);

  try {
    const asset = await readArchivedAsset(cid, resolvedAssetPath);
    const extension = path.extname(asset.absolutePath).toLowerCase();
    const fileName =
      requestedSegments.length > 0
        ? path.basename(asset.absolutePath)
        : (root?.fileName ?? path.basename(asset.absolutePath));

    return new Response(asset.contents, {
      headers: {
        "content-type": chooseContentType(extension, root?.mimeType),
        "content-disposition": contentDispositionValue(fileName),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    const fallbackFileName =
      requestedSegments.length > 0
        ? path.basename(
            requestedSegments[requestedSegments.length - 1] ?? cid,
          )
        : (root?.fileName ?? null);

    const gatewayResponse = await proxyFromKuboGateway(
      cid,
      resolvedAssetPath,
      fallbackFileName,
      root?.mimeType,
    );

    if (gatewayResponse) return gatewayResponse;

    return new Response("Archived asset not found.", { status: 404 });
  }
}
