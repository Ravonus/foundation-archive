/* eslint-disable complexity, max-lines, @typescript-eslint/no-unnecessary-condition */

import { createHash } from "node:crypto";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { getAddress } from "viem";

import { env } from "~/env";
import {
  buildFoundationProfileUrl,
  fetchFoundationProfileByUsername,
} from "~/server/archive/foundation";
import {
  fetchFoundationWorksByCreator,
  fetchFoundationUserByUsername,
  searchFoundationUsers,
  type FoundationUserProfile,
} from "~/server/archive/foundation-api";
import { BackupStatus, Prisma } from "~/server/prisma-client";
import { type DatabaseClient } from "./jobs/shared";

const PROFILE_ASSET_TIMEOUT_MS = 45_000;
const PROFILE_ASSET_MAX_BYTES = 25 * 1024 * 1024;
const FOUNDATION_PROFILE_RETRY_LIMIT = 4;
const FOUNDATION_PROFILE_RETRY_BASE_MS = 1_000;

type ProfileAssetKind = "avatar" | "cover";
type ProfileLookupResult =
  | { status: "found"; profile: FoundationUserProfile }
  | { status: "missing" }
  | { status: "failed"; message: string };

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAccountAddress(accountAddress: string) {
  return getAddress(accountAddress).toLowerCase();
}

function normalizeUsername(username: string | null | undefined) {
  const trimmed = username?.trim().replace(/^@+/, "");
  if (!trimmed) return null;
  return trimmed;
}

function isRetryableFoundationLookupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /Foundation API request failed: (408|409|425|429|5\d\d)/i.test(message) ||
    /Unable to fetch Foundation .*: (408|409|425|429|5\d\d)/i.test(message) ||
    /timed out|timeout|network|fetch failed|ECONNRESET|ENOTFOUND|EAI_AGAIN/i.test(
      message,
    )
  );
}

async function withFoundationLookupRetries<T>(
  label: string,
  run: () => Promise<T>,
) {
  let lastError: unknown = null;

  for (
    let attempt = 1;
    attempt <= FOUNDATION_PROFILE_RETRY_LIMIT;
    attempt += 1
  ) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (
        attempt >= FOUNDATION_PROFILE_RETRY_LIMIT ||
        !isRetryableFoundationLookupError(error)
      ) {
        break;
      }

      const backoffMs =
        FOUNDATION_PROFILE_RETRY_BASE_MS * 2 ** (attempt - 1) +
        Math.floor(Math.random() * 250);
      console.warn(
        `[profiles] retrying ${label} in ${backoffMs}ms after ${error instanceof Error ? error.message : String(error)}`,
      );
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

function scrapedProfileToUserProfile(
  profile: Awaited<ReturnType<typeof fetchFoundationProfileByUsername>>,
): FoundationUserProfile | null {
  if (!profile) return null;
  return {
    accountAddress: profile.accountAddress,
    name: profile.name,
    profileImageUrl: profile.profileImageUrl,
    coverImageUrl: profile.coverImageUrl,
    bio: profile.bio,
    username: profile.username,
  };
}

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isForbiddenFoundationApiError(error: unknown) {
  return /Foundation API request failed: 403/i.test(failureMessage(error));
}

function isMissingFoundationProfileError(error: unknown) {
  const message = failureMessage(error);
  return (
    /Unable to fetch Foundation profile page: 404/i.test(message) ||
    /did not contain __NEXT_DATA__/i.test(message)
  );
}

async function lookupFoundationProfileByUsername(
  username: string,
): Promise<ProfileLookupResult> {
  const normalized = normalizeUsername(username);
  if (!normalized) return { status: "missing" };

  let sawFailure: string | null = null;

  try {
    const scraped = await withFoundationLookupRetries(
      `scraped profile @${normalized}`,
      () => fetchFoundationProfileByUsername(normalized),
    );
    const mapped = scrapedProfileToUserProfile(scraped);
    if (mapped) {
      return { status: "found", profile: mapped };
    }
  } catch (error) {
    if (!isMissingFoundationProfileError(error)) {
      sawFailure = failureMessage(error);
    }
  }

  try {
    const direct = await withFoundationLookupRetries(
      `graphql profile @${normalized}`,
      () => fetchFoundationUserByUsername(normalized),
    );
    if (direct) {
      return { status: "found", profile: direct };
    }
  } catch (error) {
    sawFailure ??= failureMessage(error);
    if (isForbiddenFoundationApiError(error)) {
      return { status: "failed", message: sawFailure };
    }
  }

  if (!sawFailure || !isForbiddenFoundationApiError(sawFailure)) {
    try {
      const searchMatches = await withFoundationLookupRetries(
        `user search @${normalized}`,
        () => searchFoundationUsers(normalized, 5),
      );
      const exactMatch =
        searchMatches.find(
          (profile) => normalizeUsername(profile.username) === normalized,
        ) ??
        searchMatches[0] ??
        null;
      if (exactMatch) {
        return { status: "found", profile: exactMatch };
      }
    } catch (error) {
      sawFailure ??= failureMessage(error);
    }
  }

  return sawFailure
    ? { status: "failed", message: sawFailure }
    : { status: "missing" };
}

function storedProfileToUserProfile(
  profile: CachedProfileRecord,
): FoundationUserProfile {
  return {
    accountAddress: profile.accountAddress,
    username: profile.username,
    name: profile.name,
    bio: profile.bio,
    profileImageUrl: profile.profileImageUrl,
    coverImageUrl: profile.coverImageUrl,
  };
}

async function getStoredFoundationProfileByUsername(
  client: DatabaseClient,
  username: string,
) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;

  const profile = await client.foundationProfile.findFirst({
    where: { username: { equals: normalized, mode: "insensitive" } },
    select: {
      accountAddress: true,
      username: true,
      name: true,
      profileImageUrl: true,
      coverImageUrl: true,
      bio: true,
    },
  });
  return profile ? storedProfileToUserProfile(profile) : null;
}

async function getStoredFoundationProfileByAddress(
  client: DatabaseClient,
  accountAddress: string,
) {
  const normalized = normalizeAccountAddress(accountAddress);
  const profile = await client.foundationProfile.findUnique({
    where: { accountAddress: normalized },
    select: {
      accountAddress: true,
      username: true,
      name: true,
      profileImageUrl: true,
      coverImageUrl: true,
      bio: true,
    },
  });
  return profile ? storedProfileToUserProfile(profile) : null;
}

async function lookupFoundationProfileByWallet(
  accountAddress: string,
): Promise<ProfileLookupResult> {
  const normalizedAddress = normalizeAccountAddress(accountAddress);
  let works;
  try {
    works = await withFoundationLookupRetries(
      `creator works ${normalizedAddress}`,
      () => fetchFoundationWorksByCreator(normalizedAddress, 1, 0),
    );
  } catch (error) {
    return { status: "failed", message: failureMessage(error) };
  }

  const creator = works.find(
    (work) => work.artistWallet?.toLowerCase() === normalizedAddress,
  );
  const username = normalizeUsername(creator?.artistUsername);
  if (!username) {
    if (!creator?.artistProfileImageUrl) return { status: "missing" };
    return {
      status: "found",
      profile: {
        accountAddress: normalizedAddress,
        name: creator.artistName ?? null,
        profileImageUrl: creator.artistProfileImageUrl,
        coverImageUrl: null,
        bio: null,
        username: null,
      },
    };
  }

  const resolved = await lookupFoundationProfileByUsername(username);
  if (resolved.status === "found") return resolved;
  if (resolved.status === "failed" && !creator?.artistProfileImageUrl) {
    return resolved;
  }

  if (!creator?.artistProfileImageUrl) {
    return resolved.status === "failed" ? resolved : { status: "missing" };
  }
  return {
    status: "found",
    profile: {
      accountAddress: normalizedAddress,
      name: creator?.artistName ?? null,
      profileImageUrl: creator.artistProfileImageUrl,
      coverImageUrl: null,
      bio: null,
      username,
    },
  };
}

async function resolveFoundationProfileForBackfillArtist(
  client: DatabaseClient,
  artist: FoundationProfileBackfillArtist,
) {
  const normalizedArtistUsername = normalizeUsername(artist.artistUsername);
  const normalizedArtistWallet = normalizeAccountAddress(artist.artistWallet);

  const storedByAddress = await getStoredFoundationProfileByAddress(
    client,
    normalizedArtistWallet,
  );
  if (storedByAddress) {
    return storedByAddress;
  }

  const storedByUsername = normalizedArtistUsername
    ? await getStoredFoundationProfileByUsername(
        client,
        normalizedArtistUsername,
      )
    : null;
  if (
    storedByUsername &&
    normalizeAccountAddress(storedByUsername.accountAddress) ===
      normalizedArtistWallet
  ) {
    return storedByUsername;
  }

  const byUsername = normalizedArtistUsername
    ? await lookupFoundationProfileByUsername(normalizedArtistUsername)
    : ({ status: "missing" } as const);
  if (
    byUsername.status === "found" &&
    normalizeAccountAddress(byUsername.profile.accountAddress) ===
      normalizedArtistWallet
  ) {
    return byUsername.profile;
  }

  const byWallet = await lookupFoundationProfileByWallet(
    normalizedArtistWallet,
  );
  if (byWallet.status === "found") {
    return byWallet.profile;
  }

  if (byWallet.status === "failed") {
    throw new Error(byWallet.message);
  }
  if (byUsername.status === "failed") {
    throw new Error(byUsername.message);
  }
  return null;
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
  const archivedAssetUrl = (kind: ProfileAssetKind) => {
    const asset = assets.find(
      (candidate) =>
        candidate.kind === kind &&
        candidate.status === BackupStatus.DOWNLOADED &&
        Boolean(candidate.localPath),
    );
    return asset ? profileAssetPublicPath(asset.id) : null;
  };

  return {
    accountAddress: profile.accountAddress,
    username: profile.username,
    name: profile.name,
    bio: profile.bio,
    profileImageUrl: archivedAssetUrl("avatar"),
    coverImageUrl: archivedAssetUrl("cover"),
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
  const profile = await resolveFoundationProfileForBackfillArtist(
    client,
    artist,
  );
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
