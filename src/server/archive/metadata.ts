import { MediaKind, RootKind } from "~/server/prisma-client";
import { z } from "zod";

import { buildGatewayUrl, parseIpfsReference } from "~/server/archive/ipfs";

const metadataSchema = z
  .object({
    name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
    image_url: z.string().nullable().optional(),
    animation: z.string().nullable().optional(),
    animation_url: z.string().nullable().optional(),
  })
  .passthrough();

type MetadataRecord = z.infer<typeof metadataSchema>;

const MEDIA_KIND_MARKERS: ReadonlyArray<{
  kind: MediaKind;
  markers: readonly string[];
}> = [
  { kind: MediaKind.VIDEO, markers: [".mp4", ".mov", ".webm", "video"] },
  { kind: MediaKind.AUDIO, markers: [".mp3", ".wav", "audio"] },
  {
    kind: MediaKind.IMAGE,
    markers: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", "image"],
  },
  { kind: MediaKind.HTML, markers: [".html"] },
];

function matchesAnyMarker(value: string, markers: readonly string[]): boolean {
  return markers.some((marker) => value.includes(marker));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function nestedValue(value: unknown, path: readonly string[]): unknown {
  let current: unknown = value;

  for (const segment of path) {
    const record = asRecord(current);
    if (!record) {
      return null;
    }

    current = record[segment];
  }

  return current ?? null;
}

function firstString(values: readonly unknown[]) {
  for (const value of values) {
    const candidate = nonEmptyString(value);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function collectUrlCandidates(value: unknown) {
  const entries = Array.isArray(value) ? value : [value];
  const candidates: string[] = [];

  for (const entry of entries) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }

    for (const key of [
      "uri",
      "url",
      "src",
      "href",
      "animation_url",
      "animation",
      "image",
      "image_url",
    ]) {
      const candidate = nonEmptyString(record[key]);
      if (!candidate || candidates.includes(candidate)) {
        continue;
      }

      candidates.push(candidate);
    }
  }

  return candidates;
}

function mediaKindFromUrl(url: string | null | undefined) {
  const value = (url ?? "").toLowerCase();
  if (!value) return MediaKind.UNKNOWN;

  const match = MEDIA_KIND_MARKERS.find((entry) =>
    matchesAnyMarker(value, entry.markers),
  );
  return match ? match.kind : MediaKind.UNKNOWN;
}

export function normalizeAssetUrl(url: string) {
  const ipfs = parseIpfsReference(url, RootKind.UNKNOWN);
  if (ipfs) {
    return ipfs.originalUrl.startsWith("ipfs://")
      ? buildGatewayUrl(ipfs.cid, ipfs.relativePath)
      : ipfs.gatewayUrl;
  }

  return url;
}

function metadataImageUrl(metadata: MetadataRecord) {
  return firstString([
    metadata.image,
    metadata.image_url,
    nestedValue(metadata, ["properties", "image"]),
    nestedValue(metadata, ["properties", "image_url"]),
    nestedValue(metadata, ["displayUri"]),
    nestedValue(metadata, ["display_uri"]),
    nestedValue(metadata, ["thumbnailUri"]),
    nestedValue(metadata, ["thumbnail_uri"]),
  ]);
}

function metadataFileUrl(metadata: MetadataRecord) {
  return firstString([
    ...collectUrlCandidates(nestedValue(metadata, ["media", "files"])),
    ...collectUrlCandidates(nestedValue(metadata, ["properties", "files"])),
    ...collectUrlCandidates(nestedValue(metadata, ["files"])),
    ...collectUrlCandidates(nestedValue(metadata, ["formats"])),
  ]);
}

function metadataPrimaryMediaUrl(metadata: MetadataRecord) {
  return firstString([
    metadata.animation_url,
    metadata.animation,
    nestedValue(metadata, ["media", "uri"]),
    nestedValue(metadata, ["media", "url"]),
    nestedValue(metadata, ["properties", "animation_url"]),
    nestedValue(metadata, ["properties", "animation"]),
    nestedValue(metadata, ["artifactUri"]),
    nestedValue(metadata, ["artifact_uri"]),
    nestedValue(metadata, ["content", "uri"]),
    nestedValue(metadata, ["content", "url"]),
  ]);
}

export async function fetchTokenMetadata(tokenUri: string) {
  const normalizedMetadataUrl = normalizeAssetUrl(tokenUri);
  const response = await fetch(normalizedMetadataUrl, {
    headers: {
      "user-agent": "foundation-archive/0.1 (+metadata fetch)",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch token metadata: ${response.status}`);
  }

  const json = metadataSchema.parse((await response.json()) as unknown);
  const imageUrl = metadataImageUrl(json);
  const fileUrl = metadataFileUrl(json);
  const mediaUrl = metadataPrimaryMediaUrl(json) ?? fileUrl ?? imageUrl;
  const mediaKind = mediaKindFromUrl(mediaUrl);
  const previewUrl =
    imageUrl ?? (mediaKind === MediaKind.IMAGE ? mediaUrl : null);

  return {
    metadataUrl: tokenUri,
    resolvedMetadataUrl: normalizedMetadataUrl,
    title: json.name ?? null,
    description: json.description ?? null,
    mediaUrl,
    previewUrl,
    mediaKind,
  };
}
