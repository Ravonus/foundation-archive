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
  const sentinelRef = useRef<HTMLDivElement>(null);
  const activeNextCursorRef = useRef(nextCursor);
  const isLoadingMoreRef = useRef(false);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => void (isMountedRef.current = false);
  }, []);

  useEffect(
    () => void (activeNextCursorRef.current = activeNextCursor),
    [activeNextCursor],
  );

  const loadMore = useCallback(async () => {
    const currentCursor = activeNextCursorRef.current;
    if (!currentCursor || isLoadingMoreRef.current) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    setLoadError(null);

    try {
      const response = await fetch(
        buildBrowseHref(searchParamsString, currentCursor),
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error("Unable to load more archive results right now.");
      }

      const payload = parseBrowsePageResponse(await response.json());
      if (!payload || !isMountedRef.current) return;
      if (activeNextCursorRef.current !== currentCursor) return;

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
  }, [searchParamsString]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !activeNextCursor) return;

    const observer = new IntersectionObserver(
      ([entry]) => setShouldAutoload(Boolean(entry?.isIntersecting)),
      { rootMargin: "1200px 0px 1200px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeNextCursor]);

  useEffect(() => {
    if (!shouldAutoload || !activeNextCursor || isLoadingMore) return;
    void loadMore();
  }, [activeNextCursor, isLoadingMore, loadMore, shouldAutoload]);

  return {
    activeNextCursor,
    isLoadingMore,
    loadError,
    loadMore,
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
          pageSize={pageSize}
          hasLiveMatches={hasLiveMatches}
          updateSearch={updateSearch}
          onLoadMore={() => void loadMore()}
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
        renderedCount={renderedCount}
        sentinelRef={sentinelRef}
        onLoadMore={() => void loadMore()}
      />
    </div>
  );
}
