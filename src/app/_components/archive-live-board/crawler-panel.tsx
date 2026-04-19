"use client";

import { ChainBadge } from "~/app/_components/chain-badge";
import type { ArchiveLiveSnapshot } from "~/lib/archive-live";

type Crawler = ArchiveLiveSnapshot["crawlers"][number];

function CrawlerRow({ crawler }: { crawler: Crawler }) {
  const modeLabel = crawler.scanMode === "api" ? "page " : "block ";
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-quiet)] px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm text-[var(--color-ink)]">
            <ChainBadge chainId={crawler.chainId} />
            <span className="truncate">{crawler.label}</span>
          </p>
          <p className="mt-0.5 truncate font-mono text-[0.62rem] uppercase tracking-[0.14em] text-[var(--color-muted)]">
            {crawler.contractAddress}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full bg-[var(--tint-info)] px-2 py-0.5 text-[0.68rem] text-[var(--color-info)]"
          title="Current checkpoint we're scanning from"
        >
          {modeLabel}
          {crawler.nextFromBlock.toLocaleString()}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.68rem] text-[var(--color-muted)]">
        <span title="Total works found so far in this collection">
          {crawler.totalDiscoveredCount} found
        </span>
        <span title="Works found on the most recent scan">
          last {crawler.lastDiscoveredCount}
        </span>
        <span
          className={
            crawler.completed
              ? "text-[var(--color-ok)]"
              : "text-[var(--color-info)]"
          }
        >
          {crawler.completed ? "done" : "scanning"}
        </span>
      </div>
    </div>
  );
}

export function CrawlerPanel({
  crawlers,
  compact,
}: {
  crawlers: Array<Crawler>;
  compact: boolean;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 sm:p-5">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.24em] text-[var(--color-muted)]">
            Collections we watch
          </p>
          <h3 className="mt-1 font-serif text-xl text-[var(--color-ink)] sm:text-2xl">
            What we&apos;re scanning
          </h3>
        </div>
        <span
          className="rounded-full bg-[var(--tint-muted)] px-2.5 py-1 text-xs text-[var(--color-muted)]"
          title="Number of collections being actively scanned"
        >
          {crawlers.length} active
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        {crawlers.slice(0, compact ? 3 : 5).map((crawler) => (
          <CrawlerRow
            key={`${crawler.chainId}:${crawler.contractAddress}`}
            crawler={crawler}
          />
        ))}
      </div>
    </div>
  );
}
