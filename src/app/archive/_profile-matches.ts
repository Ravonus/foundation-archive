import "server-only";

import { getAddress } from "viem";

import { parseIpfsLookupInput } from "~/server/archive/ipfs";
import { db } from "~/server/db";
import { BackupStatus, type Prisma } from "~/server/prisma-client";

import { type ArchiveProfileMatch } from "./_types";

const ARCHIVE_PROFILE_MATCH_LIMIT = 12;
const ARCHIVE_PROFILE_MATCH_ROW_LIMIT = 250;

type ProfileMatchArtworkRow = {
  title: string;
  artistName: string | null;
  artistUsername: string | null;
  artistWallet: string | null;
};

type CachedProfileMatchRow = {
  accountAddress: string;
  username: string | null;
  name: string | null;
  assets: Array<{ id: string }>;
};

type ProfileMatchCandidate = {
  accountAddress: string;
  username: string | null;
  name: string | null;
  matchingCount: number;
  sampleTitles: string[];
};

function normalizeAddressQuery(query: string) {
  const trimmed = query.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return null;

  try {
    return getAddress(trimmed).toLowerCase();
  } catch {
    return null;
  }
}

function profileMatchArtworkWhere(input: {
  query: string;
  cidArtworkIds: string[] | null;
}): Prisma.ArtworkWhereInput | null {
  if (!input.query) return null;

  if (parseIpfsLookupInput(input.query)) {
    return { id: { in: input.cidArtworkIds ?? [] } };
  }

  const address = normalizeAddressQuery(input.query);
  if (!address) return null;

  return { OR: [{ artistWallet: address }, { contractAddress: address }] };
}

function profileKeyForRow(row: {
  artistWallet: string | null;
  artistUsername: string | null;
}) {
  return (row.artistWallet ?? row.artistUsername ?? "").toLowerCase();
}

function mergeSampleTitle(titles: string[], title: string) {
  if (titles.includes(title) || titles.length >= 3) return;
  titles.push(title);
}

function profileCandidatesFromRows(
  rows: ProfileMatchArtworkRow[],
  directProfile: CachedProfileMatchRow | null,
) {
  const byProfile = new Map<string, ProfileMatchCandidate>();

  for (const row of rows) {
    if (!row.artistWallet) continue;

    const key = profileKeyForRow(row);
    const current = byProfile.get(key);
    if (current) {
      current.matchingCount += 1;
      mergeSampleTitle(current.sampleTitles, row.title);
      continue;
    }

    byProfile.set(key, {
      accountAddress: row.artistWallet.toLowerCase(),
      username: row.artistUsername,
      name: row.artistName,
      matchingCount: 1,
      sampleTitles: [row.title],
    });
  }

  if (directProfile && !byProfile.has(directProfile.accountAddress)) {
    byProfile.set(directProfile.accountAddress, {
      accountAddress: directProfile.accountAddress,
      username: directProfile.username,
      name: directProfile.name,
      matchingCount: 0,
      sampleTitles: [],
    });
  }

  return [...byProfile.values()].slice(0, ARCHIVE_PROFILE_MATCH_LIMIT);
}

function loadProfileMatchRows(artworkWhere: Prisma.ArtworkWhereInput | null) {
  if (!artworkWhere) {
    return Promise.resolve([] satisfies ProfileMatchArtworkRow[]);
  }

  return db.artwork.findMany({
    where: { AND: [artworkWhere, { artistWallet: { not: null } }] },
    orderBy: [{ lastIndexedAt: "desc" }, { updatedAt: "desc" }],
    take: ARCHIVE_PROFILE_MATCH_ROW_LIMIT,
    select: {
      title: true,
      artistName: true,
      artistUsername: true,
      artistWallet: true,
    },
  });
}

function loadDirectCachedProfile(address: string | null) {
  if (!address) return Promise.resolve(null);

  return db.foundationProfile.findUnique({
    where: { accountAddress: address },
    select: {
      accountAddress: true,
      username: true,
      name: true,
      assets: {
        where: { kind: "avatar", status: BackupStatus.PINNED },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
}

async function loadCachedProfileRows(wallets: string[]) {
  return db.foundationProfile.findMany({
    where: { accountAddress: { in: wallets } },
    select: {
      accountAddress: true,
      username: true,
      name: true,
      assets: {
        where: { kind: "avatar", status: BackupStatus.PINNED },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
}

async function loadSavedCountsByAddress(wallets: string[]) {
  const savedCounts = await db.artwork.groupBy({
    by: ["artistWallet"],
    where: {
      AND: [
        { artistWallet: { in: wallets } },
        {
          OR: [
            { metadataRootId: { not: null } },
            { mediaRootId: { not: null } },
          ],
        },
      ],
    },
    _count: { _all: true },
  });

  const byAddress = new Map<string, number>();
  for (const row of savedCounts) {
    if (!row.artistWallet) continue;
    byAddress.set(row.artistWallet, row._count._all);
  }
  return byAddress;
}

function profileMatchesFromCandidates(input: {
  candidates: ProfileMatchCandidate[];
  cachedProfiles: CachedProfileMatchRow[];
  savedCountByAddress: Map<string, number>;
}): ArchiveProfileMatch[] {
  const cachedByAddress = new Map(
    input.cachedProfiles.map((profile) => [profile.accountAddress, profile]),
  );

  return input.candidates.map((candidate) => {
    const cached = cachedByAddress.get(candidate.accountAddress);
    const avatarAssetId = cached?.assets[0]?.id;

    return {
      accountAddress: candidate.accountAddress,
      username: cached?.username ?? candidate.username,
      name: cached?.name ?? candidate.name,
      avatarUrl: avatarAssetId
        ? `/api/archive/profile-assets/${avatarAssetId}`
        : null,
      savedCount: input.savedCountByAddress.get(candidate.accountAddress) ?? 0,
      matchingCount: candidate.matchingCount,
      sampleTitles: candidate.sampleTitles,
    };
  });
}

export async function loadArchiveProfileMatches(input: {
  query: string;
  cidArtworkIds: string[] | null;
}): Promise<ArchiveProfileMatch[]> {
  const address = normalizeAddressQuery(input.query);
  const artworkWhere = profileMatchArtworkWhere(input);
  const [rows, directProfile] = await Promise.all([
    loadProfileMatchRows(artworkWhere),
    loadDirectCachedProfile(address),
  ]);

  const candidates = profileCandidatesFromRows(rows, directProfile);
  if (candidates.length === 0) return [];

  const wallets = candidates.map((profile) => profile.accountAddress);
  const [cachedProfiles, savedCountByAddress] = await Promise.all([
    loadCachedProfileRows(wallets),
    loadSavedCountsByAddress(wallets),
  ]);

  return profileMatchesFromCandidates({
    candidates,
    cachedProfiles,
    savedCountByAddress,
  });
}
