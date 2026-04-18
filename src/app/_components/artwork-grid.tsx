"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, LoaderCircle, Plus, X } from "lucide-react";

import { BlurImage } from "~/app/_components/motion";
import { archiveItemStatus } from "~/lib/archive-browse";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

export interface ArtworkGridItem {
  id: string;
  slug: string | null;
  chainId: number;
  title: string;
  artistName: string | null;
  artistUsername: string | null;
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
  lookupSource: "ARCHIVED" | "FOUNDATION_LIVE";
}

type Health = "preserved" | "partial" | "pending" | "missing" | "failed";

function healthOf(item: ArtworkGridItem): Health {
  return archiveItemStatus(item);
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

export function ArtworkGrid({
  items,
  emptyTitle,
  emptyBody,
}: {
  items: ArtworkGridItem[];
  emptyTitle: string;
  emptyBody: string;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [isRefreshing, startRefresh] = useTransition();
  const [feedback, setFeedback] = useState<
    { tone: "success" | "error"; message: string } | null
  >(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const id = window.setTimeout(() => setFeedback(null), 6000);
    return () => window.clearTimeout(id);
  }, [feedback]);

  const refresh = () =>
    startRefresh(() => {
      router.refresh();
    });

  const archiveMutation = api.archive.requestArtworkArchive.useMutation({
    onSuccess: (result) => {
      if (result.state === "already-pinned") {
        setFeedback({
          tone: "success",
          message:
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- result.title crosses the tRPC boundary; server may omit it on older clients despite the current schema typing it non-null.
            `${result.title ?? "This work"} is already saved.`,
        });
      } else {
        setFeedback({
          tone: "success",
          message: `Added to the line. You're ${
            result.jobsAhead === 0 ? "next up" : `#${result.jobsAhead + 1}`
          }.`,
        });
      }
      setActiveItemId(null);
      refresh();
    },
    onError: (error) => {
      setFeedback({
        tone: "error",
        message: error.message || "Something went wrong. Please try again.",
      });
      setActiveItemId(null);
    },
  });

  if (items.length === 0) {
    return <EmptyGridState title={emptyTitle} body={emptyBody} />;
  }

  const offset = reduce ? 0 : 14;
  const largeGrid = items.length > 18;
  const staggerChildren = reduce || largeGrid ? 0 : 0.06;

  const handleRequest = (item: ArtworkGridItem) => {
    setActiveItemId(item.id);
    archiveMutation.mutate({
      chainId: item.chainId,
      contractAddress: item.contractAddress,
      tokenId: item.tokenId,
      foundationUrl: item.foundationUrl ?? undefined,
    });
  };

  const isItemSubmitting = (itemId: string) =>
    activeItemId === itemId &&
    (archiveMutation.isPending || isRefreshing);

  return (
    <div className="space-y-6">
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {feedback?.message ?? ""}
      </div>
      <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} />

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
            item={item}
            index={index}
            largeGrid={largeGrid}
            offset={offset}
            isSubmitting={isItemSubmitting(item.id)}
            onRequest={handleRequest}
          />
        ))}
      </motion.div>
    </div>
  );
}

function ItemPoster({ item }: { item: ArtworkGridItem }) {
  const posterUrl = resolvePosterUrl(item);
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

function HealthBadge({ health }: { health: Health }) {
  const explanation = healthExplanation(health);
  return (
    <span
      className={cn(
        "absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-medium",
        healthClass(health),
      )}
      title={explanation}
      aria-label={`${healthLabel(health)} — ${explanation}`}
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
        {requestLabelFor(health)}
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
  onRequest,
}: {
  item: ArtworkGridItem;
  index: number;
  largeGrid: boolean;
  offset: number;
  isSubmitting: boolean;
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
      className="group flex flex-col"
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
        <HealthBadge health={health} />
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4 caption-rule">
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
            <span className="font-mono text-[0.65rem] tabular-nums text-[var(--color-subtle)]">
              {String(index + 1).padStart(3, "0")}
            </span>
            <span className="truncate">{artistDisplay(item)}</span>
          </p>
        </div>

        <ItemAction
          item={item}
          health={health}
          isSubmitting={isSubmitting}
          onRequest={onRequest}
        />
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

type FeedbackTone = "success" | "error";

function FeedbackToast({
  feedback,
  onDismiss,
}: {
  feedback: { tone: FeedbackTone; message: string } | null;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence initial={false}>
      {feedback ? (
        <motion.div
          key="feedback"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: EASE }}
          role={feedback.tone === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start justify-between gap-3 rounded-sm border px-5 py-3 text-sm",
            feedback.tone === "error"
              ? "border-[var(--color-err)]/40 bg-[var(--tint-err)] text-[var(--color-err)]"
              : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-body)]",
          )}
        >
          <span className="flex-1">{feedback.message}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={onDismiss}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-current hover:opacity-70"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
