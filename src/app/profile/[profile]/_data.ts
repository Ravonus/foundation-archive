import { notFound } from "next/navigation";
import { getAddress } from "viem";

import { type ArtworkGridItem } from "~/app/_components/artwork-grid";
import { loadArchivedWorksForArtist } from "~/app/archive/_data";
import { toArchivedGridItem, toDiscoveredGridItem } from "~/app/archive/_grid-item";
import { type ArchivedArtworkRow, artworkKey } from "~/app/archive/_types";
import { archiveItemStatus } from "~/lib/archive-browse";
import {
  buildFoundationProfileUrl,
  tryFetchFoundationProfileByUsername,
} from "~/server/archive/foundation";
import {
  discoverFoundationWorks,
  fetchFoundationUserByUsername,
  type FoundationLookupWork,
} from "~/server/archive/foundation-api";
import { db } from "~/server/db";

import { type PartitionedItems, type ResolvedProfile } from "./_types";

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
    (await fetchFoundationUserByUsername(normalizedKey)) ??
    (await discoverFoundationWorks(normalizedKey)).profiles[0] ??
    null;

  if (foundProfile) {
    return {
      ...emptyResolvedProfile(normalizeProfileAddress(foundProfile.accountAddress)),
      username: foundProfile.username ?? normalizedKey,
      name: foundProfile.name ?? null,
      profileImageUrl: foundProfile.profileImageUrl ?? null,
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

export function enrichProfileFromArchived(
  resolved: ResolvedProfile,
  archivedWorks: ArchivedArtworkRow[],
): ResolvedProfile {
  const first = archivedWorks[0];

  return {
    ...resolved,
    username: resolved.username ?? first?.artistUsername ?? null,
    name: resolved.name ?? first?.artistName ?? null,
  };
}

export async function hydrateProfileFromFoundation(
  resolved: ResolvedProfile,
): Promise<ResolvedProfile> {
  if (!resolved.username) return resolved;

  const foundationProfile = await tryFetchFoundationProfileByUsername(
    resolved.username,
  ).catch(() => null);
  if (!foundationProfile) return resolved;

  return {
    ...resolved,
    accountAddress: normalizeProfileAddress(foundationProfile.accountAddress),
    username: foundationProfile.username ?? resolved.username,
    name: foundationProfile.name ?? resolved.name ?? null,
    profileImageUrl:
      foundationProfile.profileImageUrl ?? resolved.profileImageUrl,
    bio: foundationProfile.bio ?? resolved.bio ?? null,
    coverImageUrl:
      foundationProfile.coverImageUrl ?? resolved.coverImageUrl ?? null,
  };
}

export async function loadArchivedProfileWorks(resolved: ResolvedProfile) {
  return loadArchivedWorksForArtist({
    accountAddress: resolved.accountAddress,
    username: resolved.username,
  });
}

type ProfileBucket = "saved" | "syncing" | "found";

function bucketForItem(item: ArtworkGridItem): ProfileBucket {
  const status = archiveItemStatus(item);
  if (status === "preserved") return "saved";
  if (status === "missing") return "found";
  return "syncing";
}

export function partitionWorksByArchiveState(
  works: FoundationLookupWork[],
  archivedWorks: ArchivedArtworkRow[],
): PartitionedItems {
  const archivedByKey = new Map(
    archivedWorks.map((artwork) => [
      artworkKey(artwork.contractAddress, artwork.tokenId),
      artwork,
    ]),
  );
  const seen = new Set<string>();
  const items: ArtworkGridItem[] = [];
  const counts = {
    total: 0,
    saved: 0,
    syncing: 0,
    found: 0,
  };

  for (const work of works) {
    const key = artworkKey(work.contractAddress, work.tokenId);
    const archived = archivedByKey.get(key);
    const item = archived ? toArchivedGridItem(archived) : toDiscoveredGridItem(work);
    items.push(item);
    seen.add(key);
  }

  for (const archived of archivedWorks) {
    const key = artworkKey(archived.contractAddress, archived.tokenId);
    if (seen.has(key)) continue;
    items.push(toArchivedGridItem(archived));
    seen.add(key);
  }

  for (const item of items) {
    counts.total += 1;
    counts[bucketForItem(item)] += 1;
  }

  return { items, counts };
}

export function normalizeProfileView(view: string) {
  if (view === "saved" || view === "on-server") return "saved";
  if (view === "syncing") return "syncing";
  if (view === "found" || view === "not-yet") return "found";
  return "all";
}

export function selectVisibleItems(
  view: string,
  items: ArtworkGridItem[],
): ArtworkGridItem[] {
  const normalized = normalizeProfileView(view);
  if (normalized === "all") return items;

  return items.filter((item) => bucketForItem(item) === normalized);
}

export function foundationUrlFor(resolved: ResolvedProfile) {
  return resolved.username
    ? buildFoundationProfileUrl(resolved.username)
    : `https://foundation.app/${resolved.accountAddress}`;
}
