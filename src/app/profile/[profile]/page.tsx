import type { Metadata } from "next";

import { ArtworkGrid } from "~/app/_components/artwork-grid";
import {
  attachMarketStateToGridItems,
  summarizeProfileMarketState,
} from "~/server/archive/foundation-market";
import { persistDiscoveredFoundationWorks } from "~/server/archive/jobs";
import { db } from "~/server/db";

import {
  computeArtistCounts,
  enrichProfileFromWorks,
  fetchFoundationArtistPage,
  foundationUrlFor,
  hasMoreFoundationPages,
  hydrateProfileFromFoundation,
  loadArchivedArtistPage,
  mergeArchivedAndFoundation,
  normalizeProfileView,
  resolveArchivedRowsForWorks,
  resolveProfileFromKey,
} from "./_data";
import { ProfileBrowser } from "./_browser";
import { ProfileLiveShell } from "./_live-shell";
import { ProfileHeader, ViewTabs } from "./_presentational";
import { type ProfilePageProps } from "./_types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: ProfilePageProps): Promise<Metadata> {
  const { profile } = await params;
  const key = decodeURIComponent(profile).trim();
  try {
    const resolved = await resolveProfileFromKey(key);
    const displayName =
      resolved.name ??
      (resolved.username ? `@${resolved.username}` : resolved.accountAddress);
    const title = `${displayName} · Agorix`;
    const description = `Works by ${displayName} saved in Agorix's Foundation archive.`;
    const image = resolved.profileImageUrl ?? undefined;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "profile",
        images: image ? [{ url: image, alt: displayName }] : undefined,
      },
      twitter: {
        card: image ? "summary" : "summary",
        title,
        description,
        images: image ? [image] : undefined,
      },
    };
  } catch {
    return { title: "Artist · Agorix" };
  }
}

export default async function ProfilePage({
  params,
  searchParams,
}: ProfilePageProps) {
  const { profile } = await params;
  const { view = "all" } = await searchParams;
  const key = decodeURIComponent(profile).trim();
  const activeView = normalizeProfileView(view);

  const initialProfile = await resolveProfileFromKey(key);

  const foundationPage = await fetchFoundationArtistPage(
    initialProfile.accountAddress,
    0,
  ).catch(() => ({
    items: [],
    page: 0,
    totalItems: 0,
    rawItemCount: 0,
  }));

  if (foundationPage.items.length > 0) {
    await persistDiscoveredFoundationWorks(db, foundationPage.items, {
      indexedFrom: "foundation-profile",
    });
  }

  let resolved = enrichProfileFromWorks(initialProfile, foundationPage.items);
  resolved = await hydrateProfileFromFoundation(resolved);

  const archivedByKey = await resolveArchivedRowsForWorks(
    resolved,
    foundationPage.items,
  );

  const archivedPage = await loadArchivedArtistPage({
    accountAddress: resolved.accountAddress,
    username: resolved.username,
    view: activeView,
    encodedCursor: null,
  });

  const { items: mergedItems, seenKeys } = mergeArchivedAndFoundation({
    view: activeView,
    archivedRows: archivedPage.rows,
    foundationWorks: foundationPage.items,
    archivedByKey,
  });

  const counts = await computeArtistCounts({
    accountAddress: resolved.accountAddress,
    username: resolved.username,
    foundationTotal: foundationPage.totalItems,
  });

  const foundationExhausted = !hasMoreFoundationPages(
    foundationPage.page,
    foundationPage.totalItems,
    foundationPage.rawItemCount,
  );

  const [enrichedItems, marketSummary] = await Promise.all([
    attachMarketStateToGridItems(db, mergedItems).catch(() => mergedItems),
    summarizeProfileMarketState(db, mergedItems).catch(() => ({
      listedCount: 0,
      rescuableCount: 0,
    })),
  ]);

  const foundationUrl = foundationUrlFor(resolved);

  return (
    <ProfileLiveShell
      accountAddress={resolved.accountAddress}
      username={resolved.username}
    >
      <main className="mx-auto w-full max-w-6xl px-6 pt-14 pb-20">
        <ProfileHeader
          resolved={resolved}
          counts={counts}
          foundationUrl={foundationUrl}
          marketSummary={marketSummary}
        />
        <ViewTabs profile={profile} view={activeView} counts={counts} />
        <section className="mt-10">
          <ProfileBrowser
            profile={profile}
            view={activeView}
            initialItems={enrichedItems}
            initialSeenKeys={Array.from(seenKeys)}
            initialCursor={{
              dbCursor: archivedPage.nextCursor,
              foundationPage: foundationPage.page + 1,
              foundationExhausted,
            }}
            emptyFallback={
              <ArtworkGrid
                items={[]}
                emptyTitle="Nothing in this slice yet"
                emptyBody="As works are found or move through the archive, they'll appear here automatically."
              />
            }
          />
        </section>
      </main>
    </ProfileLiveShell>
  );
}
