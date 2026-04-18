import { notFound } from "next/navigation";

import { type ArtworkGridItem } from "~/app/_components/artwork-grid";
import { loadArchivedMatchesForWorks } from "~/app/archive/_data";
import { toArchivedGridItem, toDiscoveredGridItem } from "~/app/archive/_grid-item";
import { artworkKey, hasCapturedServerRoot } from "~/app/archive/_types";
import { buildFoundationProfileUrl } from "~/server/archive/foundation";
import {
  discoverFoundationWorks,
  fetchFoundationUserByUsername,
  type FoundationLookupWork,
} from "~/server/archive/foundation-api";

import { type PartitionedItems, type ResolvedProfile } from "./_types";

export async function resolveProfileFromKey(
  key: string,
): Promise<ResolvedProfile> {
  if (/^0x[a-fA-F0-9]{40}$/.test(key)) {
    return {
      accountAddress: key.toLowerCase(),
      username: null,
      name: null,
      profileImageUrl: null,
    };
  }

  const foundProfile =
    (await fetchFoundationUserByUsername(key)) ??
    (await discoverFoundationWorks(key)).profiles[0] ??
    null;

  if (!foundProfile) {
    notFound();
  }

  return {
    accountAddress: foundProfile.accountAddress.toLowerCase(),
    username: foundProfile.username ?? key.replace(/^@+/, ""),
    name: foundProfile.name ?? null,
    profileImageUrl: foundProfile.profileImageUrl ?? null,
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

export async function partitionWorksByArchiveState(
  works: FoundationLookupWork[],
): Promise<PartitionedItems> {
  const archivedMatches = await loadArchivedMatchesForWorks(works);
  const archivedByKey = new Map(
    archivedMatches.map((artwork) => [
      artworkKey(artwork.contractAddress, artwork.tokenId),
      artwork,
    ]),
  );

  const onServerItems: ArtworkGridItem[] = [];
  const missingItems: ArtworkGridItem[] = [];

  for (const work of works) {
    const archived = archivedByKey.get(
      artworkKey(work.contractAddress, work.tokenId),
    );

    if (archived && hasCapturedServerRoot(archived)) {
      onServerItems.push(toArchivedGridItem(archived));
      continue;
    }

    missingItems.push(toDiscoveredGridItem(work));
  }

  return { onServerItems, missingItems };
}

export function selectVisibleItems(
  view: string,
  partitioned: PartitionedItems,
): ArtworkGridItem[] {
  if (view === "on-server") return partitioned.onServerItems;
  if (view === "not-yet") return partitioned.missingItems;
  return [...partitioned.onServerItems, ...partitioned.missingItems];
}

export function foundationUrlFor(resolved: ResolvedProfile) {
  return resolved.username
    ? buildFoundationProfileUrl(resolved.username)
    : `https://foundation.app/${resolved.accountAddress}`;
}
