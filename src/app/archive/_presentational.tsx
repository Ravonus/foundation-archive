"use client";

import { useEffect, useRef, useState } from "react";
import { Info, Search } from "lucide-react";

import { CountUp, FadeUp } from "~/app/_components/motion";
import { SearchShortcutHint } from "~/app/_components/search-shortcut-hint";
import {
  type ArchiveMediaFilter,
  type ArchiveSort,
  type ArchiveStatusFilter,
} from "~/lib/archive-browse";

type HeaderStatsProps = {
  totalIndexedWorks: number;
  publicQueueCount: number;
};

function HeaderStats({ totalIndexedWorks, publicQueueCount }: HeaderStatsProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--color-muted)]">
      <span
        className="inline-flex items-center gap-1.5"
        title="Works we know about and are saving."
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]"
        />
        <CountUp value={totalIndexedWorks} /> tracked
      </span>
      <span
        className="inline-flex items-center gap-1.5"
        title="Works waiting in line to be saved."
      >
        <span
          aria-hidden
          className={
            publicQueueCount > 0
              ? "dot-pulse h-1.5 w-1.5 rounded-full bg-[var(--color-warn)]"
              : "h-1.5 w-1.5 rounded-full bg-[var(--color-subtle)]"
          }
        />
        <CountUp value={publicQueueCount} /> in line
      </span>
    </div>
  );
}

type ArchiveSearchFormProps = {
  query: string;
  sort: ArchiveSort;
  status: ArchiveStatusFilter;
  media: ArchiveMediaFilter;
  compact?: boolean;
};

function ArchiveSearchForm({
  query,
  sort,
  status,
  media,
  compact = false,
}: ArchiveSearchFormProps) {
  return (
    <form
      action="/archive"
      role="search"
      aria-label="Search the archive"
      className={`flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] transition-[padding,margin] duration-300 ease-out focus-within:border-[var(--color-ink)] ${
        compact
          ? "mt-0 px-3 py-1 sm:px-3.5"
          : "mt-4 px-4 py-2.5 sm:px-5 sm:py-3"
      }`}
    >
      <Search
        aria-hidden
        className="h-4 w-4 shrink-0 text-[var(--color-subtle)]"
      />
      <label className="sr-only" htmlFor="archive-search">
        Search by artist, title, or Foundation link
      </label>
      <input
        id="archive-search"
        name="q"
        defaultValue={query}
        placeholder="Try an artist's name, title, or paste a Foundation link"
        className={`min-w-0 flex-1 bg-transparent text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-subtle)] ${
          compact ? "h-6" : "h-7 sm:text-[0.95rem]"
        }`}
      />
      <SearchShortcutHint />
      <input type="hidden" name="sort" value={sort} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="media" value={media} />
      <button
        type="submit"
        className={`inline-flex shrink-0 items-center rounded-full bg-[var(--color-ink)] text-sm text-[var(--color-bg)] transition-[padding] duration-300 ease-out hover:opacity-90 ${
          compact ? "px-3 py-1" : "px-3.5 py-1.5 sm:px-4"
        }`}
      >
        Search
      </button>
    </form>
  );
}

type ResultsSummaryProps = {
  query: string;
  archivedShown: number;
  liveOnlyShown: number;
  profileCount: number;
};

function ResultsSummary({
  query,
  archivedShown,
  liveOnlyShown,
  profileCount,
}: ResultsSummaryProps) {
  if (!query) return null;
  return (
    <FadeUp delay={0.15} duration={0.4}>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--color-muted)]">
        <span>
          Results for &ldquo;
          <span className="text-[var(--color-ink)]">{query}</span>&rdquo;
        </span>
        <span className="text-[var(--color-subtle)]">·</span>
        <span>{archivedShown} saved</span>
        {liveOnlyShown > 0 ? (
          <>
            <span className="text-[var(--color-subtle)]">·</span>
            <span>{liveOnlyShown} on Foundation (not saved yet)</span>
          </>
        ) : null}
        {profileCount > 0 ? (
          <>
            <span className="text-[var(--color-subtle)]">·</span>
            <span>
              {profileCount} profile{profileCount === 1 ? "" : "s"}
            </span>
          </>
        ) : null}
      </div>
    </FadeUp>
  );
}

export type ArchiveStickyHeaderProps = {
  query: string;
  sort: ArchiveSort;
  status: ArchiveStatusFilter;
  media: ArchiveMediaFilter;
  totalIndexedWorks: number;
  publicQueueCount: number;
  archivedShown: number;
  liveOnlyShown: number;
  profileCount: number;
};

export function ArchiveStickyHeader(props: ArchiveStickyHeaderProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setStuck(!!entry && !entry.isIntersecting),
      { rootMargin: "-65px 0px 0px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-0" />
      <div
        className={`sticky top-[calc(var(--header-offset,64px))] z-30 -mx-4 border-b border-[var(--color-line)] bg-[var(--color-bg)]/90 px-4 backdrop-blur-md transition-[padding] duration-300 ease-out sm:-mx-6 sm:px-6 ${
          stuck ? "pt-2 pb-2" : "pt-6 pb-4 sm:pt-8"
        }`}
      >
        <div
          className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out ${
            stuck ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
          }`}
          aria-hidden={stuck}
        >
          <div className="min-h-0">
            <FadeUp duration={0.4}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
                    Archive
                  </p>
                  <h1 className="mt-1 font-serif text-3xl leading-tight text-[var(--color-ink)] sm:text-4xl">
                    Search the archive
                  </h1>
                </div>
                <HeaderStats
                  totalIndexedWorks={props.totalIndexedWorks}
                  publicQueueCount={props.publicQueueCount}
                />
              </div>
            </FadeUp>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <FadeUp delay={0.1} duration={0.4} className="min-w-0 flex-1">
            <ArchiveSearchForm
              query={props.query}
              sort={props.sort}
              status={props.status}
              media={props.media}
              compact={stuck}
            />
          </FadeUp>
          <div
            className={`hidden shrink-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-out sm:block ${
              stuck ? "max-w-[360px] opacity-100" : "pointer-events-none max-w-0 opacity-0"
            }`}
            aria-hidden={!stuck}
          >
            <HeaderStats
              totalIndexedWorks={props.totalIndexedWorks}
              publicQueueCount={props.publicQueueCount}
            />
          </div>
        </div>

        <div
          className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out ${
            stuck ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
          }`}
          aria-hidden={stuck}
        >
          <div className="min-h-0">
            <ResultsSummary
              query={props.query}
              archivedShown={props.archivedShown}
              liveOnlyShown={props.liveOnlyShown}
              profileCount={props.profileCount}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export function ArchiveInfoDetails() {
  return (
    <details className="group mt-6 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]">
        <span className="inline-flex items-center gap-2">
          <Info className="h-3.5 w-3.5" />
          How the archive works
        </span>
        <span className="font-mono text-xs transition group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div className="grid gap-3 border-t border-[var(--color-line)] px-4 py-4 sm:grid-cols-2 sm:px-5">
        <div>
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
            The public archive
          </p>
          <p className="mt-2 text-sm text-[var(--color-body)]">
            We continuously scan Foundation and save new works automatically.
            Searching for something just moves it to the front of the line.
          </p>
        </div>
        <div>
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
            Keep your own copy (optional)
          </p>
          <p className="mt-2 text-sm text-[var(--color-body)]">
            Artists and collectors can also save works to their own computer
            from the work&apos;s page. It&apos;s optional. The public archive
            works without it.
          </p>
        </div>
      </div>
    </details>
  );
}
