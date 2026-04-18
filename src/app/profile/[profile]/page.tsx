import type { Metadata } from "next";

import { ArtworkGrid } from "~/app/_components/artwork-grid";
import { fetchAllFoundationWorksByCreator } from "~/server/archive/foundation-api";
import { persistDiscoveredFoundationWorks } from "~/server/archive/jobs";
import { db } from "~/server/db";

import {
  enrichProfileFromArchived,
  enrichProfileFromWorks,
  foundationUrlFor,
  hydrateProfileFromFoundation,
  loadArchivedProfileWorks,
  normalizeProfileView,
  partitionWorksByArchiveState,
  resolveProfileFromKey,
  selectVisibleItems,
} from "./_data";
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
  const works = await fetchAllFoundationWorksByCreator(
    initialProfile.accountAddress,
    24,
    24,
  );

  await persistDiscoveredFoundationWorks(db, works, {
    indexedFrom: "foundation-profile",
  });

  let resolved = enrichProfileFromWorks(initialProfile, works);
  let archivedWorks = await loadArchivedProfileWorks(resolved);
  resolved = enrichProfileFromArchived(resolved, archivedWorks);

  const hydratedProfile = await hydrateProfileFromFoundation(resolved);
  if ((hydratedProfile.username ?? null) !== (resolved.username ?? null)) {
    archivedWorks = await loadArchivedProfileWorks(hydratedProfile);
    resolved = enrichProfileFromArchived(hydratedProfile, archivedWorks);
  } else {
    resolved = hydratedProfile;
  }

  const partitioned = partitionWorksByArchiveState(works, archivedWorks);
  const items = selectVisibleItems(activeView, partitioned.items);
  const foundationUrl = foundationUrlFor(resolved);

  return (
    <ProfileLiveShell
      accountAddress={resolved.accountAddress}
      username={resolved.username}
    >
      <main className="mx-auto w-full max-w-6xl px-6 pt-14 pb-20">
        <ProfileHeader
          resolved={resolved}
          counts={partitioned.counts}
          foundationUrl={foundationUrl}
        />
        <ViewTabs
          profile={profile}
          view={activeView}
          counts={partitioned.counts}
        />
        <section className="mt-10">
          <ArtworkGrid
            items={items}
            emptyTitle="Nothing in this slice yet"
            emptyBody="As works are found or move through the archive, they'll appear here automatically."
          />
        </section>
      </main>
    </ProfileLiveShell>
  );
}
