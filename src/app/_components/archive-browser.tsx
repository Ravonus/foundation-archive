"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  ChevronRight,
  Filter,
  LoaderCircle,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { motion } from "motion/react";

import {
  ArtworkGrid,
  type ArtworkGridItem,
} from "~/app/_components/artwork-grid";
import {
  ARCHIVE_SORT_OPTIONS,
  type ArchiveMediaFilter,
  type ArchiveSort,
  type ArchiveStatusFilter,
} from "~/lib/archive-browse";
import { cn } from "~/lib/utils";

type ChipTone = "ok" | "info" | "warn" | "err" | "muted" | "neutral";

const STATUS_CHIPS: Array<{
  id: ArchiveStatusFilter;
  label: string;
  tone: ChipTone;
  hint: string;
}> = [
  { id: "all", label: "All", tone: "neutral", hint: "Show every work we've tracked so far." },
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

const MEDIA_CHIPS: Array<{ id: ArchiveMediaFilter; label: string; hint: string }> = [
  { id: "all", label: "Any type", hint: "Show all types of media." },
  { id: "image", label: "Image", hint: "Photos, illustrations, and other still images." },
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

type SearchPatch = Record<string, string | null>;
type UpdateSearch = (patch: SearchPatch, options?: { resetCursor?: boolean }) => void;

function applyPatchToParams(
  current: URLSearchParams,
  patch: SearchPatch,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (!value || value === "all" || (key === "sort" && value === "newest")) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  }
  return next;
}

function shouldShowControlShell(args: {
  unfilteredRenderedCount: number;
  matchingArchivedWorks: number;
  hasCursor: boolean;
  query: string;
  status: ArchiveStatusFilter;
  media: ArchiveMediaFilter;
}): boolean {
  return (
    args.unfilteredRenderedCount > 0 ||
    args.matchingArchivedWorks > 0 ||
    args.hasCursor ||
    Boolean(args.query) ||
    args.status !== "all" ||
    args.media !== "all"
  );
}

function hasNonDefaultFilters(
  status: ArchiveStatusFilter,
  media: ArchiveMediaFilter,
  sort: ArchiveSort,
): boolean {
  return status !== "all" || media !== "all" || sort !== "newest";
}

function formatVisibleSummary(
  renderedCount: number,
  matchingArchivedWorks: number,
): string {
  if (matchingArchivedWorks <= 0) return `${renderedCount} visible`;
  const plural = matchingArchivedWorks === 1 ? "" : "es";
  return `${renderedCount} visible · ${matchingArchivedWorks.toLocaleString()} archived match${plural}`;
}

export function ArchiveBrowser({
  items,
  emptyTitle,
  emptyBody,
  query,
  status,
  media,
  sort,
  nextCursor,
  hasCursor,
  matchingArchivedWorks,
  renderedCount,
  unfilteredRenderedCount,
  pageSize,
  hasLiveMatches,
}: {
  items: ArtworkGridItem[];
  emptyTitle: string;
  emptyBody: string;
  query: string;
  status: ArchiveStatusFilter;
  media: ArchiveMediaFilter;
  sort: ArchiveSort;
  nextCursor: string | null;
  hasCursor: boolean;
  matchingArchivedWorks: number;
  renderedCount: number;
  unfilteredRenderedCount: number;
  pageSize: number;
  hasLiveMatches: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isNavigating, startNavigation] = useTransition();

  const updateSearch: UpdateSearch = (patch, options) => {
    const next = applyPatchToParams(searchParams, patch);
    if (options?.resetCursor) {
      next.delete("cursor");
    }
    const href = next.toString() ? `${pathname}?${next}` : pathname;
    startNavigation(() => {
      router.push(href, { scroll: false });
      if (typeof window !== "undefined") {
        const reduceMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        window.scrollTo({
          top: 0,
          behavior: reduceMotion ? "auto" : "smooth",
        });
      }
    });
  };

  const filteredOut = unfilteredRenderedCount > 0 && renderedCount === 0;
  const showControlShell = shouldShowControlShell({
    unfilteredRenderedCount,
    matchingArchivedWorks,
    hasCursor,
    query,
    status,
    media,
  });

  return (
    <div className="space-y-5">
      {showControlShell ? (
        <ControlShell
          isNavigating={isNavigating}
          renderedCount={renderedCount}
          matchingArchivedWorks={matchingArchivedWorks}
          status={status}
          media={media}
          sort={sort}
          hasCursor={hasCursor}
          nextCursor={nextCursor}
          pageSize={pageSize}
          hasLiveMatches={hasLiveMatches}
          updateSearch={updateSearch}
        />
      ) : null}

      {filteredOut ? (
        <FilteredOutPanel query={query} updateSearch={updateSearch} />
      ) : (
        <div
          aria-busy={isNavigating}
          className={cn(
            "transition-opacity duration-200",
            isNavigating ? "opacity-60" : "opacity-100",
          )}
        >
          <ArtworkGrid
            items={items}
            emptyTitle={emptyTitle}
            emptyBody={emptyBody}
          />
        </div>
      )}
    </div>
  );
}

function ControlShell({
  isNavigating,
  renderedCount,
  matchingArchivedWorks,
  status,
  media,
  sort,
  hasCursor,
  nextCursor,
  pageSize,
  hasLiveMatches,
  updateSearch,
}: {
  isNavigating: boolean;
  renderedCount: number;
  matchingArchivedWorks: number;
  status: ArchiveStatusFilter;
  media: ArchiveMediaFilter;
  sort: ArchiveSort;
  hasCursor: boolean;
  nextCursor: string | null;
  pageSize: number;
  hasLiveMatches: boolean;
  updateSearch: UpdateSearch;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 sm:p-4"
    >
      <ControlHeader
        isNavigating={isNavigating}
        renderedCount={renderedCount}
        matchingArchivedWorks={matchingArchivedWorks}
      />

      <div className="mt-3 space-y-3">
        <StatusChipRow status={status} updateSearch={updateSearch} />
        <MediaChipRow media={media} updateSearch={updateSearch} />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <SortChipRow sort={sort} updateSearch={updateSearch} />
          <ActionButtons
            status={status}
            media={media}
            sort={sort}
            hasCursor={hasCursor}
            nextCursor={nextCursor}
            updateSearch={updateSearch}
          />
        </div>

        <PageSizeNote pageSize={pageSize} hasLiveMatches={hasLiveMatches} />
      </div>
    </motion.div>
  );
}

function ControlHeader({
  isNavigating,
  renderedCount,
  matchingArchivedWorks,
}: {
  isNavigating: boolean;
  renderedCount: number;
  matchingArchivedWorks: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5" />
        <span className="font-mono uppercase tracking-[0.2em]">
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
  );
}

function StatusChipRow({
  status,
  updateSearch,
}: {
  status: ArchiveStatusFilter;
  updateSearch: UpdateSearch;
}) {
  const activeHint =
    STATUS_CHIPS.find((chip) => chip.id === status)?.hint ?? "";
  return (
    <div>
      <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.2em] text-[var(--color-muted)]">
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
  updateSearch: UpdateSearch;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.2em] text-[var(--color-muted)]">
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
  updateSearch: UpdateSearch;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.2em] text-[var(--color-muted)]">
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

function ActionButtons({
  status,
  media,
  sort,
  hasCursor,
  nextCursor,
  updateSearch,
}: {
  status: ArchiveStatusFilter;
  media: ArchiveMediaFilter;
  sort: ArchiveSort;
  hasCursor: boolean;
  nextCursor: string | null;
  updateSearch: UpdateSearch;
}) {
  return (
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
          onClick={() => updateSearch({ cursor: null }, { resetCursor: true })}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)]"
        >
          Back to newest
        </button>
      ) : null}

      {nextCursor ? (
        <button
          type="button"
          onClick={() => updateSearch({ cursor: nextCursor })}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-3 py-1.5 text-xs font-medium text-[var(--color-bg)] hover:opacity-90"
        >
          Load more
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function PageSizeNote({
  pageSize,
  hasLiveMatches,
}: {
  pageSize: number;
  hasLiveMatches: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-4 py-3 text-sm text-[var(--color-muted)]">
      <p>
        Showing {pageSize} results per page to keep things fast.
        {hasLiveMatches
          ? " Live matches from Foundation are shown alongside the archive."
          : ""}
      </p>
    </div>
  );
}

function FilteredOutPanel({
  query,
  updateSearch,
}: {
  query: string;
  updateSearch: UpdateSearch;
}) {
  const bodyText = query
    ? `Try resetting the view or loading the next slice. "${query}" still has archiveable matches outside this exact window.`
    : "Try resetting the view or loading the next slice to keep moving through the archive.";
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface)] px-6 py-12 text-center">
      <h3 className="font-serif text-xl text-[var(--color-ink)]">
        No matches in this slice
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
