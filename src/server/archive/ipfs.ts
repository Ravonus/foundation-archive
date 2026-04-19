import path from "node:path";

import { RootKind, SourceProtocol } from "~/server/prisma-client";
import { CID } from "multiformats";

import { env } from "~/env";

export interface ParsedIpfsReference {
  cid: string;
  originalCid: string;
  cidVersion: number;
  relativePath: string;
  fileName: string | null;
  originalUrl: string;
  gatewayUrl: string;
  kind: RootKind;
  protocol: SourceProtocol;
}

const PATHWAY_SEGMENT = "/ipfs/";

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/g, "");
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseIpfsPath(input: string) {
  const cleaned = trimSlashes(safeDecodeURIComponent(input));
  const normalized = cleaned.replace(/^ipfs\//i, "");
  const [cid, ...rest] = normalized.split("/");

  if (!cid) return null;

  return {
    cid,
    relativePath: rest.join("/"),
  };
}

function parseCidFromPathSegments(pathname: string) {
  const segments = pathname
    .split("/")
    .map((segment) => safeDecodeURIComponent(segment))
    .filter(Boolean);

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) continue;

    try {
      CID.parse(segment);
      return {
        cid: segment,
        relativePath: segments.slice(index + 1).join("/"),
      };
    } catch {
      continue;
    }
  }

  return null;
}

export function parseIpfsReference(
  originalUrl: string,
  kind: RootKind,
): ParsedIpfsReference | null {
  let cidPath: { cid: string; relativePath: string } | null = null;

  if (originalUrl.startsWith("ipfs://")) {
    cidPath = parseIpfsPath(originalUrl.replace("ipfs://", ""));
  } else {
    try {
      const url = new URL(originalUrl);
      const subdomainMatch = /^([^.]+)\.ipfs\./i.exec(url.hostname);

      if (subdomainMatch) {
        cidPath = {
          cid: subdomainMatch[1] ?? "",
          relativePath: trimSlashes(url.pathname),
        };
      } else {
        const index = url.pathname.indexOf(PATHWAY_SEGMENT);
        if (index !== -1) {
          cidPath = parseIpfsPath(
            url.pathname.slice(index + PATHWAY_SEGMENT.length),
          );
        } else {
          cidPath = parseCidFromPathSegments(url.pathname);
        }
      }
    } catch {
      return null;
    }
  }

  if (!cidPath) return null;

  let parsedCid: CID;
  try {
    parsedCid = CID.parse(cidPath.cid);
  } catch {
    return null;
  }

  const relativePath = trimSlashes(safeDecodeURIComponent(cidPath.relativePath));
  const fileName = relativePath ? path.basename(relativePath) : null;

  return {
    cid: parsedCid.toString(),
    originalCid: cidPath.cid,
    cidVersion: parsedCid.version,
    relativePath,
    fileName,
    originalUrl,
    gatewayUrl: buildGatewayUrl(parsedCid.toString(), relativePath),
    kind,
    protocol: SourceProtocol.IPFS,
  };
}

export function hasIpfsReference(url: string | null | undefined) {
  if (!url) return false;
  return Boolean(parseIpfsReference(url, RootKind.UNKNOWN));
}

export function firstIpfsReference(
  kind: RootKind,
  urls: Array<string | null | undefined>,
) {
  for (const url of urls) {
    if (!url) continue;
    const parsed = parseIpfsReference(url, kind);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function detectSourceProtocol(url: string) {
  if (url.startsWith("ipfs://") || url.includes("/ipfs/") || url.includes(".ipfs.")) {
    return SourceProtocol.IPFS;
  }

  if (url.includes("arweave.net")) {
    return SourceProtocol.ARWEAVE;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return SourceProtocol.HTTPS;
  }

  return SourceProtocol.UNKNOWN;
}

export function buildGatewayUrl(cid: string, relativePath = "") {
  const gatewayBase = stripTrailingSlash(env.IPFS_GATEWAY_BASE_URL);
  const suffix = relativePath ? `/${trimSlashes(relativePath)}` : "";
  return `${gatewayBase}/ipfs/${cid}${suffix}`;
}

export function buildArchivePublicPath(cid: string, relativePath: string | null | undefined) {
  const cleaned = trimSlashes(relativePath ?? "");
  return cleaned ? `/ipfs/${cid}/${cleaned}` : `/ipfs/${cid}`;
}
