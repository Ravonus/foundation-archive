/* eslint-disable max-lines, react-hooks/set-state-in-effect */

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Box, Check, LoaderCircle, Play, Plus } from "lucide-react";

import {
  useArchiveSaveManager,
  type ArchiveSaveWork,
} from "~/app/_components/archive-save-manager";
import { ModelMediaPreview } from "~/app/_components/model-media-preview";
import { BlurImage } from "~/app/_components/motion";
import { SaveTargetMenu } from "~/app/_components/save-target-menu";
import { VirtualizedArtworkGrid } from "~/app/_components/artwork-grid-virtualized";
import { ChainBadge } from "~/app/_components/chain-badge";
import { archiveItemStatus } from "~/lib/archive-browse";
import { cn } from "~/lib/utils";

export type ArtworkMarketState = "listed" | "auction" | "rescuable";

export type ArtworkStorageProtocol =
  | "ipfs"
  | "arweave"
  | "centralized"
  | "inline"
  | "unknown";

export interface ArtworkGridItem {
  id: string;
  slug: string | null;
  chainId: number;
  title: string;
  artistName: string | null;
  artistUsername: string | null;
  artistWallet: string | null;
  collectionName: string | null;
  tokenId: string;
  contractAddress: string;
  foundationContractType: string | null;
  mediaKind: string;
  metadataStatus: string;
  mediaStatus: string;
  posterUrl: string | null;
  mediaUrl: string | null;
  foundationUrl: string | null;
  archiveMediaUrl: string | null;
  publicGatewayUrl: string | null;
  metadataCid: string | null;
  mediaCid: string | null;
  metadataUrl: string | null;
  sourceUrl: string | null;
  lookupSource: "ARCHIVED" | "FOUNDATION_LIVE";
  storageProtocol: ArtworkStorageProtocol;
  marketState?: ArtworkMarketState | null;
}

type Health = "preserved" | "partial" | "pending" | "missing" | "failed";

function healthOf(item: ArtworkGridItem): Health {
  return archiveItemStatus(item);
}

function isArchivableProtocol(protocol: ArtworkStorageProtocol) {
  return protocol === "ipfs";
}

function offChainLabel(protocol: ArtworkStorageProtocol): string {
  switch (protocol) {
    case "arweave":
      return "Arweave";
    case "centralized":
      return "Off-chain";
    case "inline":
      return "Inline data";
    case "ipfs":
    case "unknown":
      return "Not on IPFS";
    default:
      return protocol satisfies never;
  }
}

function offChainExplanation(protocol: ArtworkStorageProtocol): string {
  switch (protocol) {
    case "arweave":
      return "Stored on Arweave. We don't back this up because Arweave already handles permanence, and our archive pins to IPFS.";
    case "centralized":
      return "Stored on a centralized server. We can't pin this to IPFS, so we don't include it in the archive.";
    case "inline":
      return "The media is embedded directly in the token's on-chain data — nothing to pin.";
    case "ipfs":
    case "unknown":
      return "This work isn't stored on IPFS, so we can't pin it to the archive.";
    default:
      return protocol satisfies never;
  }
}

function healthLabel(h: Health) {
  switch (h) {
    case "preserved":
      return "Saved";
    case "partial":
      return "Almost saved";
    case "pending":
      return "In line";
    case "failed":
      return "Retrying";
    case "missing":
      return "Not saved yet";
  }
}

function healthExplanation(h: Health) {
  switch (h) {
    case "preserved":
      return "This work is fully saved to the archive.";
    case "partial":
      return "The files are saved. The final backup step is still in progress.";
    case "pending":
      return "Waiting in line to be saved. This usually happens automatically.";
    case "failed":
      return "The last save attempt didn't finish. It will be retried automatically.";
    case "missing":
      return "We've tracked this work but haven't saved its files yet.";
  }
}

function mediaKindLabel(kind: string) {
  switch (kind.toUpperCase()) {
    case "IMAGE":
      return "Image";
    case "VIDEO":
      return "Video";
    case "AUDIO":
      return "Audio";
    case "HTML":
      return "Interactive";
    case "MODEL":
      return "3D model";
    default:
      return "Media";
  }
}

function healthClass(h: Health) {
  switch (h) {
    case "preserved":
      return "bg-[var(--tint-ok)] text-[var(--color-ok)]";
    case "partial":
      return "bg-[var(--tint-info)] text-[var(--color-info)]";
    case "pending":
      return "bg-[var(--tint-warn)] text-[var(--color-warn)]";
    case "failed":
      return "bg-[var(--tint-err)] text-[var(--color-err)]";
    case "missing":
      return "bg-[var(--tint-muted)] text-[var(--color-muted)]";
  }
}

const EASE = [0.22, 1, 0.36, 1] as const;
const VIRTUALIZE_AFTER_ITEMS = 18;

function resolveHref(item: ArtworkGridItem) {
  if (item.slug) return `/archive/${item.slug}`;
  return item.foundationUrl ?? "#";
}

function isExternalLink(item: ArtworkGridItem) {
  return !item.slug && Boolean(item.foundationUrl);
}

function resolvePosterUrl(item: ArtworkGridItem) {
  if (item.posterUrl) return item.posterUrl;
  return item.mediaKind === "IMAGE" ? item.mediaUrl : null;
}

function isModelItem(item: ArtworkGridItem) {
  return item.mediaKind.toUpperCase() === "MODEL";
}

function requestLabelFor(health: Health) {
  return health === "failed" ? "Retry save" : "Save this";
}

function shouldShowRequest(health: Health) {
  return health === "missing" || health === "failed";
}

function artistDisplay(item: ArtworkGridItem) {
  if (item.artistName) return item.artistName;
  if (item.artistUsername) return `@${item.artistUsername}`;
  return "Unknown artist";
}

function artistProfileHref(item: ArtworkGridItem) {
  if (item.artistUsername) {
    return `/profile/${encodeURIComponent(item.artistUsername)}`;
  }
  if (item.artistWallet) {
    return `/profile/${encodeURIComponent(item.artistWallet)}`;
  }
  return null;
}

function cardVariants(largeGrid: boolean, offset: number) {
  return {
    hidden: largeGrid ? { opacity: 1, y: 0 } : { opacity: 0, y: offset },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: largeGrid ? 0.2 : 0.6,
        ease: EASE,
      },
    },
  };
}

function toArchiveSaveWork(item: ArtworkGridItem): ArchiveSaveWork {
  return {
    title: item.title,
    chainId: item.chainId,
    contractAddress: item.contractAddress,
    tokenId: item.tokenId,
    foundationUrl: item.foundationUrl,
    artistUsername: item.artistUsername,
    metadataCid: item.metadataCid,
    mediaCid: item.mediaCid,
    metadataUrl: item.metadataUrl,
    sourceUrl: item.sourceUrl,
    mediaUrl: item.mediaUrl,
  };
}

export function ArtworkGrid({
  items,
  emptyTitle,
  emptyBody,
  virtualize = false,
}: {
  items: ArtworkGridItem[];
  emptyTitle: string;
  emptyBody: string;
  virtualize?: boolean;
}) {
  const reduce = useReducedMotion();
  const { requestArchiveSave, getWorkState } = useArchiveSaveManager();

  if (items.length === 0) {
    return <EmptyGridState title={emptyTitle} body={emptyBody} />;
  }

  const offset = reduce ? 0 : 14;
  const largeGrid = items.length > 18;
  const staggerChildren = reduce || largeGrid ? 0 : 0.06;
  const shouldVirtualize = virtualize && items.length > VIRTUALIZE_AFTER_ITEMS;

  const handleRequest = (item: ArtworkGridItem) => {
    void requestArchiveSave(toArchiveSaveWork(item));
  };

  const isItemSubmitting = (item: ArtworkGridItem) =>
    getWorkState(toArchiveSaveWork(item)).archive === "pending";

  const hasSaveState = (item: ArtworkGridItem) => {
    const state = getWorkState(toArchiveSaveWork(item));
    return (
      state.archive !== "idle" ||
      state.desktop !== "idle" ||
      Object.values(state.hosts).some((entry) => entry.status !== "idle")
    );
  };

  const overrideFor = (item: ArtworkGridItem): ArtworkGridItem => {
    const state = getWorkState(toArchiveSaveWork(item));
    if (state.archive === "pending") {
      return { ...item, metadataStatus: "PENDING", mediaStatus: "PENDING" };
    }
    if (state.archive === "saved") {
      return { ...item, metadataStatus: "PINNED", mediaStatus: "PINNED" };
    }
    return item;
  };

  return (
    <div className="space-y-6">
      {shouldVirtualize ? (
        <VirtualizedArtworkGrid
          items={items}
          renderItem={(item, index) => (
            <ItemCard
              key={item.id}
              item={overrideFor(item)}
              index={index}
              largeGrid
              offset={0}
              isSubmitting={isItemSubmitting(item)}
              showPinnedMenu={hasSaveState(item)}
              onRequest={handleRequest}
            />
          )}
        />
      ) : (
        <motion.div
          className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          variants={{
            hidden: {},
            visible: {
              transition: {
                staggerChildren,
                delayChildren: 0.05,
              },
            },
          }}
        >
          {items.map((item, index) => (
            <ItemCard
              key={item.id}
              item={overrideFor(item)}
              index={index}
              largeGrid={largeGrid}
              offset={offset}
              isSubmitting={isItemSubmitting(item)}
              showPinnedMenu={hasSaveState(item)}
              onRequest={handleRequest}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
}

function isVideoItem(item: ArtworkGridItem) {
  return item.mediaKind.toUpperCase() === "VIDEO";
}

function isAudioItem(item: ArtworkGridItem) {
  return item.mediaKind.toUpperCase() === "AUDIO";
}

/// Observes whether a ref'd element is within the viewport (plus a
/// rootMargin buffer so things animate in slightly before they cross
/// the edge). Used to smart-cull grid media: videos play only when
/// visible and <model-viewer> only mounts when visible so we don't
/// stream thousands of MBs of off-screen GLBs at scroll time.
function useInView<T extends Element>(
  rootMargin = "200px",
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setInView(entry.isIntersecting);
        }
      },
      { rootMargin, threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);

  return [ref, inView];
}

/// Muted-autoplay video that pauses itself as it scrolls out of view
/// and resumes when it comes back. iOS Safari enforces an "N concurrent
/// playing videos" quota for autoplay; the culling keeps us under that
/// quota so the browser never falls back to the native play-button
/// overlay (which would be tap-swallowed by the tile's parent <Link>).
function AutoplayVideo({
  src,
  poster,
  alt,
  className,
}: {
  src: string;
  poster: string | null;
  alt: string;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLVideoElement>("100px");

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (inView) {
      // iOS Safari requires the video to be muted + playsinline and
      // honors the declarative `autoplay` attribute. We still call
      // .play() imperatively when the element scrolls back into view
      // after we paused it — the browser treats that as a continuation
      // of the same session, not a denied autoplay.
      void node.play().catch((error: unknown) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[AutoplayVideo] play() rejected", {
            src,
            readyState: node.readyState,
            networkState: node.networkState,
            error,
          });
        }
      });
    } else {
      node.pause();
    }
  }, [inView, ref, src]);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster ?? undefined}
      muted
      autoPlay
      loop
      playsInline
      // Full preload so Safari has the bytes staged when the tile
      // scrolls in and .play() fires — metadata-only was causing
      // some clips to stay on the poster frame until a user gesture.
      preload="auto"
      disableRemotePlayback
      aria-label={alt}
      className={className}
    />
  );
}

/// Lazy-mounts the <model-viewer> element only when the tile is within
/// the viewport. Until then it renders the poster so the tile reads as
/// an image placeholder — no GLB fetch, no WebGL context, no idle GPU
/// cost for off-screen cards. Once visible, model-viewer takes over and
/// its own internal `slot="poster"` cross-fades to the loaded model.
function LazyModelPreview({
  src,
  poster,
  alt,
  className,
}: {
  src: string;
  poster: string | null;
  alt: string;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>("200px");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (inView && !mounted) setMounted(true);
  }, [inView, mounted]);

  return (
    <div
      ref={ref}
      className={cn(
        "pointer-events-none relative h-full w-full overflow-hidden",
        className,
      )}
    >
      {mounted ? (
        <ModelMediaPreview
          src={src}
          poster={poster}
          alt={alt}
          autoRotate
          allowAnchorFallback={false}
          className="h-full w-full transition-[filter] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:[filter:brightness(1.02)]"
        />
      ) : poster ? (
        <BlurImage
          src={poster}
          alt={alt}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-[var(--color-subtle)]">
          3D model
        </div>
      )}
      <MediaKindBadge kind="model" />
    </div>
  );
}

function MediaKindBadge({
  kind,
  className,
}: {
  kind: "video" | "model";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute right-3 bottom-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(17,17,17,0.72)] text-[var(--color-bg)] shadow-[0_8px_24px_-12px_rgba(17,17,17,0.6)] backdrop-blur",
        className,
      )}
    >
      {kind === "video" ? (
        <Play className="h-4 w-4 fill-current" strokeWidth={0} />
      ) : (
        <Box className="h-4 w-4" strokeWidth={1.75} />
      )}
    </span>
  );
}

function ItemPoster({ item }: { item: ArtworkGridItem }) {
  const posterUrl = resolvePosterUrl(item);

  if (isModelItem(item) && item.mediaUrl) {
    return (
      <LazyModelPreview
        src={item.mediaUrl}
        poster={posterUrl}
        alt={item.title}
      />
    );
  }
  if (isVideoItem(item) && item.mediaUrl) {
    return (
      <>
        <AutoplayVideo
          src={item.mediaUrl}
          poster={posterUrl}
          alt={item.title}
          className="h-full w-full object-cover transition-[filter] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:[filter:brightness(1.02)]"
        />
        <MediaKindBadge kind="video" />
      </>
    );
  }
  if (isAudioItem(item) && item.mediaUrl) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-[var(--color-surface-alt)]">
        {posterUrl ? (
          <BlurImage
            src={posterUrl}
            alt={item.title}
            className="absolute inset-0 h-full w-full object-cover opacity-60"
          />
        ) : null}
        <audio
          src={item.mediaUrl}
          controls
          preload="none"
          aria-label={item.title}
          className="relative z-10 w-[85%] max-w-xs"
        />
      </div>
    );
  }
  if (posterUrl) {
    return (
      <BlurImage
        src={posterUrl}
        alt={item.title}
        className="h-full w-full object-cover transition-[filter,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:[filter:brightness(1.02)]"
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-[var(--color-subtle)]">
      {mediaKindLabel(item.mediaKind)}
    </div>
  );
}

function HealthBadge({
  health,
  protocol,
}: {
  health: Health;
  protocol: ArtworkStorageProtocol;
}) {
  if (!isArchivableProtocol(protocol)) {
    const explanation = offChainExplanation(protocol);
    return (
      <span
        className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--tint-muted)] px-2.5 py-1 text-[0.7rem] font-medium text-[var(--color-muted)]"
        title={explanation}
        aria-label={`${offChainLabel(protocol)}: ${explanation}`}
      >
        {offChainLabel(protocol)}
      </span>
    );
  }
  const explanation = healthExplanation(health);
  return (
    <span
      className={cn(
        "absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-medium",
        healthClass(health),
      )}
      title={explanation}
      aria-label={`${healthLabel(health)}: ${explanation}`}
    >
      {health === "pending" ? (
        <span
          aria-hidden
          className="dot-pulse inline-block h-1.5 w-1.5 rounded-full bg-current"
        />
      ) : null}
      {healthLabel(health)}
    </span>
  );
}

function MarketBadge({
  state,
}: {
  state: ArtworkMarketState | null | undefined;
}) {
  if (!state) return null;
  const styles =
    state === "rescuable"
      ? "border border-[var(--color-brand-green)] bg-[var(--color-brand-green-soft)] text-[var(--color-brand-green)]"
      : state === "auction"
        ? "border border-[var(--color-info)]/40 bg-[var(--color-surface)] text-[var(--color-info)]"
        : "border border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-ink)]";
  const label =
    state === "rescuable"
      ? "Awaiting rescue"
      : state === "auction"
        ? "Live auction"
        : "Listed";
  return (
    <span
      className={`absolute top-3 right-3 z-10 rounded-full px-2.5 py-1 text-[0.7rem] font-medium ${styles}`}
    >
      {label}
    </span>
  );
}

function ItemAction({
  item,
  health,
  isSubmitting,
  onRequest,
}: {
  item: ArtworkGridItem;
  health: Health;
  isSubmitting: boolean;
  onRequest: (item: ArtworkGridItem) => void;
}) {
  if (!isArchivableProtocol(item.storageProtocol)) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--color-muted)]"
        title={offChainExplanation(item.storageProtocol)}
      >
        {offChainLabel(item.storageProtocol)}
      </span>
    );
  }
  if (shouldShowRequest(health)) {
    return (
      <button
        type="button"
        disabled={isSubmitting}
        onClick={() => {
          onRequest(item);
        }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)] disabled:opacity-50"
      >
        {isSubmitting ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        {isSubmitting ? "Queued" : requestLabelFor(health)}
      </button>
    );
  }
  if (health === "preserved") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--color-ok)]">
        <Check className="h-3.5 w-3.5" />
        Safe
      </span>
    );
  }
  return null;
}

function ItemCard({
  item,
  index,
  largeGrid,
  offset,
  isSubmitting,
  showPinnedMenu,
  onRequest,
}: {
  item: ArtworkGridItem;
  index: number;
  largeGrid: boolean;
  offset: number;
  isSubmitting: boolean;
  showPinnedMenu: boolean;
  onRequest: (item: ArtworkGridItem) => void;
}) {
  const href = resolveHref(item);
  const isExternal = isExternalLink(item);
  const health = healthOf(item);
  const targetProps = {
    target: isExternal ? ("_blank" as const) : undefined,
    rel: isExternal ? "noreferrer" : undefined,
  };

  return (
    <motion.article
      variants={cardVariants(largeGrid, offset)}
      className="group relative z-0 flex flex-col overflow-visible focus-within:z-[80] hover:z-[70]"
    >
      {isArchivableProtocol(item.storageProtocol) ? (
        <div
          className={cn(
            "pointer-events-none absolute top-3 right-3 z-40 transition duration-200 group-focus-within:z-[90] group-focus-within:opacity-100 group-hover:opacity-100",
            showPinnedMenu ? "opacity-100" : "opacity-0",
          )}
        >
          <div className="pointer-events-auto">
            <SaveTargetMenu work={toArchiveSaveWork(item)} />
          </div>
        </div>
      ) : null}
      <div
        className="flex flex-col"
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: "420px 540px",
        }}
      >
        <Link
          href={href}
          {...targetProps}
          className="relative block overflow-hidden rounded-sm bg-[var(--color-placeholder)]"
        >
          <div className="relative aspect-square w-full overflow-hidden">
            <ItemPoster item={item} />
          </div>
          <HealthBadge health={health} protocol={item.storageProtocol} />
          <MarketBadge state={item.marketState} />
        </Link>

        <div className="caption-rule mt-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate font-serif text-lg leading-tight text-[var(--color-ink)]">
              <Link
                href={href}
                {...targetProps}
                className="link-editorial title-variable"
              >
                {item.title}
              </Link>
            </h3>
            <p className="mt-1 flex items-center gap-2 truncate text-sm text-[var(--color-muted)]">
              <span className="font-mono text-[0.65rem] text-[var(--color-subtle)] tabular-nums">
                {String(index + 1).padStart(3, "0")}
              </span>
              {(() => {
                const label = artistDisplay(item);
                const profileHref = artistProfileHref(item);
                if (!profileHref) {
                  return <span className="truncate">{label}</span>;
                }
                return (
                  <Link
                    href={profileHref}
                    className="link-editorial truncate hover:text-[var(--color-ink)]"
                    aria-label={`View profile for ${label}`}
                  >
                    {label}
                  </Link>
                );
              })()}
              <ChainBadge chainId={item.chainId} />
            </p>
          </div>

          <ItemAction
            item={item}
            health={health}
            isSubmitting={isSubmitting}
            onRequest={onRequest}
          />
        </div>
      </div>
    </motion.article>
  );
}

function EmptyGridState({ title, body }: { title: string; body: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="rounded-sm border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface)] px-8 py-16 text-center"
    >
      <h3 className="font-serif text-2xl text-[var(--color-ink)]">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-[var(--color-muted)]">{body}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link
          href="/archive"
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)] hover:opacity-90"
        >
          Browse the archive
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)]"
        >
          Search from home
        </Link>
      </div>
    </motion.div>
  );
}
