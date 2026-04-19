"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  type ArtworkGridItem,
  ArtworkGrid,
} from "~/app/_components/artwork-grid";
import {
  type ArchiveMediaFilter,
  type ArchiveSort,
  type ArchiveStatusFilter,
} from "~/lib/archive-browse";
import { cn } from "~/lib/utils";

import {
  ControlShell,
  InfiniteLoadStatus,
  NoVisibleMatchesPanel,
  type UpdateArchiveSearch,
} from "./archive-browser-controls";

type ArchiveBrowsePageResponse = {
  items: ArtworkGridItem[];
  nextCursor: string | null;
};

type ArchiveBrowserProps = {
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
  unfilteredRenderedCount: number;
  pageSize: number;
  hasLiveMatches: boolean;
};

function applyPatchToParams(
  current: URLSearchParams,
  patch: Record<string, string | null>,
) {
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

function buildBrowseHref(searchParamsString: string, cursor: string) {
  const next = new URLSearchParams(searchParamsString);
  next.set("cursor", cursor);
  return `/api/archive/browse?${next.toString()}`;
}

function parseBrowsePageResponse(
  payload: unknown,
): ArchiveBrowsePageResponse | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<ArchiveBrowsePageResponse>;
  if (!Array.isArray(candidate.items)) return null;
  if (
    candidate.nextCursor !== null &&
    candidate.nextCursor !== undefined &&
    typeof candidate.nextCursor !== "string"
  ) {
    return null;
  }
  return {
    items: candidate.items,
    nextCursor: candidate.nextCursor ?? null,
  };
}

function mergeUniqueItems(
  current: ArtworkGridItem[],
  incoming: ArtworkGridItem[],
) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

function shouldShowControlShell(args: {
  unfilteredRenderedCount: number;
  matchingArchivedWorks: number;
  hasCursor: boolean;
  hasMore: boolean;
  query: string;
  status: ArchiveStatusFilter;
  media: ArchiveMediaFilter;
}) {
  return (
    args.unfilteredRenderedCount > 0 ||
    args.matchingArchivedWorks > 0 ||
    args.hasCursor ||
    args.hasMore ||
    Boolean(args.query) ||
    args.status !== "all" ||
    args.media !== "all"
  );
}

const MIN_FETCH_INTERVAL_MS = 500;
const MAX_BACKOFF_MS = 15_000;
const BASE_BACKOFF_MS = 1_000;

function parseRetryAfterHeader(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return null;
  return Math.max(0, dateMs - Date.now());
}

// eslint-disable-next-line max-lines-per-function
function useArchiveInfinitePages(
  items: ArtworkGridItem[],
  nextCursor: string | null,
  searchParamsString: string,
) {
  const [visibleItems, setVisibleItems] = useState(items);
  const [activeNextCursor, setActiveNextCursor] = useState(nextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shouldAutoload, setShouldAutoload] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const activeNextCursorRef = useRef(nextCursor);
  const isLoadingMoreRef = useRef(false);
  const isMountedRef = useRef(false);
  const shouldAutoloadRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const backoffRetriesRef = useRef(0);
  const cooldownUntilRef = useRef<number | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const loadMoreRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (resumeTimerRef.current !== null) {
        window.clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
    };
  }, []);

  useEffect(
    () => void (activeNextCursorRef.current = activeNextCursor),
    [activeNextCursor],
  );

  useEffect(
    () => void (shouldAutoloadRef.current = shouldAutoload),
    [shouldAutoload],
  );

  const clearCooldown = useCallback(() => {
    cooldownUntilRef.current = null;
    setCooldownUntil(null);
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  const scheduleResume = useCallback((untilMs: number) => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
    }
    const delay = Math.max(0, untilMs - Date.now());
    resumeTimerRef.current = window.setTimeout(() => {
      resumeTimerRef.current = null;
      if (!isMountedRef.current) return;
      if (cooldownUntilRef.current && cooldownUntilRef.current <= Date.now()) {
        cooldownUntilRef.current = null;
        setCooldownUntil(null);
      }
      if (shouldAutoloadRef.current && activeNextCursorRef.current) {
        loadMoreRef.current();
      }
    }, delay);
  }, []);

  // eslint-disable-next-line complexity
  const loadMore = useCallback(async () => {
    const currentCursor = activeNextCursorRef.current;
    if (!currentCursor || isLoadingMoreRef.current) return;

    const now = Date.now();
    const cooldownRemaining = cooldownUntilRef.current
      ? cooldownUntilRef.current - now
      : 0;
    const intervalRemaining =
      lastFetchAtRef.current + MIN_FETCH_INTERVAL_MS - now;
    const waitMs = Math.max(cooldownRemaining, intervalRemaining, 0);
    if (waitMs > 0) {
      scheduleResume(now + waitMs);
      return;
    }

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    setLoadError(null);

    try {
      const response = await fetch(
        buildBrowseHref(searchParamsString, currentCursor),
        { cache: "no-store" },
      );
      lastFetchAtRef.current = Date.now();

      if (response.status === 429 || response.status === 503) {
        const retries = backoffRetriesRef.current;
        const retryAfterMs = parseRetryAfterHeader(
          response.headers.get("retry-after"),
        );
        const fallback = Math.min(
          BASE_BACKOFF_MS * 2 ** retries,
          MAX_BACKOFF_MS,
        );
        const delay = Math.min(retryAfterMs ?? fallback, MAX_BACKOFF_MS);
        backoffRetriesRef.current = retries + 1;
        const until = Date.now() + delay;
        cooldownUntilRef.current = until;
        if (isMountedRef.current) setCooldownUntil(until);
        scheduleResume(until);
        return;
      }

      if (!response.ok) {
        throw new Error("Unable to load more archive results right now.");
      }

      const payload = parseBrowsePageResponse(await response.json());
      if (!payload || !isMountedRef.current) return;
      if (activeNextCursorRef.current !== currentCursor) return;

      backoffRetriesRef.current = 0;
      clearCooldown();

      setVisibleItems((current) => mergeUniqueItems(current, payload.items));
      setActiveNextCursor(payload.nextCursor);
    } catch (error) {
      if (!isMountedRef.current) return;
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load more archive results right now.",
      );
    } finally {
      isLoadingMoreRef.current = false;
      if (isMountedRef.current) {
        setIsLoadingMore(false);
      }
    }
  }, [clearCooldown, scheduleResume, searchParamsString]);

  useEffect(() => {
    loadMoreRef.current = () => void loadMore();
  }, [loadMore]);

  const retryNow = useCallback(() => {
    backoffRetriesRef.current = 0;
    clearCooldown();
    lastFetchAtRef.current = 0;
    void loadMore();
  }, [clearCooldown, loadMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !activeNextCursor) return;

    const observer = new IntersectionObserver(
      ([entry]) => setShouldAutoload(Boolean(entry?.isIntersecting)),
      { rootMargin: "600px 0px 600px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeNextCursor]);

  useEffect(() => {
    if (!shouldAutoload || !activeNextCursor || isLoadingMore) return;
    if (cooldownUntil && cooldownUntil > Date.now()) return;
    void loadMore();
  }, [
    activeNextCursor,
    cooldownUntil,
    isLoadingMore,
    loadMore,
    shouldAutoload,
  ]);

  return {
    activeNextCursor,
    isLoadingMore,
    loadError,
    loadMore,
    retryNow,
    cooldownUntil,
    sentinelRef,
    visibleItems,
  };
}

export function ArchiveBrowser(props: ArchiveBrowserProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isNavigating, startNavigation] = useTransition();
  const browserRef = useRef<HTMLDivElement>(null);
  const searchParamsString = searchParams.toString();
  const resetKey = [
    props.query,
    props.status,
    props.media,
    props.sort,
    searchParams.get("cursor") ?? "",
  ].join("\u0001");

  const updateSearch = useCallback<UpdateArchiveSearch>(
    (patch, options) => {
      const next = applyPatchToParams(searchParams, patch);
      if (options?.resetCursor) {
        next.delete("cursor");
      }
      const href = next.toString() ? `${pathname}?${next}` : pathname;

      if (
        options?.resetCursor &&
        browserRef.current &&
        typeof window !== "undefined"
      ) {
        const rect = browserRef.current.getBoundingClientRect();
        if (rect.top < 24 || rect.top > window.innerHeight * 0.35) {
          const reduceMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches;
          browserRef.current.scrollIntoView({
            block: "start",
            behavior: reduceMotion ? "auto" : "smooth",
          });
        }
      }

      startNavigation(() => {
        router.push(href, { scroll: false });
      });
    },
    [pathname, router, searchParams, startNavigation],
  );

  return (
    <div
      ref={browserRef}
      className="scroll-mt-[calc(var(--header-offset,64px)+16px)]"
    >
      <ArchiveBrowserSession
        key={resetKey}
        {...props}
        isNavigating={isNavigating}
        searchParamsString={searchParamsString}
        updateSearch={updateSearch}
      />
    </div>
  );
}

function ArchiveBrowserSession({
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
  unfilteredRenderedCount,
  pageSize,
  hasLiveMatches,
  isNavigating,
  searchParamsString,
  updateSearch,
}: ArchiveBrowserProps & {
  isNavigating: boolean;
  searchParamsString: string;
  updateSearch: UpdateArchiveSearch;
}) {
  const {
    activeNextCursor,
    isLoadingMore,
    loadError,
    loadMore,
    retryNow,
    cooldownUntil,
    sentinelRef,
    visibleItems,
  } = useArchiveInfinitePages(items, nextCursor, searchParamsString);

  const renderedCount = visibleItems.length;
  const filteredOut =
    unfilteredRenderedCount > 0 &&
    renderedCount === 0 &&
    !activeNextCursor &&
    !isLoadingMore;
  const showControlShell = shouldShowControlShell({
    unfilteredRenderedCount,
    matchingArchivedWorks,
    hasCursor,
    hasMore: Boolean(activeNextCursor),
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
          hasMore={Boolean(activeNextCursor)}
          isLoadingMore={isLoadingMore}
          loadError={loadError}
          cooldownUntil={cooldownUntil}
          pageSize={pageSize}
          hasLiveMatches={hasLiveMatches}
          updateSearch={updateSearch}
          onLoadMore={() => void loadMore()}
          onRetryNow={retryNow}
        />
      ) : null}

      {filteredOut ? (
        <NoVisibleMatchesPanel query={query} updateSearch={updateSearch} />
      ) : (
        <div
          aria-busy={isNavigating || isLoadingMore}
          className={cn(
            "transition-opacity duration-200",
            isNavigating ? "opacity-60" : "opacity-100",
          )}
        >
          <ArtworkGrid
            items={visibleItems}
            emptyTitle={emptyTitle}
            emptyBody={emptyBody}
            virtualize
          />
        </div>
      )}

      <InfiniteLoadStatus
        hasMore={Boolean(activeNextCursor)}
        isLoadingMore={isLoadingMore}
        loadError={loadError}
        cooldownUntil={cooldownUntil}
        renderedCount={renderedCount}
        sentinelRef={sentinelRef}
        onLoadMore={() => void loadMore()}
        onRetryNow={retryNow}
      />
    </div>
  );
}
