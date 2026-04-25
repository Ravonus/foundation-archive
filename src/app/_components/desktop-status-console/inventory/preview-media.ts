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
    candidates.push({ url: input.posterUrl, kind: "IMAGE" });
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
    candidates.push({ url: input.posterUrl, kind: "IMAGE" });
  }

  return orderPreviewCandidates(
    dedupePreviewCandidates(candidates),
    input.mediaKind,
  );
}
