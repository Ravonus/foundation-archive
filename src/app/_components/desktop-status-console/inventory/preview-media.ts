"use client";

export type PreviewKind =
  | "IMAGE"
  | "VIDEO"
  | "AUDIO"
  | "HTML"
  | "MODEL"
  | "UNKNOWN";

export type PreviewCandidate = {
  url: string;
  kind: PreviewKind;
};

const PREVIEW_KIND_MARKERS: Array<{
  kind: Exclude<PreviewKind, "UNKNOWN">;
  markers: string[];
}> = [
  {
    kind: "IMAGE",
    markers: [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".svg",
      ".webp",
      ".avif",
      ".bmp",
      ".tif",
      ".tiff",
    ],
  },
  {
    kind: "VIDEO",
    markers: [".mp4", ".mov", ".webm", ".m4v", ".ogv", ".m3u8"],
  },
  {
    kind: "AUDIO",
    markers: [".mp3", ".wav", ".ogg", ".oga", ".aac", ".m4a", ".flac"],
  },
  {
    kind: "HTML",
    markers: [".html", ".htm"],
  },
  {
    kind: "MODEL",
    markers: [
      ".glb",
      ".gltf",
      ".usdz",
      ".usd",
      ".usda",
      ".usdc",
      ".stl",
      ".obj",
      ".fbx",
      ".dae",
      ".ply",
      "model/gltf",
      "model/vnd.usdz",
      "model/obj",
      "model/stl",
      "model",
    ],
  },
];

function stripQueryAndHash(url: string) {
  return url.split(/[?#]/, 1)[0] ?? url;
}

function normalizeHostname(hostname: string) {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
}

const PRIVATE_IPV4_RANGES = [
  [0x00000000, 0x00ffffff],
  [0x0a000000, 0x0affffff],
  [0x7f000000, 0x7fffffff],
  [0xa9fe0000, 0xa9feffff],
  [0xac100000, 0xac1fffff],
  [0xc0a80000, 0xc0a8ffff],
] as const;

function parseIpv4Host(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;

    const octet = Number(part);
    if (octet > 255) return null;

    value = value * 256 + octet;
  }

  return value;
}

function isPrivateIpv4Host(hostname: string) {
  const host = parseIpv4Host(hostname);
  return (
    host !== null &&
    PRIVATE_IPV4_RANGES.some(([start, end]) => host >= start && host <= end)
  );
}

function isLocalNetworkHost(hostname: string) {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized === "::1" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    isPrivateIpv4Host(normalized)
  );
}

export function canAutoLoadPreviewUrl(url: string) {
  if (typeof window === "undefined") return true;

  let currentUrl: URL;
  let previewUrl: URL;
  try {
    currentUrl = new URL(window.location.href);
    previewUrl = new URL(url, currentUrl.href);
  } catch {
    return true;
  }

  const currentHostIsLocal = isLocalNetworkHost(currentUrl.hostname);
  const previewHostIsLocal = isLocalNetworkHost(previewUrl.hostname);

  if (previewHostIsLocal && !currentHostIsLocal) {
    return false;
  }

  if (
    currentUrl.protocol === "https:" &&
    previewUrl.protocol === "http:" &&
    !currentHostIsLocal
  ) {
    return false;
  }

  return true;
}

export function normalizePreviewKind(
  value: string | null | undefined,
): PreviewKind {
  const normalized = value?.trim().toUpperCase();
  if (
    normalized === "IMAGE" ||
    normalized === "VIDEO" ||
    normalized === "AUDIO" ||
    normalized === "HTML" ||
    normalized === "MODEL"
  ) {
    return normalized;
  }
  return "UNKNOWN";
}

export function previewKindFromUrl(url: string): PreviewKind {
  const lower = stripQueryAndHash(url).toLowerCase();
  return (
    PREVIEW_KIND_MARKERS.find(({ markers }) =>
      markers.some((marker) => lower.includes(marker)),
    )?.kind ?? "UNKNOWN"
  );
}

export function previewKindForPreviewUrl(
  url: string,
  fallbackKind: PreviewKind,
  openUrl: string | null,
): PreviewKind {
  if (openUrl && url !== openUrl) return "IMAGE";

  const fromUrl = previewKindFromUrl(url);
  if (fromUrl !== "UNKNOWN") return fromUrl;
  return fallbackKind;
}

export function gatewayPreviewCandidate(
  url: string | null,
  fallbackKind: PreviewKind,
) {
  if (!url) return null;
  if (!canAutoLoadPreviewUrl(url)) return null;

  const fromUrl = previewKindFromUrl(url);
  return {
    url,
    kind: fromUrl !== "UNKNOWN" ? fromUrl : fallbackKind,
  } satisfies PreviewCandidate;
}

export function previewImageCandidate(
  url: string | null,
  fallbackKind: PreviewKind,
  openUrl: string | null,
) {
  if (!url) return null;
  if (!canAutoLoadPreviewUrl(url)) return null;

  return {
    url,
    kind: previewKindForPreviewUrl(url, fallbackKind, openUrl),
  } satisfies PreviewCandidate;
}

export function dedupePreviewCandidates(
  candidates: Array<PreviewCandidate | null>,
) {
  const seen = new Set<string>();

  return candidates.filter((candidate): candidate is PreviewCandidate => {
    if (!candidate) return false;
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

function previewPriority(kind: PreviewKind, preferredKind: PreviewKind) {
  if (preferredKind === "UNKNOWN" || preferredKind === "IMAGE") {
    return 0;
  }
  if (kind === preferredKind) return 0;
  if (kind !== "IMAGE" && kind !== "UNKNOWN") return 1;
  if (kind === "IMAGE") return 2;
  return 3;
}

export function orderPreviewCandidates(
  candidates: PreviewCandidate[],
  preferredKind: PreviewKind,
) {
  if (preferredKind === "UNKNOWN" || preferredKind === "IMAGE") {
    return candidates;
  }

  return [...candidates].sort(
    (left, right) =>
      previewPriority(left.kind, preferredKind) -
      previewPriority(right.kind, preferredKind),
  );
}

function posterPreviewCandidate(url: string | null) {
  if (!url) return null;
  if (!canAutoLoadPreviewUrl(url)) return null;

  return { url, kind: "IMAGE" } satisfies PreviewCandidate;
}

export function buildInventoryPreviewCandidates(input: {
  mediaKind: PreviewKind;
  posterUrl: string | null;
  previewLocalGatewayUrl: string | null;
  previewPublicGatewayUrl: string | null;
  localGatewayUrl: string | null;
  publicGatewayUrl: string | null;
  utilityGatewayUrl: string | null;
}) {
  const candidates: Array<PreviewCandidate | null> = [];
  const richMediaFirst =
    input.mediaKind !== "IMAGE" && input.mediaKind !== "UNKNOWN";

  if (!richMediaFirst && input.posterUrl) {
    candidates.push(posterPreviewCandidate(input.posterUrl));
  }

  candidates.push(
    previewImageCandidate(
      input.previewLocalGatewayUrl,
      input.mediaKind,
      input.localGatewayUrl,
    ),
    previewImageCandidate(
      input.previewPublicGatewayUrl,
      input.mediaKind,
      input.publicGatewayUrl,
    ),
    gatewayPreviewCandidate(input.localGatewayUrl, input.mediaKind),
    gatewayPreviewCandidate(input.publicGatewayUrl, input.mediaKind),
    gatewayPreviewCandidate(input.utilityGatewayUrl, input.mediaKind),
  );

  if (richMediaFirst && input.posterUrl) {
    candidates.push(posterPreviewCandidate(input.posterUrl));
  }

  return orderPreviewCandidates(
    dedupePreviewCandidates(candidates),
    input.mediaKind,
  );
}
