import path from "node:path";

import { env } from "~/env";
import { readArchivedAsset } from "~/server/archive/storage";
import { db } from "~/server/db";
import {
  buildRelayGatewayUrl,
  findRelayGatewayCandidates,
  recordRelayGatewayFailure,
  recordRelayGatewaySuccess,
} from "~/server/relay/pin-routing";

type ArchiveRouteProps = {
  params: Promise<{
    cid: string;
    assetPath?: string[];
  }>;
};

type RootMetadata = {
  fileName: string | null;
  mimeType: string | null;
  relativePath: string | null;
};

type GatewayRequest = {
  cid: string;
  segments: readonly string[];
  fileName: string | null;
  mimeType: string | null | undefined;
  rangeHeader: string | null;
};

type GatewayProxyInput = {
  request: GatewayRequest;
  baseUrl: string | null | undefined;
  authHeader?: string | null;
  timeoutMs: number;
};

type ByteRange = {
  start: number;
  end: number;
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

// eslint-disable-next-line complexity
function parseByteRange(header: string | null, size: number): ByteRange | null {
  if (!header) return null;

  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(size - suffixLength, 0),
      end: size - 1,
    };
  }

  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : size - 1;

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(end, size - 1),
  };
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/g, "");
}

function buildIpfsGatewayPath(cid: string, segments: readonly string[]) {
  const suffix = segments
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/ipfs/${encodeURIComponent(cid)}${suffix ? `/${suffix}` : ""}`;
}

function responseFromGateway(response: Response, request: GatewayRequest) {
  const pathForExt =
    request.segments.length > 0
      ? (request.segments[request.segments.length - 1] ?? request.cid)
      : request.cid;
  const extension = path.extname(pathForExt).toLowerCase();
  const upstreamContentType = response.headers.get("content-type");
  const resolvedFileName = request.fileName ?? path.basename(pathForExt);

  const headers: Record<string, string> = {
    "content-type": chooseContentType(
      extension,
      upstreamContentType ?? request.mimeType,
    ),
    "content-disposition": contentDispositionValue(resolvedFileName),
    "cache-control": "public, max-age=31536000, immutable",
  };

  for (const headerName of [
    "content-length",
    "content-range",
    "accept-ranges",
  ]) {
    const headerValue = response.headers.get(headerName);
    if (headerValue) headers[headerName] = headerValue;
  }

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

async function proxyFromRelayDeviceGateways(request: GatewayRequest) {
  const candidates = await findRelayGatewayCandidates(db, request.cid).catch(
    () => [],
  );

  for (const candidate of candidates) {
    const target = buildRelayGatewayUrl(
      candidate,
      request.cid,
      request.segments,
    );
    if (!target) continue;

    let response: Response;
    try {
      response = await fetch(target, {
        headers: request.rangeHeader
          ? { Range: request.rangeHeader }
          : undefined,
        signal: AbortSignal.timeout(6_000),
      });
    } catch {
      await recordRelayGatewayFailure(db, candidate.pinId).catch(() => null);
      continue;
    }

    if (!response.ok || !response.body) {
      await recordRelayGatewayFailure(db, candidate.pinId).catch(() => null);
      continue;
    }

    await recordRelayGatewaySuccess(db, candidate.pinId).catch(() => null);
    return responseFromGateway(response, request);
  }

  return null;
}

/// Cold-storage has been migrating into kubo's blockstore (same NAS
/// share, smaller footprint once deduped). As we pin + delete on that
/// migration, this route silently falls through to kubo's own gateway so
/// users never see a 404 for an asset that used to live on disk. The
/// migration keeps the DB row's pinStatus/backupStatus unchanged so no
/// UI badge flicker occurs while a CID is in flight.
async function proxyFromHttpGateway(input: GatewayProxyInput) {
  if (!input.baseUrl) return null;

  const base = trimTrailingSlash(input.baseUrl);
  const target = `${base}${buildIpfsGatewayPath(
    input.request.cid,
    input.request.segments,
  )}`;

  let response: Response;
  try {
    const headers = new Headers();
    if (input.authHeader) headers.set("authorization", input.authHeader);
    if (input.request.rangeHeader) {
      headers.set("range", input.request.rangeHeader);
    }

    response = await fetch(target, {
      headers,
      signal: AbortSignal.timeout(input.timeoutMs),
    });
  } catch {
    return null;
  }

  if (!response.ok || !response.body) return null;

  return responseFromGateway(response, input.request);
}

async function proxyFromKuboGateway(request: GatewayRequest) {
  return proxyFromHttpGateway({
    request,
    baseUrl: env.KUBO_GATEWAY_URL,
    authHeader: env.KUBO_API_AUTH_HEADER,
    // Generous timeout — a first-touch fetch can hit a cold DHT resolve.
    timeoutMs: 60_000,
  });
}

async function proxyFromPublicIpfsGateway(request: GatewayRequest) {
  return proxyFromHttpGateway({
    request,
    baseUrl: env.IPFS_GATEWAY_BASE_URL,
    timeoutMs: 60_000,
  });
}

async function loadRootMetadata(cid: string) {
  return db.ipfsRoot
    .findUnique({
      where: { cid },
      select: {
        fileName: true,
        mimeType: true,
        relativePath: true,
      },
    })
    .catch(() => null) satisfies Promise<RootMetadata | null>;
}

function resolveAssetPath(
  requestedSegments: readonly string[],
  root: RootMetadata | null,
) {
  return requestedSegments.length > 0
    ? requestedSegments
    : (root?.relativePath?.split("/").filter(Boolean) ?? []);
}

function fallbackFileName(
  requestedSegments: readonly string[],
  cid: string,
  root: RootMetadata | null,
) {
  return requestedSegments.length > 0
    ? path.basename(requestedSegments[requestedSegments.length - 1] ?? cid)
    : (root?.fileName ?? null);
}

async function readLocalArchiveResponse(input: {
  cid: string;
  requestedSegments: readonly string[];
  resolvedAssetPath: readonly string[];
  root: RootMetadata | null;
  rangeHeader: string | null;
}) {
  const asset = await readArchivedAsset(input.cid, [
    ...input.resolvedAssetPath,
  ]);
  const extension = path.extname(asset.absolutePath).toLowerCase();
  const fileName =
    input.requestedSegments.length > 0
      ? path.basename(asset.absolutePath)
      : (input.root?.fileName ?? path.basename(asset.absolutePath));
  const range = parseByteRange(input.rangeHeader, asset.contents.byteLength);

  const headers: Record<string, string> = {
    "content-type": chooseContentType(extension, input.root?.mimeType),
    "content-disposition": contentDispositionValue(fileName),
    "cache-control": "public, max-age=31536000, immutable",
    "accept-ranges": "bytes",
  };

  if (!range) {
    headers["content-length"] = String(asset.contents.byteLength);
    return new Response(asset.contents, { headers });
  }

  const chunk = asset.contents.subarray(range.start, range.end + 1);
  return new Response(chunk, {
    status: 206,
    headers: {
      ...headers,
      "content-length": String(chunk.byteLength),
      "content-range": `bytes ${range.start}-${range.end}/${asset.contents.byteLength}`,
    },
  });
}

export async function GET(_request: Request, props: ArchiveRouteProps) {
  const { cid, assetPath } = await props.params;
  const requestedSegments = assetPath ?? [];
  const root = await loadRootMetadata(cid);
  const resolvedAssetPath = resolveAssetPath(requestedSegments, root);

  const localResponse = await readLocalArchiveResponse({
    cid,
    requestedSegments,
    resolvedAssetPath,
    root,
    rangeHeader: _request.headers.get("range"),
  }).catch(() => null);

  if (localResponse) return localResponse;

  const gatewayRequest = {
    cid,
    segments: resolvedAssetPath,
    fileName: fallbackFileName(requestedSegments, cid, root),
    mimeType: root?.mimeType,
    rangeHeader: _request.headers.get("range"),
  };

  const relayGatewayResponse =
    await proxyFromRelayDeviceGateways(gatewayRequest);

  if (relayGatewayResponse) return relayGatewayResponse;

  const gatewayResponse = await proxyFromKuboGateway(gatewayRequest);

  if (gatewayResponse) return gatewayResponse;

  const publicGatewayResponse =
    await proxyFromPublicIpfsGateway(gatewayRequest);

  if (publicGatewayResponse) return publicGatewayResponse;

  return new Response("Archived asset not found.", { status: 404 });
}
