"use client";

import { Radio, TimerReset } from "lucide-react";

import type { ArchiveLiveEvent } from "~/lib/archive-live";

import { ActivityCarousel } from "./activity-carousel";
import type { ActivityGroup } from "./types";

function ActivityHeader({
  heading,
  label,
  hasQueue,
  queuedUpdateCount,
}: {
  heading: string;
  label: string;
  hasQueue: boolean;
  queuedUpdateCount: number;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.24em] text-[var(--color-muted)]">
          {label}
        </p>
        <h3 className="mt-1 font-serif text-xl text-[var(--color-ink)] sm:text-2xl">
          {heading}
        </h3>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-[var(--color-muted)]">
        {queuedUpdateCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-[var(--color-body)]">
            <TimerReset className="h-3.5 w-3.5 text-[var(--color-info)]" />
            {queuedUpdateCount} waiting to surface
          </span>
        ) : null}
        {hasQueue ? (
          <span
            aria-hidden
            className="dot-pulse h-1.5 w-1.5 rounded-full bg-[var(--color-info)]"
          />
        ) : null}
        <Radio className="h-3.5 w-3.5 text-[var(--color-subtle)]" />
      </div>
    </div>
  );
}

function ActivityQueueCard({
  latestEvent,
  queuedUpdateCount,
}: {
  latestEvent: ArchiveLiveEvent | null;
  queuedUpdateCount: number;
}) {
  return (
    <div className="mb-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[var(--color-muted)]">
          Fresh arrivals
        </p>
        <span className="rounded-full bg-[var(--tint-info)] px-2.5 py-1 text-[0.68rem] text-[var(--color-info)]">
          One item at a time
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink)]">
        {latestEvent?.summary ??
          "New works will settle here one at a time as the archive moves."}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">
        {queuedUpdateCount > 0
          ? `${queuedUpdateCount} more recent update${queuedUpdateCount === 1 ? "" : "s"} are queued behind this so the board stays readable during bursts.`
          : "We hold each fresh item on screen a little longer so the board feels calmer while the worker keeps going."}
      </p>
    </div>
  );
}

export function ActivityPanel({
  heading,
  label,
  hasQueue,
  groups,
  latestEvent,
  queuedUpdateCount,
  compact,
}: {
  heading: string;
  label: string;
  hasQueue: boolean;
  groups: Array<ActivityGroup>;
  latestEvent: ArchiveLiveEvent | null;
  queuedUpdateCount: number;
  compact: boolean;
}) {
  return (
    <>
      <ActivityHeader
        heading={heading}
        label={label}
        hasQueue={hasQueue}
        queuedUpdateCount={queuedUpdateCount}
      />
      <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 sm:p-4">
        <ActivityCarousel
          groups={groups}
          latestEvent={latestEvent}
          compact={compact}
        />
      </div>
    </>
  );
}
