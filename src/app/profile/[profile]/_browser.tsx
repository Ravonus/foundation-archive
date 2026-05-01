"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type ArtworkGridItem,
  ArtworkGrid,
} from "~/app/_components/artwork-grid";

import { type ProfileCursorState, type ProfileView } from "./_types";

type BrowsePageResponse = {
  items: ArtworkGridItem[];
  seenKeys: string[];
  dbCursor: string | null;
  foundationPage: number | null;
  foundationExhausted: boolean;
};

type ProfileBrowserProps = {
  profile: string;
  view: ProfileView;
  initialItems: ArtworkGridItem[];
  initialSeenKeys: string[];
  initialCursor: ProfileCursorState;
  emptyFallback: React.ReactNode;
};

const MIN_FETCH_INTERVAL_MS = 500;

function itemKey(item: ArtworkGridItem) {
  return `${item.contractAddress.toLowerCase()}:${item.tokenId}`;
}

function buildBrowseHref(args: {
  profile: string;
  view: ProfileView;
  mode: "db" | "foundation";
  dbCursor: string | null;
  foundationPage: number;
}) {
  const params = new URLSearchParams();
  params.set("view", args.view);
  params.set("mode", args.mode);
  if (args.mode === "db" && args.dbCursor) {
    params.set("cursor", args.dbCursor);
  }
  if (args.mode === "foundation") {
    params.set("page", String(args.foundationPage));
  }
  return `/api/profile/${encodeURIComponent(args.profile)}/browse?${params.toString()}`;
}

function parseResponse(payload: unknown): BrowsePageResponse | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<BrowsePageResponse>;
  if (!Array.isArray(candidate.items)) return null;
  if (!Array.isArray(candidate.seenKeys)) return null;
  if (
    candidate.dbCursor !== null &&
    candidate.dbCursor !== undefined &&
    typeof candidate.dbCursor !== "string"
  ) {
    return null;
  }
  return {
    items: candidate.items,
    seenKeys: candidate.seenKeys.filter(
      (k): k is string => typeof k === "string",
    ),
    dbCursor: candidate.dbCursor ?? null,
    foundationPage:
      typeof candidate.foundationPage === "number"
        ? candidate.foundationPage
        : null,
    foundationExhausted: Boolean(candidate.foundationExhausted),
  };
}

function hasMore(cursor: ProfileCursorState, view: ProfileView) {
  if (cursor.dbCursor) return true;
  if (view === "saved" || view === "syncing") return false;
  return !cursor.foundationExhausted;
}

function mergeNewItems(
  current: ArtworkGridItem[],
  incoming: ArtworkGridItem[],
  seen: Set<string>,
) {
  const fresh: ArtworkGridItem[] = [];
  for (const item of incoming) {
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(item);
  }
  return current.concat(fresh);
}

async function fetchBrowsePage(args: {
  profile: string;
  view: ProfileView;
  mode: "db" | "foundation";
  dbCursor: string | null;
  foundationPage: number;
}): Promise<BrowsePageResponse | null> {
  const response = await fetch(buildBrowseHref(args), { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load more works right now.");
  return parseResponse(await response.json());
}

function advanceCursor(
  current: ProfileCursorState,
  mode: "db" | "foundation",
  payload: BrowsePageResponse,
): ProfileCursorState {
  if (mode === "db") {
    return { ...current, dbCursor: payload.dbCursor };
  }
  return {
    ...current,
    foundationPage: payload.foundationPage ?? current.foundationPage + 1,
    foundationExhausted: payload.foundationExhausted,
  };
}

function modeForCursor(cursor: ProfileCursorState): "db" | "foundation" {
  return cursor.dbCursor ? "db" : "foundation";
}

function mergePayloadItems(
  current: ArtworkGridItem[],
  payload: BrowsePageResponse,
  seen: Set<string>,
) {
  const merged = mergeNewItems(current, payload.items, seen);
  for (const key of payload.seenKeys) seen.add(key);
  return merged;
}

function cursorUnchanged(
  before: ProfileCursorState,
  after: ProfileCursorState,
) {
  return (
    after.dbCursor === before.dbCursor &&
    after.foundationPage === before.foundationPage &&
    after.foundationExhausted === before.foundationExhausted
  );
}

function loadErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function ProfileBrowser(props: ProfileBrowserProps) {
  const resetKey = [
    props.profile,
    props.view,
    props.initialCursor.dbCursor ?? "",
    props.initialCursor.foundationPage,
    props.initialCursor.foundationExhausted ? "1" : "0",
    props.initialItems.length,
  ].join("\u0001");

  return <ProfileBrowserSession key={resetKey} {...props} />;
}

function ProfileBrowserSession({
  profile,
  view,
  initialItems,
  initialSeenKeys,
  initialCursor,
  emptyFallback,
}: ProfileBrowserProps) {
  const [items, setItems] = useState<ArtworkGridItem[]>(initialItems);
  const [cursor, setCursor] = useState<ProfileCursorState>(initialCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const seenKeysRef = useRef<Set<string>>(new Set(initialSeenKeys));
  const isLoadingRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingRef.current || !hasMore(cursor, view)) return;
    if (Date.now() - lastFetchAtRef.current < MIN_FETCH_INTERVAL_MS) return;

    const mode = modeForCursor(cursor);
    isLoadingRef.current = true;
    setIsLoadingMore(true);
    setLoadError(null);

    try {
      const payload = await fetchBrowsePage({
        profile,
        view,
        mode,
        dbCursor: cursor.dbCursor,
        foundationPage: cursor.foundationPage,
      });
      lastFetchAtRef.current = Date.now();
      if (!payload) return;
      if (!isMountedRef.current) return;

      setItems((current) => {
        return mergePayloadItems(current, payload, seenKeysRef.current);
      });
      setCursor((current) => advanceCursor(current, mode, payload));
    } catch (error) {
      if (!isMountedRef.current) return;
      setLoadError(
        loadErrorMessage(error, "Unable to load more works right now."),
      );
    } finally {
      isLoadingRef.current = false;
      if (isMountedRef.current) setIsLoadingMore(false);
    }
  }, [cursor, profile, view]);

  const loadAll = useCallback(async () => {
    if (isLoadingRef.current || !hasMore(cursor, view)) return;

    let nextCursor = cursor;
    isLoadingRef.current = true;
    setIsLoadingAll(true);
    setLoadError(null);

    try {
      while (hasMore(nextCursor, view)) {
        const mode = modeForCursor(nextCursor);
        const payload = await fetchBrowsePage({
          profile,
          view,
          mode,
          dbCursor: nextCursor.dbCursor,
          foundationPage: nextCursor.foundationPage,
        });
        lastFetchAtRef.current = Date.now();
        if (!payload) return;
        if (!isMountedRef.current) return;

        setItems((current) => {
          return mergePayloadItems(current, payload, seenKeysRef.current);
        });

        const advanced = advanceCursor(nextCursor, mode, payload);
        setCursor(advanced);
        if (cursorUnchanged(nextCursor, advanced)) break;
        nextCursor = advanced;
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      setLoadError(
        loadErrorMessage(error, "Unable to load all works right now."),
      );
    } finally {
      isLoadingRef.current = false;
      if (isMountedRef.current) setIsLoadingAll(false);
    }
  }, [cursor, profile, view]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    if (!hasMore(cursor, view)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px 0px 600px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, loadMore, view]);

  const moreAvailable = hasMore(cursor, view);

  if (items.length === 0 && !moreAvailable) {
    return <>{emptyFallback}</>;
  }

  return (
    <div className="space-y-5">
      <ArtworkGrid
        items={items}
        emptyTitle="Nothing in this slice yet"
        emptyBody="As works are found or move through the archive, they'll appear here automatically."
        virtualize
      />
      <div ref={sentinelRef} aria-hidden className="h-16 w-full" />
      <LoadMoreFooter
        hasMore={moreAvailable}
        isLoading={isLoadingMore || isLoadingAll}
        isLoadingAll={isLoadingAll}
        loadError={loadError}
        onLoadAll={() => void loadAll()}
        onLoadMore={() => void loadMore()}
        rendered={items.length > 0}
      />
    </div>
  );
}

function LoadMoreFooter({
  hasMore: more,
  isLoading,
  isLoadingAll,
  loadError,
  onLoadAll,
  onLoadMore,
  rendered,
}: {
  hasMore: boolean;
  isLoading: boolean;
  isLoadingAll: boolean;
  loadError: string | null;
  onLoadAll: () => void;
  onLoadMore: () => void;
  rendered: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2 pb-4 text-sm text-[var(--color-muted)]">
      {loadError ? (
        <div className="flex flex-col items-center gap-2">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={onLoadMore}
            className="rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-1.5 text-xs text-[var(--color-ink)] hover:bg-[var(--color-surface-quiet)]"
          >
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <span>
          {isLoadingAll ? "Loading all works..." : "Loading more works..."}
        </span>
      ) : more ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onLoadMore}
            className="rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-1.5 text-xs text-[var(--color-ink)] hover:bg-[var(--color-surface-quiet)]"
          >
            Load more
          </button>
          <button
            type="button"
            onClick={onLoadAll}
            className="rounded-full bg-[var(--color-ink)] px-4 py-1.5 text-xs font-medium text-[var(--color-bg)] hover:opacity-90"
          >
            View all
          </button>
        </div>
      ) : rendered ? (
        <span className="text-xs text-[var(--color-muted)]">
          Reached the end of this view.
        </span>
      ) : null}
    </div>
  );
}
