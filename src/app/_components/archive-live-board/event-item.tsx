"use client";

import { motion } from "motion/react";

import type { ArchiveLiveEvent } from "~/lib/archive-live";
import { cn, formatBytes, formatDate } from "~/lib/utils";

import { EASE } from "./constants";
import { eventTone, toneClass, toneDotClass } from "./tone";

export function EventItem({
  event,
  highlighted,
}: {
  event: ArchiveLiveEvent;
  highlighted: boolean;
}) {
  const tone = eventTone(event.type);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        backgroundColor: highlighted
          ? "var(--color-surface-alt)"
          : "var(--color-surface)",
      }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="rounded-xl border border-[var(--color-line)] px-3 py-2.5 sm:px-4 sm:py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                toneDotClass(tone),
                tone === "info" || tone === "warn" ? "dot-pulse" : "",
              )}
            />
            <p className="truncate text-sm text-[var(--color-ink)]">
              {event.summary}
            </p>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-3.5 text-xs text-[var(--color-muted)]">
            <span>{formatDate(event.createdAt)}</span>
            {event.sizeBytes ? <span>{formatBytes(event.sizeBytes)}</span> : null}
            {event.artwork?.title ? (
              <span className="max-w-[14rem] truncate">
                {event.artwork.title}
              </span>
            ) : null}
          </div>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.14em]",
            toneClass(tone),
          )}
        >
          {event.type.split(".").slice(-1)[0]}
        </span>
      </div>
    </motion.div>
  );
}
