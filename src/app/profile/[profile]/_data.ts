import { notFound } from "next/navigation";
import { getAddress } from "viem";

import { type ArtworkGridItem } from "~/app/_components/artwork-grid";
import {
  toArchivedGridItem,
  toDiscoveredGridItem,
} from "~/app/archive/_grid-item";
import {
  type ArchivedArtworkRow,
  artworkKey,
  hasCapturedServerRoot,
} from "~/app/archive/_types";
import { buildFoundationProfileUrl } from "~/server/archive/foundation";
import {
  getCachedFoundationProfileByAddress,
  getCachedFoundationProfileByUsername,
} from "~/server/archive/profile-assets";
import { type FoundationLookupWork } from "~/server/archive/foundation-api";
import { detectWorkStorageProtocol } from "~/server/archive/foundation-api/client";
import { db } from "~/server/db";
import { BackupStatus, type Prisma } from "~/server/prisma-client";

import {
  type ProfileItemCounts,
  type ProfileView,
  type ResolvedProfile,
} from "./_types";

export const PROFILE_PAGE_SIZE = 24;

const ARCHIVED_SELECT = {
  id: true,
  chainId: true,
  slug: true,
  title: true,
  artistName: true,
  artistUsername: true,
  artistWallet: true,
  collectionName: true,
  tokenId: true,
  contractAddress: true,
  foundationContractType: true,
  mediaKind: true,
  metadataUrl: true,
  metadataStatus: true,
  mediaStatus: true,
  sourceUrl: true,
  previewUrl: true,
  staticPreviewUrl: true,
  foundationUrl: true,
  updatedAt: true,
  metadataRoot: {
    select: {
      cid: true,
      relativePath: true,
      gatewayUrl: true,
    },
  },
  mediaRoot: {
    select: {
      cid: true,
      relativePath: true,
      gatewayUrl: true,
    },
  },
} as const;

const HAS_ROOTS_WHERE: Prisma.ArtworkWhereInput = {
  OR: [{ metadataRootId: { not: null } }, { mediaRootId: { not: null } }],
};

const PRESERVED_WHERE: Prisma.ArtworkWhereInput = {
  AND: [
    { OR: [{ metadataRootId: null }, { metadataStatus: BackupStatus.PINNED }] },
    { OR: [{ mediaRootId: null }, { mediaStatus: BackupStatus.PINNED }] },
  ],
};

const SAVED_WHERE: Prisma.ArtworkWhereInput = {
  AND: [HAS_ROOTS_WHERE, PRESERVED_WHERE],
};

const SYNCING_WHERE: Prisma.ArtworkWhereInput = {
  AND: [HAS_ROOTS_WHERE, { NOT: PRESERVED_WHERE }],
};

function emptyResolvedProfile(accountAddress: string): ResolvedProfile {
  return {
    accountAddress,
    username: null,
    name: null,
    profileImageUrl: null,
    bio: null,
    coverImageUrl: null,
  };
}

function normalizeProfileAddress(accountAddress: string) {
  return getAddress(accountAddress).toLowerCase();
}

async function lookupArchivedProfileByWallet(accountAddress: string) {
  return db.artwork.findFirst({
    where: {
      artistWallet: accountAddress,
    },
    orderBy: [{ lastIndexedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      artistName: true,
      artistUsername: true,
    },
  });
}

async function lookupArchivedProfileByUsername(username: string) {
  return db.artwork.findFirst({
    where: {
      artistUsername: {
        equals: username,
        mode: "insensitive",
      },
    },
    orderBy: [{ lastIndexedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      artistName: true,
      artistUsername: true,
      artistWallet: true,
    },
  });
}

export async function resolveProfileFromKey(
  key: string,
): Promise<ResolvedProfile> {
  return /^0x[a-fA-F0-9]{40}$/.test(key)
    ? resolveProfileFromAddressKey(key)
    : resolveProfileFromUsernameKey(key);
}

async function resolveProfileFromAddressKey(
  key: string,
): Promise<ResolvedProfile> {
  const accountAddress = normalizeProfileAddress(key);
  const cached = await getCachedFoundationProfileByAddress(db, accountAddress);
  if (cached) {
    return {
      ...emptyResolvedProfile(accountAddress),
      username: cached.username,
      name: cached.name,
      profileImageUrl: cached.profileImageUrl,
      coverImageUrl: cached.coverImageUrl,
      bio: cached.bio,
    };
  }

  const archived = await lookupArchivedProfileByWallet(accountAddress);

  return {
    ...emptyResolvedProfile(accountAddress),
    username: archived?.artistUsername ?? null,
    name: archived?.artistName ?? null,
  };
}

async function resolveProfileFromUsernameKey(
  key: string,
): Promise<ResolvedProfile> {
  const normalizedKey = key.replace(/^@+/, "");
  const foundProfile =
    (await getCachedFoundationProfileByUsername(db, normalizedKey)) ?? null;

  if (foundProfile) {
    return {
      ...emptyResolvedProfile(
        normalizeProfileAddress(foundProfile.accountAddress),
      ),
      username: foundProfile.username ?? normalizedKey,
      name: foundProfile.name ?? null,
      profileImageUrl: foundProfile.profileImageUrl ?? null,
      coverImageUrl: foundProfile.coverImageUrl ?? null,
      bio: foundProfile.bio ?? null,
    };
  }

  const archived = await lookupArchivedProfileByUsername(normalizedKey);
  if (!archived?.artistWallet) {
    notFound();
  }

  return {
    ...emptyResolvedProfile(normalizeProfileAddress(archived.artistWallet)),
    username: archived.artistUsername ?? normalizedKey,
    name: archived.artistName ?? null,
  };
}

export function enrichProfileFromWorks(
  resolved: ResolvedProfile,
  works: FoundationLookupWork[],
): ResolvedProfile {
  const first = works[0];

  return {
    ...resolved,
    username: resolved.username ?? first?.artistUsername ?? null,
    name: resolved.name ?? first?.artistName ?? null,
  };
}

function mergeResolvedProfile(
  resolved: ResolvedProfile,
  profile: Awaited<ReturnType<typeof getCachedFoundationProfileByUsername>>,
): ResolvedProfile {
  if (!profile) return resolved;
  return {
    ...resolved,
    accountAddress: normalizeProfileAddress(profile.accountAddress),
    username: profile.username ?? resolved.username,
    name: profile.name ?? resolved.name ?? null,
    profileImageUrl: profile.profileImageUrl ?? resolved.profileImageUrl,
    bio: profile.bio ?? resolved.bio ?? null,
    coverImageUrl: profile.coverImageUrl ?? resolved.coverImageUrl ?? null,
  };
}

export async function hydrateProfileFromCache(
  resolved: ResolvedProfile,
): Promise<ResolvedProfile> {
  const profile = resolved.username
    ? await getCachedFoundationProfileByUsername(db, resolved.username)
    : await getCachedFoundationProfileByAddress(db, resolved.accountAddress);

  return mergeResolvedProfile(resolved, profile);
}

export function normalizeProfileView(view: string | undefined): ProfileView {
  if (view === "saved" || view === "on-server") return "saved";
  if (view === "syncing") return "syncing";
  if (view === "found" || view === "not-yet") return "found";
  return "all";
}

function buildArtistWhere(input: {
  accountAddress: string;
  username: string | null;
}): Prisma.ArtworkWhereInput {
  const artistFilters: Prisma.ArtworkWhereInput[] = [
    { artistWallet: input.accountAddress.toLowerCase() },
  ];
  if (input.username) {
    artistFilters.push({
      artistUsername: {
        equals: input.username,
        mode: "insensitive",
      },
    });
  }
  return { OR: artistFilters };
}

function buildArtistArchivedWhere(input: {
  accountAddress: string;
  username: string | null;
  view: ProfileView;
}): Prisma.ArtworkWhereInput {
  const artistWhere = buildArtistWhere(input);
  switch (input.view) {
    case "saved":
      return { AND: [artistWhere, SAVED_WHERE] };
    case "syncing":
      return { AND: [artistWhere, SYNCING_WHERE] };
    case "all":
      return artistWhere;
    case "found":
      return { AND: [artistWhere, { NOT: HAS_ROOTS_WHERE }] };
  }
}

export type ProfileCursor = {
  id: string;
  updatedAt: string;
};

export function encodeProfileCursor(cursor: ProfileCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeProfileCursor(
  encoded: string | null | undefined,
): ProfileCursor | null {
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    if (typeof parsed.id !== "string") return null;
    if (typeof parsed.updatedAt !== "string") return null;
    if (Number.isNaN(Date.parse(parsed.updatedAt))) return null;
    return { id: parsed.id, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

function buildCursorWhere(cursor: ProfileCursor): Prisma.ArtworkWhereInput {
  const updatedAt = new Date(cursor.updatedAt);
  return {
    OR: [
      { updatedAt: { lt: updatedAt } },
      {
        AND: [{ updatedAt }, { id: { lt: cursor.id } }],
      },
    ],
  };
}

export async function loadArchivedArtistPage(input: {
  accountAddress: string;
  username: string | null;
  view: ProfileView;
  encodedCursor: string | null;
}): Promise<{ rows: ArchivedArtworkRow[]; nextCursor: string | null }> {
  const baseWhere = buildArtistArchivedWhere(input);
  const cursor = decodeProfileCursor(input.encodedCursor);
  const where = cursor
    ? { AND: [baseWhere, buildCursorWhere(cursor)] }
    : baseWhere;

  const rows = await db.artwork.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: PROFILE_PAGE_SIZE + 1,
    select: ARCHIVED_SELECT,
  });

  const page = rows.slice(0, PROFILE_PAGE_SIZE);
  const hasMore = rows.length > PROFILE_PAGE_SIZE;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeProfileCursor({
          id: last.id,
          updatedAt: last.updatedAt.toISOString(),
        })
      : null;

  return { rows: page, nextCursor };
}

export async function computeArtistCounts(input: {
  accountAddress: string;
  username: string | null;
}): Promise<ProfileItemCounts> {
  const artistWhere = buildArtistWhere(input);
  const [withRootsCount, savedCount, syncingCount, localRows] =
    await Promise.all([
      db.artwork.count({ where: { AND: [artistWhere, HAS_ROOTS_WHERE] } }),
      db.artwork.count({ where: { AND: [artistWhere, SAVED_WHERE] } }),
      db.artwork.count({ where: { AND: [artistWhere, SYNCING_WHERE] } }),
      db.artwork.findMany({
        where: artistWhere,
        select: {
          metadataUrl: true,
          sourceUrl: true,
          previewUrl: true,
          staticPreviewUrl: true,
          metadataRootId: true,
          mediaRootId: true,
        },
      }),
    ]);

  const total = localRows.length;
  const offChain = localRows.filter((row) => {
    const protocol = detectWorkStorageProtocol({
      metadataUrl: row.metadataUrl,
      sourceUrl: row.sourceUrl,
      mediaUrl: row.staticPreviewUrl ?? row.previewUrl,
    });
    return protocol !== "ipfs";
  }).length;
  const found = Math.max(0, total - withRootsCount - offChain);

  return {
    total,
    saved: savedCount,
    syncing: syncingCount,
    found,
    offChain,
  };
}

function buildArchivedMap(archived: ArchivedArtworkRow[]) {
  return new Map(
    archived.map((row) => [artworkKey(row.contractAddress, row.tokenId), row]),
  );
}

export async function resolveArchivedRowsForWorks(
  input: { accountAddress: string; username: string | null },
  works: FoundationLookupWork[],
): Promise<Map<string, ArchivedArtworkRow>> {
  if (works.length === 0) return new Map();

  const rows = await db.artwork.findMany({
    where: {
      AND: [
        buildArtistWhere(input),
        {
          OR: works.map((work) => ({
            chainId: work.chainId,
            contractAddress: work.contractAddress,
            tokenId: work.tokenId,
          })),
        },
      ],
    },
    select: ARCHIVED_SELECT,
  });

  return buildArchivedMap(rows);
}

export function mergeArchivedAndFoundation(input: {
  view: ProfileView;
  archivedRows: ArchivedArtworkRow[];
  foundationWorks: FoundationLookupWork[];
  archivedByKey: Map<string, ArchivedArtworkRow>;
  seenKeys?: Set<string>;
}): { items: ArtworkGridItem[]; seenKeys: Set<string> } {
  const seen = new Set<string>(input.seenKeys ?? []);
  const items: ArtworkGridItem[] = [];

  for (const row of input.archivedRows) {
    const key = artworkKey(row.contractAddress, row.tokenId);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(toArchivedGridItem(row));
  }

  if (input.view === "saved" || input.view === "syncing") {
    return { items, seenKeys: seen };
  }

  for (const work of input.foundationWorks) {
    const key = artworkKey(work.contractAddress, work.tokenId);
    if (seen.has(key)) continue;
    const archived = input.archivedByKey.get(key);
    const isArchivable = work.storageProtocol === "ipfs";
    if (archived && hasCapturedServerRoot(archived)) {
      if (input.view === "found") continue;
      seen.add(key);
      items.push(toArchivedGridItem(archived));
    } else {
      // For the `found` tab, keep only archivable (IPFS) works so the count
      // and the list agree. Off-chain works surface in the `all` view where
      // we want the artist's full Foundation catalog visible with a clear
      // "not archivable" badge.
      if (input.view === "found" && !isArchivable) continue;
      seen.add(key);
      items.push(toDiscoveredGridItem(work));
    }
  }

  return { items, seenKeys: seen };
}

export function foundationUrlFor(resolved: ResolvedProfile) {
  return resolved.username
    ? buildFoundationProfileUrl(resolved.username)
    : `https://foundation.app/${resolved.accountAddress}`;
}
