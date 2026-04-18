import Link from "next/link";
import { ArrowRight, Search, Sparkles } from "lucide-react";

import { ArchiveLiveBoard } from "~/app/_components/archive-live-board";
import { ArtworkGrid, type ArtworkGridItem } from "~/app/_components/artwork-grid";
import { CountUp, FadeUp, WordReveal } from "~/app/_components/motion";
import { SearchShortcutHint } from "~/app/_components/search-shortcut-hint";
import { getArchiveLiveSnapshot } from "~/server/archive/dashboard";
import { buildArchivePublicPath } from "~/server/archive/ipfs";
import { db } from "~/server/db";

type HomeArtwork = Awaited<ReturnType<typeof db.artwork.findMany>>[number] & {
  metadataRoot: {
    cid: string;
    relativePath: string | null;
    gatewayUrl: string | null;
  } | null;
  mediaRoot: {
    cid: string;
    relativePath: string | null;
    gatewayUrl: string | null;
  } | null;
};

function archiveMediaUrlOf(artwork: HomeArtwork) {
  const isCaptured =
    artwork.mediaStatus === "DOWNLOADED" || artwork.mediaStatus === "PINNED";
  if (!artwork.mediaRoot || !isCaptured) return null;
  return buildArchivePublicPath(
    artwork.mediaRoot.cid,
    artwork.mediaRoot.relativePath,
  );
}

function posterUrlOf(artwork: HomeArtwork, archiveMediaUrl: string | null) {
  const imageFallback =
    artwork.mediaKind === "IMAGE"
      ? (archiveMediaUrl ?? artwork.sourceUrl)
      : null;
  return artwork.staticPreviewUrl ?? artwork.previewUrl ?? imageFallback;
}

function mediaUrlOf(artwork: HomeArtwork, archiveMediaUrl: string | null) {
  const imageFallback =
    artwork.mediaKind === "IMAGE" ? artwork.sourceUrl : null;
  return archiveMediaUrl ?? artwork.previewUrl ?? imageFallback;
}

function toGridItem(artwork: HomeArtwork) {
  const archiveMediaUrl = archiveMediaUrlOf(artwork);
  return {
    id: artwork.id,
    slug: artwork.slug,
    chainId: artwork.chainId,
    title: artwork.title,
    artistName: artwork.artistName,
    artistUsername: artwork.artistUsername,
    collectionName: artwork.collectionName,
    tokenId: artwork.tokenId,
    contractAddress: artwork.contractAddress,
    foundationContractType: artwork.foundationContractType,
    mediaKind: artwork.mediaKind,
    metadataStatus: artwork.metadataStatus,
    mediaStatus: artwork.mediaStatus,
    posterUrl: posterUrlOf(artwork, archiveMediaUrl),
    mediaUrl: mediaUrlOf(artwork, archiveMediaUrl),
    foundationUrl: artwork.foundationUrl,
    archiveMediaUrl,
    publicGatewayUrl: artwork.mediaRoot?.gatewayUrl ?? null,
    metadataCid: artwork.metadataRoot?.cid ?? null,
    mediaCid: artwork.mediaRoot?.cid ?? null,
    lookupSource: "ARCHIVED",
  } satisfies ArtworkGridItem;
}

function HeroIntro() {
  return (
    <>
      <FadeUp delay={0} duration={0.4}>
        <p className="flex items-center gap-3 font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
          <span
            aria-hidden
            className="inline-block h-px w-8 bg-[var(--color-line-strong)]"
          />
          Est. 2025 — Independent preservation
        </p>
      </FadeUp>

      <WordReveal
        as="h1"
        text={"A preservation archive\nfor Foundation artists."}
        className="mt-4 font-serif text-4xl leading-[1.05] tracking-tight text-[var(--color-ink)] sm:text-6xl"
        delay={0.1}
      />

      <FadeUp delay={0.5} duration={0.6}>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-body)] sm:text-lg">
          We automatically find and save Foundation artwork so it stays online,
          even if the original hosts go away. Search what&apos;s been saved, or
          submit a work to be saved.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)] sm:text-base">
          Artists and collectors can also run our desktop app to keep an extra
          copy on their own computer — an optional way to help back up work you
          care about.
        </p>
      </FadeUp>
    </>
  );
}

function HeroSearch() {
  return (
    <FadeUp delay={0.62} duration={0.6}>
      <form
        action="/archive"
        role="search"
        aria-label="Search the archive"
        className="mt-6 flex max-w-2xl items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2.5 focus-within:border-[var(--color-ink)] sm:mt-8 sm:px-5 sm:py-3"
      >
        <Search
          aria-hidden
          className="h-4 w-4 shrink-0 text-[var(--color-subtle)]"
        />
        <label className="sr-only" htmlFor="home-search">
          Search by artist, title, or Foundation link
        </label>
        <input
          id="home-search"
          name="q"
          placeholder="Try an artist's name, title, or paste a Foundation link"
          className="h-7 min-w-0 flex-1 bg-transparent text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-subtle)] sm:text-[0.95rem]"
        />
        <SearchShortcutHint />
        <button
          type="submit"
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-3.5 py-1.5 text-sm text-[var(--color-bg)] hover:opacity-90 sm:px-4"
        >
          <span className="hidden sm:inline">Search</span>
          <ArrowRight aria-hidden className="arrow-slide h-3.5 w-3.5" />
        </button>
      </form>
    </FadeUp>
  );
}

function HeroStats({
  artworkCount,
  pinnedRootCount,
  pendingJobCount,
}: {
  artworkCount: number;
  pinnedRootCount: number;
  pendingJobCount: number;
}) {
  return (
    <FadeUp delay={0.75} duration={0.5}>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[0.7rem] uppercase tracking-[0.22em] text-[var(--color-muted)]">
        <span
          className="inline-flex items-center gap-2"
          title="Works we know about and are saving."
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]"
          />
          <CountUp value={artworkCount} /> work
          {artworkCount === 1 ? "" : "s"} tracked
        </span>
        <span
          className="inline-flex items-center gap-2"
          title="Files fully saved to the archive."
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-info)]"
          />
          <CountUp value={pinnedRootCount} /> file
          {pinnedRootCount === 1 ? "" : "s"} saved
        </span>
        {pendingJobCount > 0 ? (
          <span
            className="inline-flex items-center gap-2"
            title="Works waiting in line to be saved."
          >
            <span
              aria-hidden
              className="dot-pulse h-1.5 w-1.5 rounded-full bg-[var(--color-warn)]"
            />
            <CountUp value={pendingJobCount} /> in line
          </span>
        ) : null}
      </div>
    </FadeUp>
  );
}

function RecentSection({ items }: { items: ArtworkGridItem[] }) {
  return (
    <section className="mt-12 pb-16 sm:mt-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FadeUp inView>
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
            Recent additions
          </p>
          <h2 className="mt-1.5 flex items-center gap-2 font-serif text-2xl text-[var(--color-ink)] sm:text-3xl">
            <Sparkles
              aria-hidden
              className="h-5 w-5 text-[var(--color-subtle)]"
            />
            Recently saved
          </h2>
        </FadeUp>
        <Link
          href="/archive"
          className="group inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        >
          <span className="link-editorial">Browse archive</span>
          <ArrowRight aria-hidden className="arrow-slide h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-8">
        <ArtworkGrid
          items={items}
          emptyTitle="Nothing saved yet"
          emptyBody="The first saved works will show up here."
        />
      </div>
    </section>
  );
}

async function loadHomeData() {
  const [artworkCount, pinnedRootCount, pendingJobCount, recentArtworks, liveSnapshot] =
    await Promise.all([
      db.artwork.count({
        where: {
          OR: [{ metadataRootId: { not: null } }, { mediaRootId: { not: null } }],
        },
      }),
      db.ipfsRoot.count({
        where: {
          OR: [{ pinStatus: "PINNED" }, { backupStatus: "DOWNLOADED" }],
        },
      }),
      db.queueJob.count({ where: { status: "PENDING" } }),
      db.artwork.findMany({
        where: {
          OR: [{ metadataRootId: { not: null } }, { mediaRootId: { not: null } }],
        },
        take: 12,
        orderBy: [{ lastIndexedAt: "desc" }, { updatedAt: "desc" }],
        include: { metadataRoot: true, mediaRoot: true },
      }),
      getArchiveLiveSnapshot(db),
    ]);
  return {
    artworkCount,
    pinnedRootCount,
    pendingJobCount,
    recentArtworks,
    liveSnapshot,
  };
}

export default async function HomePage() {
  const {
    artworkCount,
    pinnedRootCount,
    pendingJobCount,
    recentArtworks,
    liveSnapshot,
  } = await loadHomeData();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <section className="pt-10 pb-8 sm:pt-16 sm:pb-12">
        <HeroIntro />
        <HeroSearch />
        <HeroStats
          artworkCount={artworkCount}
          pinnedRootCount={pinnedRootCount}
          pendingJobCount={pendingJobCount}
        />
      </section>

      <section
        aria-label="Live archive activity"
        className="border-t border-[var(--color-line)] pt-8 sm:pt-10"
      >
        <ArchiveLiveBoard
          initialSnapshot={liveSnapshot}
          title="Archive activity"
          subtitle="See works being found and saved as it happens."
          compact
          hideFeed
          showCrawler={false}
        />
      </section>

      <RecentSection
        items={recentArtworks.map((artwork) => toGridItem(artwork))}
      />
    </main>
  );
}
