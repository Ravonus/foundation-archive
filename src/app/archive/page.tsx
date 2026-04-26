import { ArchiveBrowser } from "~/app/_components/archive-browser";
import { ArchiveLiveBoard } from "~/app/_components/archive-live-board";
import { type ArtworkGridItem } from "~/app/_components/artwork-grid";
import { FadeUp } from "~/app/_components/motion";
import { ProfileArchiveCards } from "~/app/_components/profile/profile-archive-cards";
import {
  discoverFoundationWorks,
  type FoundationLookupWork,
  type FoundationUserProfile,
} from "~/server/archive/foundation-api";
import { getArchiveLiveSnapshot } from "~/server/archive/dashboard";
import { attachMarketStateToGridItems } from "~/server/archive/foundation-market";
import { archiveFoundationProfile } from "~/server/archive/profile-assets";
import {
  persistDiscoveredFoundationWorks,
  PUBLIC_QUEUE_PRIORITY,
} from "~/server/archive/jobs";
import { db } from "~/server/db";
import {
  archiveItemMatchesFilters,
  type ArchiveMediaFilter,
  type ArchiveStatusFilter,
} from "~/lib/archive-browse";

import {
  buildArchivedWhere,
  computeNextCursor,
  loadArchivedMatchesForWorks,
  loadArchivedWorks,
} from "./_data";
import {
  buildProfileArchiveItems,
  toArchivedGridItem,
  toDiscoveredGridItem,
} from "./_grid-item";
import { ArchiveInfoDetails, ArchiveStickyHeader } from "./_presentational";
import {
  ARCHIVE_PAGE_SIZE,
  artworkKey,
  type ArchivePageProps,
  type ArchivedArtworkRow,
} from "./_types";
import {
  parseArchiveSearchParams,
  type ParsedArchiveSearchParams,
} from "./_search-params";

export const dynamic = "force-dynamic";

type DiscoveryResult = {
  profiles: FoundationUserProfile[];
  works: FoundationLookupWork[];
};

const EMPTY_DISCOVERY: DiscoveryResult = { profiles: [], works: [] };

async function runDiscovery(query: string): Promise<DiscoveryResult> {
  if (!query) return EMPTY_DISCOVERY;
  const discovery = await discoverFoundationWorks(query).catch(
    () => EMPTY_DISCOVERY,
  );
  const profiles = await Promise.all(
    discovery.profiles.map((profile) =>
      archiveFoundationProfile(db, profile).catch(() => profile),
    ),
  );
  return { ...discovery, profiles };
}

type MergeGridItemsInput = {
  archivedWorks: ArchivedArtworkRow[];
  discoveredArchivedWorks: ArchivedArtworkRow[];
  discoveryWorks: FoundationLookupWork[];
  archivedByKey: Map<string, ArchivedArtworkRow>;
};

function mergeGridItems(input: MergeGridItemsInput): ArtworkGridItem[] {
  const items: ArtworkGridItem[] = [];
  const seen = new Set<string>();

  for (const artwork of input.archivedWorks) {
    const key = artworkKey(artwork.contractAddress, artwork.tokenId);
    seen.add(key);
    items.push(toArchivedGridItem(artwork));
  }

  for (const artwork of input.discoveredArchivedWorks) {
    const key = artworkKey(artwork.contractAddress, artwork.tokenId);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(toArchivedGridItem(artwork));
  }

  for (const work of input.discoveryWorks) {
    const key = artworkKey(work.contractAddress, work.tokenId);
    if (seen.has(key) || input.archivedByKey.has(key)) continue;
    seen.add(key);
    items.push(toDiscoveredGridItem(work));
  }

  return items;
}

function emptyMessages(totalIndexedWorks: number, query: string) {
  if (totalIndexedWorks === 0 && !query) {
    return {
      title: "The archive is empty",
      body: "Nothing has been saved yet. Works will appear here as they're found and saved.",
    };
  }
  return {
    title: "No matches",
    body: "Try a different artist name, title, or a Foundation link. If something's missing, submit it and we'll save it.",
  };
}

function isArchivedPreservedItem(item: ArtworkGridItem) {
  if (item.lookupSource !== "ARCHIVED") return false;
  return Boolean(item.metadataCid ?? item.mediaCid);
}

function isLiveOnlyItem(item: ArtworkGridItem) {
  return item.lookupSource === "FOUNDATION_LIVE";
}

function computeItemSummary(
  items: ArtworkGridItem[],
  status: ArchiveStatusFilter,
  media: ArchiveMediaFilter,
) {
  const filteredItems = items.filter((item) =>
    archiveItemMatchesFilters(item, status, media),
  );
  return {
    filteredItems,
    archivedShown: filteredItems.filter(isArchivedPreservedItem).length,
    liveOnlyShown: filteredItems.filter(isLiveOnlyItem).length,
  };
}

type ArchiveFilterInput = {
  query: string;
  status: ArchiveStatusFilter;
  media: ArchiveMediaFilter;
};

function hasExplicitFilterInput(input: ArchiveFilterInput) {
  return Boolean(
    input.query || input.status !== "all" || input.media !== "all",
  );
}

async function parseSearchParams(
  props: ArchivePageProps,
): Promise<ParsedArchiveSearchParams> {
  return parseArchiveSearchParams(await props.searchParams);
}

type CountsInput = {
  params: ParsedArchiveSearchParams;
  hasFilter: boolean;
};

async function loadArchiveCounts({ params, hasFilter }: CountsInput) {
  const filterCountPromise = hasFilter
    ? db.artwork.count({
        where: buildArchivedWhere(params.query, params.status, params.media),
      })
    : Promise.resolve(0);

  return Promise.all([
    loadArchivedWorks({
      query: params.query,
      sort: params.sort,
      status: params.status,
      media: params.media,
      encodedCursor: params.cursor,
    }),
    db.artwork.count({
      where: {
        OR: [{ metadataRootId: { not: null } }, { mediaRootId: { not: null } }],
      },
    }),
    db.queueJob.count({
      where: {
        status: "PENDING",
        priority: { gte: PUBLIC_QUEUE_PRIORITY },
      },
    }),
    getArchiveLiveSnapshot(db),
    filterCountPromise,
  ]);
}

async function loadDiscoveredArchivedByKey(
  query: string,
  works: FoundationLookupWork[],
) {
  const rows = query ? await loadArchivedMatchesForWorks(works) : [];
  const byKey = new Map(
    rows.map((artwork) => [
      artworkKey(artwork.contractAddress, artwork.tokenId),
      artwork,
    ]),
  );
  return { rows, byKey };
}

export default async function ArchivePage(props: ArchivePageProps) {
  const params = await parseSearchParams(props);
  const discovery = await runDiscovery(params.query);

  if (params.query && discovery.works.length > 0) {
    await persistDiscoveredFoundationWorks(db, discovery.works, {
      indexedFrom: "foundation-search",
    });
  }

  const hasFilter = hasExplicitFilterInput(params);
  const [
    archivedRows,
    totalIndexedWorks,
    publicQueueCount,
    liveSnapshot,
    archivedMatchCount,
  ] = await loadArchiveCounts({ params, hasFilter });

  const archivedWorks = archivedRows.slice(0, ARCHIVE_PAGE_SIZE);
  const nextCursor = computeNextCursor(archivedRows, params.sort);
  const matchingArchivedWorks = hasFilter
    ? archivedMatchCount
    : totalIndexedWorks;

  const { rows: discoveredArchivedWorks, byKey: archivedByKey } =
    await loadDiscoveredArchivedByKey(params.query, discovery.works);

  const rawItems = mergeGridItems({
    archivedWorks,
    discoveredArchivedWorks,
    discoveryWorks: discovery.works,
    archivedByKey,
  });
  const items = await attachMarketStateToGridItems(db, rawItems);
  const { filteredItems, archivedShown, liveOnlyShown } = computeItemSummary(
    items,
    params.status,
    params.media,
  );

  const profileItems = buildProfileArchiveItems(
    discovery.profiles,
    discovery.works,
    archivedByKey,
  );

  const { title: emptyTitle, body: emptyBody } = emptyMessages(
    totalIndexedWorks,
    params.query,
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <ArchiveStickyHeader
        query={params.query}
        sort={params.sort}
        status={params.status}
        media={params.media}
        totalIndexedWorks={totalIndexedWorks}
        publicQueueCount={publicQueueCount}
        archivedShown={archivedShown}
        liveOnlyShown={liveOnlyShown}
        profileCount={profileItems.length}
      />

      <ArchiveInfoDetails />

      {profileItems.length > 0 ? (
        <FadeUp inView className="mt-6 block">
          <ProfileArchiveCards profiles={profileItems} />
        </FadeUp>
      ) : null}

      <section aria-label="Live archive activity" className="mt-8">
        <ArchiveLiveBoard
          initialSnapshot={liveSnapshot}
          title="Archive activity"
          subtitle="See works being found and saved as it happens."
          compact
          hideFeed
          showCrawler={false}
        />
      </section>

      <section className="mt-8">
        <ArchiveBrowser
          items={filteredItems}
          emptyTitle={emptyTitle}
          emptyBody={emptyBody}
          query={params.query}
          status={params.status}
          media={params.media}
          sort={params.sort}
          nextCursor={nextCursor}
          hasCursor={Boolean(params.cursor)}
          matchingArchivedWorks={matchingArchivedWorks}
          unfilteredRenderedCount={items.length}
          pageSize={ARCHIVE_PAGE_SIZE}
          hasLiveMatches={liveOnlyShown > 0}
        />
      </section>
    </main>
  );
}
