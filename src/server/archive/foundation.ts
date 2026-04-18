import { z } from "zod";
import { MediaKind } from "~/server/prisma-client";

import { env } from "~/env";
import { chainSlug } from "~/server/archive/chains";

const foundationTokenSchema = z.object({
  chainId: z.number().int().nullable().optional(),
  contractAddress: z.string(),
  tokenId: z.union([z.string(), z.number(), z.bigint()]),
  name: z.string(),
  description: z.string().nullable().optional(),
  metadataUrl: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  collection: z
    .object({
      name: z.string().nullable().optional(),
      slug: z.string().nullable().optional(),
      contractType: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  creator: z
    .object({
      name: z.string().nullable().optional(),
      username: z.string().nullable().optional(),
      publicKey: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  owner: z
    .object({
      name: z.string().nullable().optional(),
      username: z.string().nullable().optional(),
      publicKey: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  media: z
    .object({
      __typename: z.string().nullable().optional(),
      url: z.string().nullable().optional(),
      previewUrl: z.string().nullable().optional(),
      staticUrl: z.string().nullable().optional(),
      videoMimeType: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

type FoundationToken = z.infer<typeof foundationTokenSchema>;

const foundationProfileSchema = z.object({
  bio: z.string().nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  profileImageUrl: z.string().nullable().optional(),
  publicKey: z.string(),
  username: z.string().nullable().optional(),
});

const MEDIA_KIND_TOKENS: ReadonlyArray<{
  kind: MediaKind;
  tokens: ReadonlyArray<string>;
}> = [
  { kind: MediaKind.VIDEO, tokens: ["video", ".mp4", ".mov"] },
  { kind: MediaKind.AUDIO, tokens: ["audio", ".mp3", ".wav"] },
  {
    kind: MediaKind.IMAGE,
    tokens: ["svg", "image", ".png", ".jpg", ".jpeg", ".gif", ".webp"],
  },
  { kind: MediaKind.HTML, tokens: ["html"] },
  { kind: MediaKind.MODEL, tokens: ["model"] },
];

export function inferFoundationMediaKind(input: {
  mediaType?: string | null;
  sourceUrl?: string | null;
  mediaUrl?: string | null;
}) {
  const text =
    `${input.mediaType ?? ""} ${input.sourceUrl ?? ""} ${input.mediaUrl ?? ""}`.toLowerCase();

  for (const { kind, tokens } of MEDIA_KIND_TOKENS) {
    if (tokens.some((token) => text.includes(token))) {
      return kind;
    }
  }

  return MediaKind.UNKNOWN;
}

function buildFoundationBaseUrl() {
  return env.FOUNDATION_BASE_URL.replace(/\/+$/g, "");
}

export function buildFoundationProfileUrl(username: string) {
  const normalized = username.replace(/^@+/, "");
  return `${buildFoundationBaseUrl()}/@${normalized}`;
}

export function buildFoundationMintUrl(
  contractAddress: string,
  tokenId: string | number | bigint,
  chainId = 1,
) {
  return `${buildFoundationBaseUrl()}/mint/${chainSlug(chainId)}/${contractAddress}/${tokenId.toString()}`;
}

const FOUNDATION_USER_AGENT =
  "foundation-archive/0.1 (+https://foundation.app)";
const NEXT_DATA_PATTERN =
  /<script id="__NEXT_DATA__" type="application\/json">(?<payload>.*?)<\/script>/s;

async function fetchFoundationHtml(url: string, label: string) {
  const response = await fetch(url, {
    headers: { "user-agent": FOUNDATION_USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch Foundation ${label}: ${response.status}`);
  }

  return response.text();
}

function extractNextData(html: string, label: string): unknown {
  const match = NEXT_DATA_PATTERN.exec(html);
  const payload = match?.groups?.payload;
  if (!payload) {
    throw new Error(`The Foundation ${label} did not contain __NEXT_DATA__.`);
  }
  return JSON.parse(payload);
}

type FoundationMintNextData = {
  props?: {
    pageProps?: {
      pageData?: {
        token?: unknown;
      };
    };
  };
};

type FoundationProfileNextData = {
  props?: {
    pageProps?: {
      user?: unknown;
      publicKey?: string;
    };
  };
};

function imageFallbackFor(token: FoundationToken, mediaKind: MediaKind) {
  if (mediaKind !== MediaKind.IMAGE) return null;
  // Network boundary: media fields are optional on the GraphQL response.
  return token.sourceUrl ?? token.media?.url ?? null;
}

function mapFoundationMedia(
  media: FoundationToken["media"],
  imageFallbackUrl: string | null,
) {
  // Network boundary: media shape is optional on the GraphQL response.
  return {
    mediaUrl: media?.url ?? null,
    previewUrl: media?.previewUrl ?? imageFallbackUrl,
    staticPreviewUrl: media?.staticUrl ?? imageFallbackUrl,
  };
}

function mapFoundationCollection(collection: FoundationToken["collection"]) {
  // Network boundary: collection is optional on the GraphQL response.
  return {
    collectionName: collection?.name ?? null,
    collectionSlug: collection?.slug ?? null,
    foundationContractType: collection?.contractType ?? null,
  };
}

function mapFoundationParty(party: FoundationToken["creator"]) {
  // Network boundary: creator/owner are optional on the GraphQL response.
  return {
    name: party?.name ?? null,
    username: party?.username ?? null,
    wallet: party?.publicKey ?? null,
  };
}

function mapFoundationToken(token: FoundationToken, url: string) {
  const mediaKind = inferFoundationMediaKind({
    mediaType: token.media?.__typename,
    sourceUrl: token.sourceUrl,
    mediaUrl: token.media?.url,
  });
  const imageFallbackUrl = imageFallbackFor(token, mediaKind);
  const media = mapFoundationMedia(token.media, imageFallbackUrl);
  const collection = mapFoundationCollection(token.collection);
  const artist = mapFoundationParty(token.creator);
  const owner = mapFoundationParty(token.owner);

  return {
    foundationUrl: url,
    chainId: token.chainId ?? 1,
    contractAddress: token.contractAddress,
    tokenId: token.tokenId.toString(),
    title: token.name,
    description: token.description ?? null,
    metadataUrl: token.metadataUrl ?? null,
    sourceUrl: token.sourceUrl ?? null,
    ...media,
    ...collection,
    artistName: artist.name,
    artistUsername: artist.username,
    artistWallet: artist.wallet,
    ownerName: owner.name,
    ownerUsername: owner.username,
    ownerWallet: owner.wallet,
    mediaKind,
  };
}

export async function fetchFoundationMintByUrl(url: string) {
  const html = await fetchFoundationHtml(url, "mint page");
  const json = extractNextData(html, "page") as FoundationMintNextData;
  const token = foundationTokenSchema.parse(
    json.props?.pageProps?.pageData?.token,
  );
  return mapFoundationToken(token, url);
}

export async function tryFetchFoundationMintByUrl(url: string) {
  try {
    return await fetchFoundationMintByUrl(url);
  } catch {
    return null;
  }
}

function mapFoundationProfile(json: FoundationProfileNextData, url: string) {
  const user = foundationProfileSchema.parse(json.props?.pageProps?.user);
  return {
    accountAddress: json.props?.pageProps?.publicKey ?? user.publicKey,
    bio: user.bio ?? null,
    coverImageUrl: user.coverImageUrl ?? null,
    name: user.name ?? null,
    profileImageUrl: user.profileImageUrl ?? null,
    username: user.username ?? null,
    url,
  };
}

export async function fetchFoundationProfileByUsername(username: string) {
  const url = buildFoundationProfileUrl(username);
  const html = await fetchFoundationHtml(url, "profile page");
  const json = extractNextData(
    html,
    "profile page",
  ) as FoundationProfileNextData;
  return mapFoundationProfile(json, url);
}

export async function tryFetchFoundationProfileByUsername(username: string) {
  try {
    return await fetchFoundationProfileByUsername(username);
  } catch {
    return null;
  }
}
