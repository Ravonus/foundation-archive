/* eslint-disable max-lines */
import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check } from "lucide-react";

import { ModelMediaPreview } from "~/app/_components/model-media-preview";
import { DesktopSharePanel as ArtworkDesktopSharePanel } from "~/app/_components/desktop-share-panel";
import { ShareLinkButton } from "~/app/_components/share-link-button";
import { BlurImage, FadeUp } from "~/app/_components/motion";
import { ProfileHero } from "~/app/_components/profile/profile-hero";
import { ArtworkActionsPanelShell } from "~/app/_components/web3/artwork-actions-panel-shell";
import { fetchFoundationUserByUsername } from "~/server/archive/foundation-api";
import {
  chainExplorerAddressUrl,
  chainLabel,
} from "~/lib/chain-label";
import { formatDate, shortAddress } from "~/lib/utils";
import {
  readDependencyManifest,
  resolveArchivedLocalUrl,
} from "~/server/archive/dependencies";
import {
  getTokenMarketState,
  listTokenMarketHistory,
} from "~/server/archive/foundation-market";
import { buildArchivePublicPath } from "~/server/archive/ipfs";
import { db } from "~/server/db";
import { type Prisma } from "~/server/prisma-client";

import { MarketHistoryList } from "./_market-history";
import { RetrySaveButton } from "./_retry-save-button";
import {
  TechnicalDetails,
  type DependencyFlowCard,
  type RootCardItem,
} from "./_technical-details";

export const dynamic = "force-dynamic";

type ArtworkDetailPageProps = {
  params: Promise<{ slug: string }>;
};

type MetadataArtwork = {
  title: string;
  description: string | null;
  artistName: string | null;
  artistUsername: string | null;
  collectionName: string | null;
  staticPreviewUrl: string | null;
  previewUrl: string | null;
  mediaKind: string;
  mediaStatus: string;
  sourceUrl: string | null;
  mediaRoot: {
    cid: string;
    relativePath: string | null;
  } | null;
};

function metadataArtistLabel(artwork: MetadataArtwork) {
  return (
    artwork.artistName ??
    (artwork.artistUsername ? `@${artwork.artistUsername}` : "Unknown artist")
  );
}

function metadataDescription(artwork: MetadataArtwork) {
  return (
    artwork.description ??
    `Preserved by Agorix's Foundation archive. ${artwork.collectionName ? `Part of ${artwork.collectionName}. ` : ""}A free, open archive of Foundation artists' work.`
  );
}

async function metadataImageUrl(artwork: MetadataArtwork) {
  const localMediaUrl =
    artwork.mediaRoot && isLocalStatus(artwork.mediaStatus)
      ? buildArchivePublicPath(
          artwork.mediaRoot.cid,
          artwork.mediaRoot.relativePath,
        )
      : null;
  const localPreviewUrl = await resolveArchivedLocalUrl([
    artwork.staticPreviewUrl,
    artwork.previewUrl,
  ]);

  return artwork.mediaKind === "IMAGE"
    ? (localMediaUrl ?? localPreviewUrl)
    : localPreviewUrl;
}

export async function generateMetadata(
  props: ArtworkDetailPageProps,
): Promise<Metadata> {
  const { slug } = await props.params;
  const artwork = await db.artwork.findFirst({
    where: { slug },
    select: {
      title: true,
      description: true,
      artistName: true,
      artistUsername: true,
      collectionName: true,
      staticPreviewUrl: true,
      previewUrl: true,
      mediaKind: true,
      mediaStatus: true,
      sourceUrl: true,
      mediaRoot: {
        select: {
          cid: true,
          relativePath: true,
        },
      },
    },
  });

  if (!artwork) {
    return { title: "Not found · Agorix" };
  }

  const artistLabel = metadataArtistLabel(artwork);
  const collection = artwork.collectionName ? ` from ${artwork.collectionName}` : "";
  const ogTitle = `${artwork.title} by ${artistLabel}${collection} — preserved on Agorix`;
  const rawDescription = metadataDescription(artwork);
  const extended = `${rawDescription} · Preserved on Agorix, a public Foundation archive.`;
  const description =
    extended.length > 155 ? `${extended.slice(0, 154).trimEnd()}…` : extended;

  // og:image / twitter:image come from `opengraph-image.tsx` — a
  // dynamically generated PNG composed server-side + cached.
  return {
    title: `${ogTitle} · Agorix`,
    description,
    openGraph: {
      title: ogTitle,
      description,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
    },
  };
}

type Health = "preserved" | "partial" | "pending" | "failed" | "missing";

type ArtworkWithRelations = Prisma.ArtworkGetPayload<{
  include: {
    contract: true;
    metadataRoot: true;
    mediaRoot: true;
    backups: true;
  };
}>;

type IpfsRoot = NonNullable<ArtworkWithRelations["metadataRoot"]>;

type DerivedView = {
  browserMediaUrl: string | null;
  localMediaUrl: string | null;
  localMetadataUrl: string | null;
  localPreviewUrl: string | null;
  gatewayMediaUrl: string | null;
  gatewayMetadataUrl: string | null;
  imagePreviewUrl: string | null;
  canRenderBrowserVideo: boolean;
  canRenderBrowserModel: boolean;
  hasShareableRoots: boolean;
  health: Health;
  copy: ReturnType<typeof healthCopy>;
};

type SectionProps = { artwork: ArtworkWithRelations; view: DerivedView };

function isLocalStatus(s: string): boolean {
  return s === "DOWNLOADED" || s === "PINNED";
}

function localUrlFor(root: IpfsRoot | null, status: string): string | null {
  if (!root || !isLocalStatus(status)) return null;
  return buildArchivePublicPath(root.cid, root.relativePath);
}

function pickImagePreviewUrl(
  artwork: ArtworkWithRelations,
  browserMediaUrl: string | null,
  localPreviewUrl: string | null,
): string | null {
  if (browserMediaUrl && artwork.mediaKind === "IMAGE") return browserMediaUrl;
  if (localPreviewUrl) return localPreviewUrl;
  if (artwork.mediaKind !== "IMAGE") return null;
  return browserMediaUrl;
}

function artistDisplay(artwork: ArtworkWithRelations): string {
  if (artwork.artistName) return artwork.artistName;
  if (artwork.artistUsername) return `@${artwork.artistUsername}`;
  return "Unknown artist";
}

function artistProfileHref(artwork: ArtworkWithRelations): string | null {
  if (artwork.artistUsername)
    return `/profile/${encodeURIComponent(artwork.artistUsername)}`;
  if (artwork.artistWallet)
    return `/profile/${encodeURIComponent(artwork.artistWallet)}`;
  return null;
}

function healthOf(input: {
  hasMetadataRoot: boolean;
  hasMediaRoot: boolean;
  metaStatus: string;
  mediaStatus: string;
}): Health {
  const tracked = Number(input.hasMetadataRoot) + Number(input.hasMediaRoot);
  const pinned = (s: string) => s === "PINNED";
  const downloaded = (s: string) => s === "DOWNLOADED" || pinned(s);
  const failed = (s: string) => s === "FAILED";

  if (tracked === 0) return "missing";
  if (failed(input.metaStatus) || failed(input.mediaStatus)) return "failed";
  if (
    (!input.hasMetadataRoot || pinned(input.metaStatus)) &&
    (!input.hasMediaRoot || pinned(input.mediaStatus))
  ) {
    return "preserved";
  }
  if (
    (!input.hasMetadataRoot || downloaded(input.metaStatus)) &&
    (!input.hasMediaRoot || downloaded(input.mediaStatus))
  ) {
    return "partial";
  }
  return "pending";
}

function healthCopy(h: Health) {
  switch (h) {
    case "preserved":
      return {
        label: "Saved",
        body: "This work is fully saved to the archive.",
        cls: "bg-[var(--tint-ok)] text-[var(--color-ok)]",
      };
    case "partial":
      return {
        label: "Almost saved",
        body: "The files are saved. The final backup step is still finishing.",
        cls: "bg-[var(--tint-info)] text-[var(--color-info)]",
      };
    case "pending":
      return {
        label: "In line",
        body: "Waiting in line to be saved. This usually happens automatically.",
        cls: "bg-[var(--tint-warn)] text-[var(--color-warn)]",
      };
    case "failed":
      return {
        label: "Retrying",
        body: "The last save attempt didn't finish. It will be retried automatically.",
        cls: "bg-[var(--tint-err)] text-[var(--color-err)]",
      };
    case "missing":
      return {
        label: "Not saved yet",
        body: "This work is tracked but its files haven't been saved yet.",
        cls: "bg-[var(--tint-muted)] text-[var(--color-muted)]",
      };
  }
}

async function deriveView(artwork: ArtworkWithRelations): Promise<DerivedView> {
  const localMediaUrl = localUrlFor(artwork.mediaRoot, artwork.mediaStatus);
  const localMetadataUrl = localUrlFor(
    artwork.metadataRoot,
    artwork.metadataStatus,
  );
  const localPreviewUrl = await resolveArchivedLocalUrl([
    artwork.staticPreviewUrl,
    artwork.previewUrl,
  ]);
  const gatewayMediaUrl = artwork.mediaRoot?.gatewayUrl ?? null;
  const gatewayMetadataUrl = artwork.metadataRoot?.gatewayUrl ?? null;
  const browserMediaUrl = localMediaUrl ?? gatewayMediaUrl ?? artwork.sourceUrl;
  const imagePreviewUrl = pickImagePreviewUrl(
    artwork,
    browserMediaUrl,
    localPreviewUrl,
  );
  const health = healthOf({
    hasMetadataRoot: Boolean(artwork.metadataRoot),
    hasMediaRoot: Boolean(artwork.mediaRoot),
    metaStatus: artwork.metadataStatus,
    mediaStatus: artwork.mediaStatus,
  });
  return {
    browserMediaUrl,
    localMediaUrl,
    localMetadataUrl,
    localPreviewUrl,
    gatewayMediaUrl,
    gatewayMetadataUrl,
    imagePreviewUrl,
    canRenderBrowserVideo:
      Boolean(browserMediaUrl) && artwork.mediaKind === "VIDEO",
    canRenderBrowserModel:
      Boolean(browserMediaUrl) && artwork.mediaKind === "MODEL",
    hasShareableRoots: Boolean(
      artwork.metadataRoot?.cid ?? artwork.mediaRoot?.cid,
    ),
    health,
    copy: healthCopy(health),
  };
}

async function dependencyFlowFor(args: {
  label: string;
  root: ArtworkWithRelations["metadataRoot"];
  status: string;
}): Promise<DependencyFlowCard | null> {
  const { label, root, status } = args;
  if (!root || !isLocalStatus(status)) return null;

  const manifest = await readDependencyManifest(root.cid, root.relativePath);
  if (!manifest) {
    return {
      label,
      state: "needs-check",
      summary:
        "The root is saved locally, but linked-file verification has not run yet.",
      items: [],
    };
  }

  const items = manifest.nodes
    .filter((node) => node.key !== manifest.rootKey)
    .sort((left, right) => {
      if (left.depth !== right.depth) return left.depth - right.depth;
      return left.relativePath.localeCompare(right.relativePath);
    });
  const failedCount = items.filter((item) => item.status === "FAILED").length;
  const downloadedCount = items.filter(
    (item) => item.status === "DOWNLOADED",
  ).length;

  if (items.length === 0) {
    return {
      label,
      state: manifest.verifiedAt ? "verified" : "needs-check",
      summary: manifest.verifiedAt
        ? "No linked files were discovered beyond the root itself."
        : "No linked files are tracked yet.",
      items: [],
    };
  }

  return {
    label,
    state:
      failedCount > 0
        ? "needs-attention"
        : manifest.verifiedAt
          ? "verified"
          : "needs-check",
    summary:
      failedCount > 0
        ? `${failedCount} linked file${failedCount === 1 ? "" : "s"} still need attention.`
        : `${downloadedCount} linked file${downloadedCount === 1 ? "" : "s"} verified for local replay.`,
    items: items.map((item) => ({
      key: item.key,
      relativePath: item.relativePath,
      localUrl: item.localUrl,
      gatewayUrl: item.gatewayUrl,
      sourceType: item.sourceType,
      discoveredFrom: item.discoveredFrom,
      depth: item.depth,
      status: item.status,
    })),
  };
}

async function dependencyFlowsForArtwork(artwork: ArtworkWithRelations) {
  return (
    await Promise.all([
      dependencyFlowFor({
        label: "Metadata",
        root: artwork.metadataRoot,
        status: artwork.metadataStatus,
      }),
      dependencyFlowFor({
        label: "Media",
        root: artwork.mediaRoot,
        status: artwork.mediaStatus,
      }),
    ])
  ).filter((value): value is DependencyFlowCard => Boolean(value));
}

export default async function ArtworkDetailPage(props: ArtworkDetailPageProps) {
  const { slug } = await props.params;

  const artwork = await db.artwork.findFirst({
    where: {
      slug,
      OR: [{ metadataRootId: { not: null } }, { mediaRootId: { not: null } }],
    },
    include: {
      contract: true,
      metadataRoot: true,
      mediaRoot: true,
      backups: { orderBy: { createdAt: "desc" }, take: 12 },
    },
  });

  if (!artwork) {
    notFound();
  }

  const [view, dependencyFlows, marketState, marketHistory, artistProfile] =
    await Promise.all([
      deriveView(artwork),
      dependencyFlowsForArtwork(artwork),
      getTokenMarketState(db, {
        chainId: artwork.chainId,
        nftContract: artwork.contractAddress,
        tokenId: artwork.tokenId,
      }),
      listTokenMarketHistory(
        db,
        {
          chainId: artwork.chainId,
          nftContract: artwork.contractAddress,
          tokenId: artwork.tokenId,
        },
        { limit: 50 },
      ),
      artwork.artistUsername
        ? fetchFoundationUserByUsername(artwork.artistUsername).catch(
            () => null,
          )
        : Promise.resolve(null),
    ]);

  const actionsProps = {
    chainId: artwork.chainId,
    contractAddress: artwork.contractAddress,
    tokenId: artwork.tokenId,
    title: artwork.title,
    activeBuyPrice: marketState.activeBuyPrice
      ? {
          marketContract: marketState.activeBuyPrice.marketContract,
          price: marketState.activeBuyPrice.price,
        }
      : null,
    liveAuction: marketState.liveAuction
      ? {
          marketContract: marketState.liveAuction.marketContract,
          auctionId: marketState.liveAuction.auctionId,
          status: marketState.liveAuction.status,
          endTime: marketState.liveAuction.endTime
            ? marketState.liveAuction.endTime.toISOString()
            : null,
          highestBid: marketState.liveAuction.highestBid,
          reservePrice: marketState.liveAuction.reservePrice,
        }
      : null,
    isRescuable: marketState.isRescuable,
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pt-8 pb-16">
      <BackLink />
      {artistProfile ? (
        <div className="mt-6">
          <ArtistHero
            artistName={artwork.artistName}
            artistUsername={artwork.artistUsername}
            artistWallet={artwork.artistWallet}
            profile={artistProfile}
          />
        </div>
      ) : null}
      <div className="mt-6 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <MediaPreview artwork={artwork} view={view} />
        <div>
          <ArtworkHeader artwork={artwork} view={view} />
          <MetadataPanel artwork={artwork} />
          <FadeUp delay={0.7} duration={0.6} className="block">
            <div className="mt-8">
              <ArtworkActionsPanelShell {...actionsProps} />
            </div>
          </FadeUp>
          <ActionRow artwork={artwork} view={view} />
          <DesktopSharePanel artwork={artwork} view={view} />
        </div>
      </div>
      <TechnicalDetails
        rootItems={rootCardItems({ artwork, view })}
        backups={artwork.backups}
        dependencyFlows={dependencyFlows}
        historySlot={
          marketHistory.length > 0 ? (
            <MarketHistoryList
              events={marketHistory}
              chainId={artwork.chainId}
            />
          ) : null
        }
      />
    </main>
  );
}

type ArtistHeroProfile = {
  username: string | null;
  name: string | null;
  profileImageUrl: string | null;
  coverImageUrl: string | null;
  bio: string | null;
  accountAddress: string;
};

function ArtistHero({
  artistName,
  artistUsername,
  artistWallet,
  profile,
}: {
  artistName: string | null;
  artistUsername: string | null;
  artistWallet: string | null;
  profile: ArtistHeroProfile;
}) {
  const displayName =
    profile.name ??
    artistName ??
    (profile.username ? `@${profile.username}` : null) ??
    (artistUsername ? `@${artistUsername}` : null) ??
    (artistWallet ? shortAddress(artistWallet) : "Unknown artist");
  const usernameBadge =
    profile.username ?? artistUsername
      ? `@${profile.username ?? artistUsername ?? ""}`
      : undefined;
  const archiveHref = profile.username
    ? `/profile/${encodeURIComponent(profile.username)}`
    : artistUsername
      ? `/profile/${encodeURIComponent(artistUsername)}`
      : artistWallet
        ? `/profile/${encodeURIComponent(artistWallet)}`
        : null;

  const aside = archiveHref ? (
    <div className="rounded-[1.4rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.24em] text-[var(--color-muted)]">
        Archive
      </p>
      <p className="mt-2 text-sm text-[var(--color-body)]">
        Browse the full collection of this artist&apos;s works being preserved
        in Agorix.
      </p>
      <Link
        href={archiveHref}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)]"
      >
        View archive
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  ) : null;

  return (
    <ProfileHero
      name={displayName}
      nameHref={archiveHref ?? undefined}
      seed={
        profile.username ?? artistUsername ?? artistWallet ?? displayName
      }
      eyebrow="Artist"
      usernameBadge={usernameBadge}
      subtitle={artistWallet ? shortAddress(artistWallet) : undefined}
      avatarUrl={profile.profileImageUrl}
      avatarLabel={displayName}
      bannerUrl={profile.coverImageUrl}
      bio={profile.bio}
      foundationUrl={
        profile.username
          ? `https://foundation.app/@${profile.username}`
          : undefined
      }
      aside={aside}
    />
  );
}

function BackLink() {
  return (
    <FadeUp duration={0.4}>
      <Link
        href="/archive"
        className="group inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="arrow-slide h-3.5 w-3.5 [transform:translateX(0)] group-hover:[transform:translateX(-3px)]" />
        <span className="link-editorial">Back to archive</span>
      </Link>
    </FadeUp>
  );
}

function renderPreviewInner({ artwork, view }: SectionProps) {
  if (view.canRenderBrowserVideo) {
    return (
      <video
        src={view.browserMediaUrl ?? undefined}
        poster={view.localPreviewUrl ?? undefined}
        controls
        loop
        muted
        playsInline
        className="mx-auto block max-h-[80vh] w-full bg-black object-contain"
      />
    );
  }
  if (view.canRenderBrowserModel && view.browserMediaUrl) {
    const modelCandidates = view.localMediaUrl
      ? []
      : [view.gatewayMediaUrl, artwork.sourceUrl].filter(
          (url): url is string => Boolean(url) && url !== view.browserMediaUrl,
        );
    return (
      <ModelMediaPreview
        src={view.browserMediaUrl}
        candidates={modelCandidates}
        poster={view.localPreviewUrl}
        alt={artwork.title}
        className="aspect-square w-full"
      />
    );
  }
  if (view.imagePreviewUrl) {
    return (
      <BlurImage
        src={view.imagePreviewUrl}
        alt={artwork.title}
        className="mx-auto block max-h-[80vh] w-full object-contain"
      />
    );
  }
  return (
    <div className="flex aspect-square items-center justify-center p-8 text-[var(--color-subtle)]">
      No preview available
    </div>
  );
}

function MediaPreview(props: SectionProps) {
  return (
    <FadeUp duration={0.8} y={16}>
      <div className="overflow-hidden rounded-sm bg-[var(--color-placeholder)]">
        {renderPreviewInner(props)}
      </div>
    </FadeUp>
  );
}

function ArtworkHeader({ artwork, view }: SectionProps) {
  const { copy, health } = view;
  const canRetry =
    health === "failed" || health === "missing" || health === "pending";
  const profileHref = artistProfileHref(artwork);
  const artistLabel = artistDisplay(artwork);
  return (
    <>
      <FadeUp delay={0.2} duration={0.6}>
        <p className="font-mono text-[0.65rem] tracking-[0.28em] text-[var(--color-muted)] uppercase">
          {profileHref ? (
            <Link
              href={profileHref}
              className="link-editorial text-[var(--color-ink)]"
            >
              {artistLabel}
            </Link>
          ) : (
            artistLabel
          )}
          {artwork.collectionName ? ` · ${artwork.collectionName}` : ""}
        </p>
      </FadeUp>
      <FadeUp delay={0.3} duration={0.7}>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-[var(--color-ink)] sm:text-5xl">
          {artwork.title}
        </h1>
      </FadeUp>
      <FadeUp delay={0.45} duration={0.6}>
        <div
          className={`mt-6 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${copy.cls}`}
        >
          {health === "preserved" ? <Check className="h-4 w-4" /> : null}
          {health === "pending" ? (
            <span
              aria-hidden
              className="dot-pulse inline-block h-1.5 w-1.5 rounded-full bg-current"
            />
          ) : null}
          {copy.label}
        </div>
        <p className="mt-3 max-w-md text-[var(--color-body)]">{copy.body}</p>
        {canRetry ? (
          <div className="mt-4">
            <RetrySaveButton
              chainId={artwork.chainId}
              contractAddress={artwork.contractAddress}
              tokenId={artwork.tokenId}
              foundationUrl={artwork.foundationUrl}
            />
          </div>
        ) : null}
      </FadeUp>
      {artwork.description ? (
        <FadeUp delay={0.55} duration={0.6}>
          <p className="mt-6 border-l-2 border-[var(--color-line-strong)] pl-4 leading-relaxed text-[var(--color-body)]">
            {artwork.description}
          </p>
        </FadeUp>
      ) : null}
    </>
  );
}

function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className="mt-1 text-[var(--color-ink)]">{children}</dd>
    </div>
  );
}

function MetadataPanel({ artwork }: { artwork: ArtworkWithRelations }) {
  return (
    <FadeUp delay={0.65} duration={0.6} className="block">
      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
        <MetaItem label="Chain">{chainLabel(artwork.chainId)}</MetaItem>
        <MetaItem label="Contract">
          <Link
            href={chainExplorerAddressUrl(
              artwork.chainId,
              artwork.contractAddress,
            )}
            target="_blank"
            rel="noreferrer"
            className="link-editorial font-mono"
          >
            {shortAddress(artwork.contractAddress)}
          </Link>
        </MetaItem>
        <MetaItem label="Token">
          <span className="font-mono">#{artwork.tokenId}</span>
        </MetaItem>
        <MetaItem label="Media">{artwork.mediaKind.toLowerCase()}</MetaItem>
        <MetaItem label="Last indexed">
          {formatDate(artwork.lastIndexedAt)}
        </MetaItem>
      </dl>
    </FadeUp>
  );
}

const PILL_CLS =
  "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)]";

function ActionPill(props: {
  href: string | null | undefined;
  label: string;
  rel?: string;
}) {
  if (!props.href) return null;
  return (
    <Link
      href={props.href}
      target="_blank"
      rel={props.rel}
      className={PILL_CLS}
    >
      {props.label}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function ActionRow({ artwork, view }: SectionProps) {
  const slugPath = artwork.slug ? `/archive/${artwork.slug}` : null;
  return (
    <FadeUp delay={0.75} duration={0.6} className="block">
      <div className="mt-8 flex flex-wrap gap-2">
        <ActionPill href={artwork.foundationUrl} label="View on Foundation" />
        <ActionPill
          href={artwork.metadataUrl}
          label="View original metadata"
          rel="noreferrer"
        />
        <ActionPill
          href={artwork.sourceUrl}
          label="View original media"
          rel="noreferrer"
        />
        <ActionPill href={view.localMetadataUrl} label="View Agorix metadata" />
        <ActionPill href={view.localMediaUrl} label="View Agorix media" />
        {slugPath ? (
          <ShareLinkButton title={artwork.title} path={slugPath} />
        ) : null}
      </div>
    </FadeUp>
  );
}

function DesktopSharePanel({ artwork, view }: SectionProps) {
  const { hasShareableRoots } = view;
  return (
    <ArtworkDesktopSharePanel
      hasShareableRoots={hasShareableRoots}
      work={{
        title: artwork.title,
        contractAddress: artwork.contractAddress,
        tokenId: artwork.tokenId,
        foundationUrl: artwork.foundationUrl,
        artistUsername: artwork.artistUsername,
        metadataCid: artwork.metadataRoot?.cid,
        mediaCid: artwork.mediaRoot?.cid,
      }}
    />
  );
}

function rootCardItems({ artwork, view }: SectionProps): RootCardItem[] {
  return [
    {
      label: "Metadata",
      root: artwork.metadataRoot,
      status: artwork.metadataStatus,
      localUrl: view.localMetadataUrl,
      originalUrl: artwork.metadataUrl,
    },
    {
      label: "Media",
      root: artwork.mediaRoot,
      status: artwork.mediaStatus,
      localUrl: view.localMediaUrl,
      originalUrl: artwork.sourceUrl,
    },
  ];
}
