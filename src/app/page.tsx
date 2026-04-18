import Link from "next/link";
import {
  ArrowRight,
  Globe,
  Heart,
  Leaf,
  Search,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";

import { ArchiveLiveBoard } from "~/app/_components/archive-live-board";
import { ArtworkGrid, type ArtworkGridItem } from "~/app/_components/artwork-grid";
import {
  BracketFrame,
  CaptionTag,
  FeaturePanel,
  ThemedImage,
} from "~/app/_components/brand";
import { CountUp, FadeUp, Stagger, WordReveal } from "~/app/_components/motion";
import { SearchShortcutHint } from "~/app/_components/search-shortcut-hint";
import type { ArchiveLiveSnapshot } from "~/lib/archive-live";
import { getArchiveLiveSnapshot } from "~/server/archive/dashboard";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

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

function emptyArchiveLiveSnapshot(): ArchiveLiveSnapshot {
  return {
    stats: {
      artworks: 0,
      contracts: 0,
      pendingJobs: 0,
      runningJobs: 0,
      failedJobs: 0,
      preservedRoots: 0,
      downloadedRoots: 0,
      pinnedRoots: 0,
      deferredRoots: 0,
    },
    worker: null,
    policy: null,
    crawlers: [],
    latestArchived: [],
    recentEvents: [],
  };
}

function isTransientDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    cause?: unknown;
  };
  const code = typeof candidate.code === "string" ? candidate.code : null;
  const message =
    typeof candidate.message === "string"
      ? candidate.message.toLowerCase()
      : "";

  if (code === "57P03") {
    return true;
  }

  if (
    message.includes("database system is in recovery mode") ||
    message.includes("the database is unavailable") ||
    message.includes("can't reach database server") ||
    message.includes("can't reach database") ||
    message.includes("connection refused")
  ) {
    return true;
  }

  return isTransientDatabaseError(candidate.cause);
}

function archiveMediaUrlOf(artwork: HomeArtwork) {
  const isCaptured =
    artwork.mediaStatus === "DOWNLOADED" || artwork.mediaStatus === "PINNED";
  if (!artwork.mediaRoot || !isCaptured) return null;
  return artwork.mediaRoot.gatewayUrl;
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
          Agorix · Foundation archive response
        </p>
      </FadeUp>

      <WordReveal
        as="h1"
        text={"Agorix is building\na Foundation archive."}
        highlight="Agorix"
        className="mt-4 font-serif text-4xl leading-[1.05] tracking-tight text-[var(--color-ink)] sm:text-6xl"
        delay={0.1}
      />

      <FadeUp delay={0.5} duration={0.6}>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-body)] sm:text-lg">
          Recent news made the risk plain, so Agorix is running this public
          Foundation archive to automatically find and save artwork before more
          of it slips away. Search what&apos;s been saved, or submit a work to be
          saved.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)] sm:text-base">
          Artists and collectors can also run our desktop app to keep an extra
          copy on their own computer. It&apos;s an optional way to help back up
          work they care about while the broader Agorix network takes shape.
        </p>
      </FadeUp>
    </>
  );
}

function HeroArt() {
  return (
    <FadeUp delay={0.4} duration={0.6}>
      <BracketFrame padding="lg" className="ml-auto w-full max-w-md">
        <ThemedImage
          light="/image_1_light.png"
          dark="/image_1_dark.png"
          alt="Agorix study: overlapping squares with a crescent of light"
          width={620}
          height={620}
          className="h-auto w-full rounded-md"
          sizes="(min-width: 1024px) 440px, 80vw"
          priority
        />
        <div className="mt-4 flex items-end justify-between gap-3">
          <CaptionTag
            entries={[
              { label: "Artist", value: "ravonus.eth" },
              { label: "Title", value: "Signal Study" },
              { label: "Cid", value: "bafyb…c0f1" },
            ]}
          />
          <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-[var(--color-brand-green)]">
            Preserved
          </span>
        </div>
      </BracketFrame>
    </FadeUp>
  );
}

const HOME_FEATURES = [
  {
    eyebrow: "Protected",
    title: "Smart protection",
    body: "Content-addressed storage with continuous integrity checks so saved work doesn't drift.",
    icon: <Shield aria-hidden className="h-5 w-5" />,
  },
  {
    eyebrow: "Fast",
    title: "Blazing fast",
    body: "Optimized systems deliver performance across regions and gateways without interruption.",
    icon: <Zap aria-hidden className="h-5 w-5" />,
  },
  {
    eyebrow: "Growing",
    title: "Always growing",
    body: "New features and continuous improvements built to evolve alongside artists.",
    icon: <Leaf aria-hidden className="h-5 w-5" />,
  },
  {
    eyebrow: "Trusted",
    title: "More than a service. A community.",
    body: "We believe in lasting relationships between artists, developers, and the people saving their work.",
    icon: <Heart aria-hidden className="h-5 w-5" />,
    tone: "ink" as const,
  },
  {
    eyebrow: "Always online",
    title: "Reliable uptime",
    body: "Reliable uptime keeps your community running through outages and platform handoffs.",
    icon: <Globe aria-hidden className="h-5 w-5" />,
    tone: "ink" as const,
  },
  {
    eyebrow: "Powerful",
    title: "Made for communities",
    body: "Powerful tools to connect, manage, and grow together. Preservation as shared infrastructure.",
    icon: <Sparkles aria-hidden className="h-5 w-5" />,
    tone: "ink" as const,
  },
];

function FeatureGridSection() {
  return (
    <section className="mt-14 sm:mt-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FadeUp inView>
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
            Built for people. Powered by purpose.
          </p>
          <h2 className="mt-1.5 font-serif text-2xl leading-tight text-[var(--color-ink)] sm:text-3xl">
            More than a service. A community.
          </h2>
        </FadeUp>
        <Link
          href="/decentralization"
          className="group inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        >
          <span className="link-editorial">See the full plan</span>
          <ArrowRight aria-hidden className="arrow-slide h-3.5 w-3.5" />
        </Link>
      </div>

      <Stagger className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {HOME_FEATURES.map((f) => (
          <FeaturePanel
            key={f.title}
            eyebrow={f.eyebrow}
            title={f.title}
            body={f.body}
            icon={f.icon}
            tone={f.tone ?? "paper"}
          />
        ))}
      </Stagger>
    </section>
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
  try {
    const [
      artworkCount,
      pinnedRootCount,
      pendingJobCount,
      recentArtworks,
      liveSnapshot,
    ] = await Promise.all([
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
      degraded: false,
    };
  } catch (error) {
    if (!isTransientDatabaseError(error)) {
      throw error;
    }

    console.error("Home page data unavailable, rendering fallback state.", error);

    return {
      artworkCount: 0,
      pinnedRootCount: 0,
      pendingJobCount: 0,
      recentArtworks: [] as HomeArtwork[],
      liveSnapshot: emptyArchiveLiveSnapshot(),
      degraded: true,
    };
  }
}

export default async function HomePage() {
  const {
    artworkCount,
    pinnedRootCount,
    pendingJobCount,
    recentArtworks,
    liveSnapshot,
    degraded,
  } = await loadHomeData();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <section className="pt-10 pb-8 sm:pt-16 sm:pb-12">
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <HeroIntro />
            {degraded ? (
              <FadeUp delay={0.56} duration={0.45}>
                <div className="mt-4 max-w-2xl rounded-2xl border border-[var(--color-warn)]/30 bg-[var(--tint-warn)] px-4 py-3 text-sm text-[var(--color-body)]">
                  Live archive data is temporarily unavailable while the
                  database reconnects. The page should recover automatically in
                  a moment.
                </div>
              </FadeUp>
            ) : null}
            <HeroSearch />
            <HeroStats
              artworkCount={artworkCount}
              pinnedRootCount={pinnedRootCount}
              pendingJobCount={pendingJobCount}
            />
          </div>
          <div className="hidden lg:block">
            <HeroArt />
          </div>
        </div>
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

      <FeatureGridSection />

      <RecentSection
        items={recentArtworks.map((artwork) => toGridItem(artwork))}
      />
    </main>
  );
}
