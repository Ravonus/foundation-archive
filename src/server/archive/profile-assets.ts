import { createHash } from "node:crypto";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { getAddress } from "viem";

import { env } from "~/env";
import { buildFoundationProfileUrl } from "~/server/archive/foundation";
import {
  fetchFoundationUserByUsername,
  type FoundationUserProfile,
} from "~/server/archive/foundation-api";
import { BackupStatus, Prisma } from "~/server/prisma-client";
import { type DatabaseClient } from "./jobs/shared";

const PROFILE_ASSET_TIMEOUT_MS = 45_000;
const PROFILE_ASSET_MAX_BYTES = 25 * 1024 * 1024;

type ProfileAssetKind = "avatar" | "cover";

type CachedProfileRecord = {
  accountAddress: string;
  username: string | null;
  name: string | null;
  profileImageUrl: string | null;
  coverImageUrl: string | null;
  bio: string | null;
};

function archiveStorageRoot() {
  return path.isAbsolute(env.ARCHIVE_STORAGE_DIR)
    ? env.ARCHIVE_STORAGE_DIR
    : path.resolve(
        /* turbopackIgnore: true */ process.cwd(),
        env.ARCHIVE_STORAGE_DIR,
      );
}

function profileAssetPublicPath(assetId: string) {
  return `/api/archive/profile-assets/${assetId}`;
}

function normalizeAccountAddress(accountAddress: string) {
  return getAddress(accountAddress).toLowerCase();
}

function hashUrl(sourceUrl: string) {
  return createHash("sha256").update(sourceUrl).digest("hex").slice(0, 20);
}

function extensionFrom(input: { sourceUrl: string; mimeType: string | null }) {
  const mime = input.mimeType?.split(";")[0]?.trim().toLowerCase();
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/avif") return ".avif";

  try {
    const ext = path.extname(new URL(input.sourceUrl).pathname);
    return ext && ext.length <= 8 ? ext : ".img";
  } catch {
    return ".img";
  }
}

function profileAssetPath(input: {
  accountAddress: string;
  kind: ProfileAssetKind;
  sourceUrl: string;
  mimeType: string | null;
}) {
  return path.join(
    archiveStorageRoot(),
    "foundation-profile-assets",
    input.accountAddress,
    `${input.kind}-${hashUrl(input.sourceUrl)}${extensionFrom(input)}`,
  );
}

async function pathExists(filePath: string | null | undefined) {
  if (!filePath) return false;
  try {
    const fileStats = await stat(filePath);
    return fileStats.isFile();
  } catch {
    return false;
  }
}

async function downloadProfileAsset(input: {
  accountAddress: string;
  kind: ProfileAssetKind;
  sourceUrl: string;
}) {
  const response = await fetch(input.sourceUrl, {
    headers: {
      "user-agent": "foundation-archive/0.1 (+https://foundation.app)",
    },
    signal: AbortSignal.timeout(PROFILE_ASSET_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Unable to download Foundation ${input.kind}: ${response.status}`,
    );
  }

  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > PROFILE_ASSET_MAX_BYTES) {
    throw new Error(`Foundation ${input.kind} is larger than the safety cap.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new Error(`Foundation ${input.kind} downloaded as an empty file.`);
  }
  if (buffer.byteLength > PROFILE_ASSET_MAX_BYTES) {
    throw new Error(`Foundation ${input.kind} is larger than the safety cap.`);
  }

  const mimeType = response.headers.get("content-type");
  const localPath = profileAssetPath({
    accountAddress: input.accountAddress,
    kind: input.kind,
    sourceUrl: input.sourceUrl,
    mimeType,
  });
  await mkdir(path.dirname(localPath), { recursive: true });
  const tempPath = `${localPath}.part-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  await writeFile(tempPath, buffer);
  await rename(tempPath, localPath);

  return {
    localPath,
    mimeType,
    byteSize: buffer.byteLength,
  };
}

async function upsertAndDownloadAsset(args: {
  client: DatabaseClient;
  profileId: string;
  accountAddress: string;
  kind: ProfileAssetKind;
  sourceUrl: string | null;
}) {
  const { client, profileId, accountAddress, kind, sourceUrl } = args;
  if (!sourceUrl) return null;

  const existing = await client.foundationProfileAsset.findFirst({
    where: { profileId, kind, sourceUrl },
  });
  if (
    existing?.status === BackupStatus.DOWNLOADED &&
    (await pathExists(existing.localPath))
  ) {
    return existing;
  }

  const asset = existing
    ? await client.foundationProfileAsset.update({
        where: { id: existing.id },
        data: { status: BackupStatus.PENDING, lastError: null },
      })
    : await client.foundationProfileAsset.create({
        data: { profileId, kind, sourceUrl },
      });

  try {
    const download = await downloadProfileAsset({
      accountAddress,
      kind,
      sourceUrl,
    });
    return client.foundationProfileAsset.update({
      where: { id: asset.id },
      data: {
        ...download,
        status: BackupStatus.DOWNLOADED,
        lastDownloadedAt: new Date(),
        lastError: null,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown profile asset failure";
    return client.foundationProfileAsset.update({
      where: { id: asset.id },
      data: {
        status: BackupStatus.FAILED,
        lastError: message,
      },
    });
  }
}

function profileWithCachedAssetUrls(
  profile: CachedProfileRecord,
  assets: Array<{
    id: string;
    kind: string;
    status: BackupStatus;
    localPath: string | null;
  }>,
): FoundationUserProfile {
  const downloaded = new Map(
    assets
      .filter(
        (asset) =>
          asset.status === BackupStatus.DOWNLOADED && Boolean(asset.localPath),
      )
      .map((asset) => [asset.kind, profileAssetPublicPath(asset.id)]),
  );

  return {
    accountAddress: profile.accountAddress,
    username: profile.username,
    name: profile.name,
    bio: profile.bio,
    profileImageUrl: downloaded.get("avatar") ?? profile.profileImageUrl,
    coverImageUrl: downloaded.get("cover") ?? profile.coverImageUrl,
  };
}

export async function archiveFoundationProfile(
  client: DatabaseClient,
  profile: FoundationUserProfile,
): Promise<FoundationUserProfile> {
  const accountAddress = normalizeAccountAddress(profile.accountAddress);
  const normalizedUsername = profile.username?.replace(/^@+/, "") ?? null;
  const saved = await client.foundationProfile.upsert({
    where: { accountAddress },
    create: {
      accountAddress,
      username: normalizedUsername,
      name: profile.name,
      bio: profile.bio,
      foundationUrl: normalizedUsername
        ? buildFoundationProfileUrl(normalizedUsername)
        : null,
      profileImageUrl: profile.profileImageUrl,
      coverImageUrl: profile.coverImageUrl,
      lastFetchedAt: new Date(),
    },
    update: {
      username: normalizedUsername,
      name: profile.name,
      bio: profile.bio,
      foundationUrl: normalizedUsername
        ? buildFoundationProfileUrl(normalizedUsername)
        : undefined,
      profileImageUrl: profile.profileImageUrl,
      coverImageUrl: profile.coverImageUrl,
      lastFetchedAt: new Date(),
    },
  });

  const assets = await Promise.all([
    upsertAndDownloadAsset({
      client,
      profileId: saved.id,
      accountAddress,
      kind: "avatar",
      sourceUrl: profile.profileImageUrl,
    }),
    upsertAndDownloadAsset({
      client,
      profileId: saved.id,
      accountAddress,
      kind: "cover",
      sourceUrl: profile.coverImageUrl,
    }),
  ]);

  return profileWithCachedAssetUrls(
    saved,
    assets.filter((asset): asset is NonNullable<typeof asset> =>
      Boolean(asset),
    ),
  );
}

export async function getCachedFoundationProfileByUsername(
  client: DatabaseClient,
  username: string,
) {
  const normalized = username.replace(/^@+/, "");
  const profile = await client.foundationProfile.findFirst({
    where: { username: { equals: normalized, mode: "insensitive" } },
    include: { assets: true },
  });
  if (!profile) return null;
  return profileWithCachedAssetUrls(profile, profile.assets);
}

export async function getCachedFoundationProfileByAddress(
  client: DatabaseClient,
  accountAddress: string,
) {
  const normalized = normalizeAccountAddress(accountAddress);
  const profile = await client.foundationProfile.findUnique({
    where: { accountAddress: normalized },
    include: { assets: true },
  });
  if (!profile) return null;
  return profileWithCachedAssetUrls(profile, profile.assets);
}

export async function resolveFoundationProfileByUsername(
  client: DatabaseClient,
  username: string,
) {
  const liveProfile = await fetchFoundationUserByUsername(username).catch(
    () => null,
  );
  if (liveProfile) {
    return archiveFoundationProfile(client, liveProfile);
  }
  return getCachedFoundationProfileByUsername(client, username);
}

export async function backfillFoundationProfileAssets(
  client: DatabaseClient,
  options: { limit?: number } = {},
) {
  const artists = await client.artwork.findMany({
    where: {
      artistUsername: { not: null },
      artistWallet: { not: null },
    },
    distinct: ["artistWallet"],
    orderBy: [{ lastIndexedAt: "desc" }, { updatedAt: "desc" }],
    take: options.limit ?? 1000,
    select: {
      artistUsername: true,
      artistWallet: true,
    },
  });

  let attempted = 0;
  let archived = 0;
  let failed = 0;

  for (const artist of artists) {
    if (!artist.artistUsername) continue;
    attempted += 1;
    try {
      const profile = await fetchFoundationUserByUsername(
        artist.artistUsername,
      );
      if (!profile) continue;
      await archiveFoundationProfile(client, profile);
      archived += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    discoveredArtists: artists.length,
    attempted,
    archived,
    failed,
  };
}

export type FoundationProfileBackfillArtist = {
  artistWallet: string;
  artistUsername: string;
};

export async function countFoundationProfileBackfillArtists(
  client: DatabaseClient,
) {
  const rows = await client.$queryRaw<
    Array<{ count: bigint | number }>
  >(Prisma.sql`
    SELECT COUNT(DISTINCT "artistWallet") AS count
    FROM "Artwork"
    WHERE "artistWallet" IS NOT NULL
      AND "artistUsername" IS NOT NULL
  `);
  const count = rows[0]?.count ?? 0;
  return typeof count === "bigint" ? Number(count) : count;
}

export async function loadFoundationProfileBackfillBatch(
  client: DatabaseClient,
  input: {
    cursor: string | null;
    take: number;
  },
): Promise<FoundationProfileBackfillArtist[]> {
  const rows = await client.$queryRaw<
    Array<{
      artistWallet: string;
      artistUsername: string;
    }>
  >(Prisma.sql`
    SELECT DISTINCT ON ("artistWallet")
      "artistWallet",
      "artistUsername"
    FROM "Artwork"
    WHERE "artistWallet" IS NOT NULL
      AND "artistUsername" IS NOT NULL
      ${input.cursor ? Prisma.sql`AND "artistWallet" > ${input.cursor}` : Prisma.empty}
    ORDER BY
      "artistWallet" ASC,
      "lastIndexedAt" DESC NULLS LAST,
      "updatedAt" DESC,
      "id" DESC
    LIMIT ${input.take}
  `);

  return rows.map((row) => ({
    artistWallet: row.artistWallet.toLowerCase(),
    artistUsername: row.artistUsername,
  }));
}

export async function archiveFoundationProfileBackfillArtist(
  client: DatabaseClient,
  artist: FoundationProfileBackfillArtist,
) {
  const profile = await fetchFoundationUserByUsername(artist.artistUsername);
  if (!profile) {
    return {
      status: "missing" as const,
      artistWallet: artist.artistWallet,
      artistUsername: artist.artistUsername,
    };
  }

  await archiveFoundationProfile(client, profile);
  return {
    status: "archived" as const,
    artistWallet: artist.artistWallet,
    artistUsername: artist.artistUsername,
  };
}
