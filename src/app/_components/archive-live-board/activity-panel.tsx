"use client";

import { Radio } from "lucide-react";

import type { ArchiveLiveEvent } from "~/lib/archive-live";

import { ActivityCarousel } from "./activity-carousel";
import type { ActivityGroup } from "./types";

function ActivityHeader({
  heading,
  label,
  hasQueue,
}: {
  heading: string;
  label: string;
  hasQueue: boolean;
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
      <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
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

export function ActivityPanel({
  heading,
  label,
  hasQueue,
  groups,
  latestEvent,
  compact,
}: {
  heading: string;
  label: string;
  hasQueue: boolean;
  groups: Array<ActivityGroup>;
  latestEvent: ArchiveLiveEvent | null;
  compact: boolean;
}) {
  return (
    <>
      <ActivityHeader heading={heading} label={label} hasQueue={hasQueue} />
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
