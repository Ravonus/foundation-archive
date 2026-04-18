import type { Metadata } from "next";

import { ArtworkGrid } from "~/app/_components/artwork-grid";
import { fetchAllFoundationWorksByCreator } from "~/server/archive/foundation-api";
import { persistDiscoveredFoundationWorks } from "~/server/archive/jobs";
import { db } from "~/server/db";

import {
  enrichProfileFromWorks,
  foundationUrlFor,
  partitionWorksByArchiveState,
  resolveProfileFromKey,
  selectVisibleItems,
} from "./_data";
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
    const title = `${displayName} · Foundation Archive`;
    const description = `Works by ${displayName} saved to the Foundation Archive.`;
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
    return { title: "Artist · Foundation Archive" };
  }
}

export default async function ProfilePage({
  params,
  searchParams,
}: ProfilePageProps) {
  const { profile } = await params;
  const { view = "all" } = await searchParams;
  const key = decodeURIComponent(profile).trim();

  const initialProfile = await resolveProfileFromKey(key);

  const works = await fetchAllFoundationWorksByCreator(
    initialProfile.accountAddress,
    24,
    24,
  );
  await persistDiscoveredFoundationWorks(db, works, {
    indexedFrom: "foundation-profile",
  });

  const resolved = enrichProfileFromWorks(initialProfile, works);
  const partitioned = await partitionWorksByArchiveState(works);
  const items = selectVisibleItems(view, partitioned);
  const foundationUrl = foundationUrlFor(resolved);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pt-14 pb-20">
      <ProfileHeader
        resolved={resolved}
        worksCount={works.length}
        onServerCount={partitioned.onServerItems.length}
        missingCount={partitioned.missingItems.length}
        foundationUrl={foundationUrl}
      />
      <ViewTabs
        profile={profile}
        view={view}
        worksCount={works.length}
        onServerCount={partitioned.onServerItems.length}
        missingCount={partitioned.missingItems.length}
      />
      <section className="mt-10">
        <ArtworkGrid
          items={items}
          emptyTitle="Nothing in this filter yet"
          emptyBody="Works will appear here as they're saved."
        />
      </section>
    </main>
  );
}
