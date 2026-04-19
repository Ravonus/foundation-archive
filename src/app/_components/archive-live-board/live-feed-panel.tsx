"use client";

import { AnimatePresence } from "motion/react";

import type { ArchiveLiveEvent } from "~/lib/archive-live";

import { EventItem } from "./event-item";

function LiveFeedHeader({
  total,
  queuedUpdateCount,
}: {
  total: number;
  queuedUpdateCount: number;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.24em] text-[var(--color-muted)]">
          Live feed
        </p>
        <h3 className="mt-1 font-serif text-xl text-[var(--color-ink)] sm:text-2xl">
          What&apos;s happening now
        </h3>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-[var(--color-muted)]">
          Fresh updates are batched and surfaced steadily so this feed stays
          readable even when the worker gets busy.
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className="rounded-full border border-[var(--color-line-strong)] px-2.5 py-1 text-xs text-[var(--color-muted)]"
          title="Number of visible recent events"
        >
          {total} visible
        </span>
        {queuedUpdateCount > 0 ? (
          <span className="rounded-full bg-[var(--tint-info)] px-2.5 py-1 text-[0.68rem] text-[var(--color-info)]">
            {queuedUpdateCount} queued
          </span>
        ) : null}
      </div>
    </div>
  );
}

function EmptyFeedState() {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-line-strong)] px-4 py-8 text-center text-sm text-[var(--color-muted)]">
      It&apos;s quiet right now. New activity will appear here as it happens.
    </div>
  );
}

export function LiveFeedPanel({
  events,
  pulseId,
  queuedUpdateCount,
}: {
  events: Array<ArchiveLiveEvent>;
  pulseId: string | null;
  queuedUpdateCount: number;
}) {
  return (
    <div className="min-w-0 space-y-3">
      <LiveFeedHeader total={events.length} queuedUpdateCount={queuedUpdateCount} />
      <div className="min-w-0 h-[30rem] space-y-2 overflow-y-auto pr-1 [overflow-anchor:none] [contain:layout_paint] lg:h-[44rem]">
        <AnimatePresence initial={false}>
          {events.map((event) => (
            <EventItem
              key={event.id}
              event={event}
              highlighted={event.id === pulseId}
            />
          ))}
        </AnimatePresence>
        {events.length === 0 ? <EmptyFeedState /> : null}
      </div>
    </div>
  );
}
