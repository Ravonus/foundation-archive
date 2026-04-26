import type { Metadata } from "next";

import { ArtworkGrid } from "~/app/_components/artwork-grid";
import {
  attachMarketStateToGridItems,
  summarizeProfileMarketState,
} from "~/server/archive/foundation-market";
import { db } from "~/server/db";

import {
  computeArtistCounts,
  foundationUrlFor,
  hydrateProfileFromCache,
  loadArchivedArtistPage,
  mergeArchivedAndFoundation,
  normalizeProfileView,
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
    const handle = resolved.username ? `@${resolved.username}` : null;
    const title = `${displayName}${handle ? ` (${handle})` : ""} on Agorix · Foundation archive`;
    const bioPart = resolved.bio?.trim();
    const baseDescription = bioPart
      ? `${bioPart} · Preserved in Agorix, a public Foundation archive.`
      : `Works by ${displayName}${handle ? ` (${handle})` : ""} preserved in Agorix — a public, IPFS-backed Foundation archive.`;
    const description =
      baseDescription.length > 155
        ? `${baseDescription.slice(0, 154).trimEnd()}…`
        : baseDescription;

    // og:image / twitter:image come from `opengraph-image.tsx` — a
    // dynamically generated PNG composed server-side + cached.
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        // Next's route-level `openGraph` replaces the layout block
        // entirely, so re-declare `siteName` here — otherwise Discord
        // drops the "Agorix" label above the unfurled card.
        siteName: "Agorix",
        type: "profile",
        url: `/profile/${encodeURIComponent(key)}`,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
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
  const resolved = await hydrateProfileFromCache(initialProfile);

  const archivedPage = await loadArchivedArtistPage({
    accountAddress: resolved.accountAddress,
    username: resolved.username,
    view: activeView,
    encodedCursor: null,
  });

  const { items: mergedItems, seenKeys } = mergeArchivedAndFoundation({
    view: activeView,
    archivedRows: archivedPage.rows,
    foundationWorks: [],
    archivedByKey: new Map(),
  });

  const counts = await computeArtistCounts({
    accountAddress: resolved.accountAddress,
    username: resolved.username,
  });

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
              foundationPage: 0,
              foundationExhausted: true,
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
