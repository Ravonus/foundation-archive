"use client";

import { type RefObject, useEffect, useState } from "react";
import {
  ChevronRight,
  Filter,
  LoaderCircle,
  RotateCcw,
  SlidersHorizontal,
  Timer,
} from "lucide-react";
import { motion } from "motion/react";

import {
  ARCHIVE_SORT_OPTIONS,
  type ArchiveMediaFilter,
  type ArchiveSort,
  type ArchiveStatusFilter,
} from "~/lib/archive-browse";
import { cn } from "~/lib/utils";

type ChipTone = "ok" | "info" | "warn" | "err" | "muted" | "neutral";

export type UpdateArchiveSearch = (
  patch: Record<string, string | null>,
  options?: { resetCursor?: boolean },
) => void;

const STATUS_CHIPS: Array<{
  id: ArchiveStatusFilter;
  label: string;
  tone: ChipTone;
  hint: string;
}> = [
  {
    id: "all",
    label: "All",
    tone: "neutral",
    hint: "Show every work we've tracked so far.",
  },
  {
    id: "preserved",
    label: "Saved",
    tone: "ok",
    hint: "Fully saved to the archive.",
  },
  {
    id: "partial",
    label: "Almost saved",
    tone: "info",
    hint: "The files are saved. Final backup step is still finishing.",
  },
  {
    id: "pending",
    label: "In line",
    tone: "warn",
    hint: "Waiting to be saved automatically.",
  },
  {
    id: "failed",
    label: "Retrying",
    tone: "err",
    hint: "Last save attempt didn't finish. It will be retried.",
  },
  {
    id: "missing",
    label: "Not saved yet",
    tone: "muted",
    hint: "Tracked but files haven't been saved yet.",
  },
];

const MEDIA_CHIPS: Array<{
  id: ArchiveMediaFilter;
  label: string;
  hint: string;
}> = [
  { id: "all", label: "Any type", hint: "Show all types of media." },
  {
    id: "image",
    label: "Image",
    hint: "Photos, illustrations, and other still images.",
  },
  { id: "video", label: "Video", hint: "Moving image works." },
  { id: "audio", label: "Audio", hint: "Sound-only works." },
  { id: "html", label: "Interactive", hint: "Web-based or interactive works." },
  { id: "model", label: "3D", hint: "3D models." },
];

const CHIP_BASE =
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition";

const ACTIVE_TONE_CLASS: Record<ChipTone, string> = {
  ok: "bg-[var(--color-ok)] text-white",
  info: "bg-[var(--color-info)] text-white",
  warn: "bg-[var(--color-warn)] text-white",
  err: "bg-[var(--color-err)] text-white",
  muted: "bg-[var(--color-muted)] text-[var(--color-bg)]",
  neutral: "bg-[var(--color-ink)] text-[var(--color-bg)]",
};

function chipClass(tone: ChipTone, active: boolean) {
  if (!active) {
    return cn(
      CHIP_BASE,
      "border border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-ink)]",
    );
  }
  return cn(CHIP_BASE, ACTIVE_TONE_CLASS[tone]);
}

function hasNonDefaultFilters(
  status: ArchiveStatusFilter,
  media: ArchiveMediaFilter,
  sort: ArchiveSort,
) {
  return status !== "all" || media !== "all" || sort !== "newest";
}

function formatVisibleSummary(
  renderedCount: number,
  matchingArchivedWorks: number,
) {
  if (matchingArchivedWorks <= 0) return `${renderedCount} visible`;
  const plural = matchingArchivedWorks === 1 ? "" : "es";
  return `${renderedCount} visible · ${matchingArchivedWorks.toLocaleString()} archived match${plural}`;
}

function useSecondsUntil(untilMs: number | null): number {
  const [remaining, setRemaining] = useState(() =>
    untilMs ? Math.max(0, Math.ceil((untilMs - Date.now()) / 1000)) : 0,
  );

  useEffect(() => {
    if (!untilMs) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const secs = Math.max(0, Math.ceil((untilMs - Date.now()) / 1000));
      setRemaining(secs);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [untilMs]);

  return remaining;
}

export function ControlShell({
  isNavigating,
  renderedCount,
  matchingArchivedWorks,
  status,
  media,
  sort,
  hasCursor,
  hasMore,
  isLoadingMore,
  loadError,
  cooldownUntil,
  pageSize,
  hasLiveMatches,
  updateSearch,
  onLoadMore,
  onRetryNow,
}: {
  isNavigating: boolean;
  renderedCount: number;
  matchingArchivedWorks: number;
  status: ArchiveStatusFilter;
  media: ArchiveMediaFilter;
  sort: ArchiveSort;
  hasCursor: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadError: string | null;
  cooldownUntil: number | null;
  pageSize: number;
  hasLiveMatches: boolean;
  updateSearch: UpdateArchiveSearch;
  onLoadMore: () => void;
  onRetryNow: () => void;
}) {
  const cooldownSeconds = useSecondsUntil(cooldownUntil);
  const isCoolingDown = cooldownSeconds > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5" />
          <span className="font-mono tracking-[0.2em] uppercase">
            Archive browser
          </span>
          <span className="text-[var(--color-subtle)]">
            {formatVisibleSummary(renderedCount, matchingArchivedWorks)}
          </span>
        </div>
        {isNavigating ? (
          <span className="inline-flex items-center gap-1.5 text-[var(--color-subtle)]">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            Updating
          </span>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        <StatusChipRow status={status} updateSearch={updateSearch} />
        <MediaChipRow media={media} updateSearch={updateSearch} />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <SortChipRow sort={sort} updateSearch={updateSearch} />
          <div className="flex flex-wrap gap-2">
            {hasNonDefaultFilters(status, media, sort) && (
              <button
                type="button"
                onClick={() =>
                  updateSearch(
                    { status: "all", media: "all", sort: "newest" },
                    { resetCursor: true },
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset view
              </button>
            )}

            {hasCursor ? (
              <button
                type="button"
                onClick={() =>
                  updateSearch({ cursor: null }, { resetCursor: true })
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)]"
              >
                Back to newest
              </button>
            ) : null}

            {hasMore || loadError || isCoolingDown ? (
              <button
                type="button"
                onClick={isCoolingDown ? onRetryNow : onLoadMore}
                disabled={isLoadingMore}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-3 py-1.5 text-xs font-medium text-[var(--color-bg)] hover:opacity-90 disabled:opacity-60"
              >
                {isLoadingMore ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : isCoolingDown ? (
                  <Timer className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                {isCoolingDown
                  ? `Easing off · ${cooldownSeconds}s`
                  : loadError
                    ? "Retry load"
                    : "Load next now"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-4 py-3 text-sm text-[var(--color-muted)]">
          <p>
            Loads {pageSize} more results at a time as you scroll. Off-screen
            rows are culled and restored as you move back through the archive.
            {hasLiveMatches
              ? " Live matches from Foundation still appear alongside saved works."
              : ""}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function StatusChipRow({
  status,
  updateSearch,
}: {
  status: ArchiveStatusFilter;
  updateSearch: UpdateArchiveSearch;
}) {
  const activeHint =
    STATUS_CHIPS.find((chip) => chip.id === status)?.hint ?? "";

  return (
    <div>
      <div className="flex items-center gap-2 text-[0.68rem] tracking-[0.2em] text-[var(--color-muted)] uppercase">
        <span>Status</span>
        <span className="text-[var(--color-subtle)]">
          Filter by how much of each work has been saved
        </span>
      </div>
      <div className="edge-fade-x mt-2 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-1.5">
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() =>
                updateSearch({ status: chip.id }, { resetCursor: true })
              }
              className={chipClass(chip.tone, status === chip.id)}
              title={chip.hint}
              aria-label={`${chip.label}: ${chip.hint}`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
      {activeHint ? (
        <p className="mt-2 text-[0.72rem] text-[var(--color-subtle)]">
          {activeHint}
        </p>
      ) : null}
    </div>
  );
}

function MediaChipRow({
  media,
  updateSearch,
}: {
  media: ArchiveMediaFilter;
  updateSearch: UpdateArchiveSearch;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[0.68rem] tracking-[0.2em] text-[var(--color-muted)] uppercase">
        <span>Type</span>
        <span className="text-[var(--color-subtle)]">
          Filter by kind of artwork
        </span>
      </div>
      <div className="edge-fade-x mt-2 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-1.5">
          {MEDIA_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() =>
                updateSearch({ media: chip.id }, { resetCursor: true })
              }
              className={chipClass("neutral", media === chip.id)}
              title={chip.hint}
              aria-label={`${chip.label}: ${chip.hint}`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SortChipRow({
  sort,
  updateSearch,
}: {
  sort: ArchiveSort;
  updateSearch: UpdateArchiveSearch;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[0.68rem] tracking-[0.2em] text-[var(--color-muted)] uppercase">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span>Sort</span>
      </div>
      <div className="edge-fade-x mt-2 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-1.5">
          {ARCHIVE_SORT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() =>
                updateSearch({ sort: option.id }, { resetCursor: true })
              }
              className={chipClass("neutral", sort === option.id)}
              title={option.hint}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function NoVisibleMatchesPanel({
  query,
  updateSearch,
}: {
  query: string;
  updateSearch: UpdateArchiveSearch;
}) {
  const bodyText = query
    ? `Try resetting the filters. "${query}" has related results, but none are visible in this archive state or media view.`
    : "Try resetting the filters to widen the archive view again.";

  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface)] px-6 py-12 text-center">
      <h3 className="font-serif text-xl text-[var(--color-ink)]">
        No visible matches
      </h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--color-muted)]">
        {bodyText}
      </p>
      <button
        type="button"
        onClick={() =>
          updateSearch(
            { status: "all", media: "all", sort: "newest", cursor: null },
            { resetCursor: true },
          )
        }
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)] hover:opacity-90"
      >
        Reset browser
      </button>
    </div>
  );
}

export function InfiniteLoadStatus({
  hasMore,
  isLoadingMore,
  loadError,
  cooldownUntil,
  renderedCount,
  sentinelRef,
  onLoadMore,
  onRetryNow,
}: {
  hasMore: boolean;
  isLoadingMore: boolean;
  loadError: string | null;
  cooldownUntil: number | null;
  renderedCount: number;
  sentinelRef: RefObject<HTMLDivElement | null>;
  onLoadMore: () => void;
  onRetryNow: () => void;
}) {
  const cooldownSeconds = useSecondsUntil(cooldownUntil);
  const isCoolingDown = cooldownSeconds > 0;

  if (
    !hasMore &&
    !isLoadingMore &&
    !loadError &&
    !isCoolingDown &&
    renderedCount === 0
  ) {
    return null;
  }

  return (
    <div className="space-y-3">
      {hasMore ? (
        <div ref={sentinelRef} aria-hidden className="h-px w-full" />
      ) : null}

      <div className="flex justify-center">
        {isCoolingDown ? (
          <button
            type="button"
            onClick={onRetryNow}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            aria-live="polite"
            title="Server asked us to slow down — click to retry now."
          >
            <Timer className="h-4 w-4" />
            Easing off to avoid overload · resuming in {cooldownSeconds}s
          </button>
        ) : loadError ? (
          <button
            type="button"
            onClick={onLoadMore}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)]"
          >
            <RotateCcw className="h-4 w-4" />
            Retry loading more
          </button>
        ) : hasMore || isLoadingMore ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-muted)]">
            {isLoadingMore ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Loading more works
              </>
            ) : (
              "Keep scrolling to load more"
            )}
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-muted)]">
            End of this archive view
          </div>
        )}
      </div>
    </div>
  );
}
