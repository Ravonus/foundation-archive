"use client";

import { LoaderCircle, Pause, Play } from "lucide-react";

import {
  ARCHIVE_PACE_CONFIG,
  type ArchivePace,
} from "~/lib/archive-pace";
import { cn } from "~/lib/utils";

import type { SocketBadge } from "./types";

function SocketBadgeChip({ badge }: { badge: SocketBadge }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.14em]",
        badge.className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          badge.dotClass,
          badge.pulse ? "dot-pulse" : "",
        )}
      />
      {badge.label}
    </span>
  );
}

function HeaderCopy({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle: string;
  badge: SocketBadge;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
          Live updates
        </p>
        <SocketBadgeChip badge={badge} />
      </div>
      <h2 className="mt-1.5 font-serif text-2xl leading-tight text-[var(--color-ink)] sm:text-3xl">
        {title}
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)]">
        {subtitle}
      </p>
    </div>
  );
}

function CrawlerToggleButton({
  autoCrawlerEnabled,
  isPending,
  onToggle,
}: {
  autoCrawlerEnabled: boolean;
  isPending: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isPending}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition hover:opacity-90 disabled:opacity-50",
        autoCrawlerEnabled
          ? "bg-[var(--color-ink)] text-[var(--color-bg)]"
          : "bg-[var(--color-ok)] text-white",
      )}
    >
      {isPending ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : autoCrawlerEnabled ? (
        <Pause className="h-3.5 w-3.5" />
      ) : (
        <Play className="h-3.5 w-3.5" />
      )}
      {autoCrawlerEnabled ? "Pause discovery" : "Start discovery"}
    </button>
  );
}

interface PaceSelectorProps {
  pace: ArchivePace;
  isPending: boolean;
  onSelect: (next: ArchivePace) => void;
}

function PaceSelector({ pace, isPending, onSelect }: PaceSelectorProps) {
  const options: Array<{ key: ArchivePace; label: string }> = Object.values(
    ARCHIVE_PACE_CONFIG,
  );
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {options.map((option) => {
        const selected = pace === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onSelect(option.key)}
            disabled={isPending}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition disabled:opacity-50",
              selected
                ? "bg-[var(--color-ink)] text-[var(--color-bg)]"
                : "border border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-ink)]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export interface BoardHeaderControlsProps {
  autoCrawlerEnabled: boolean;
  toggleIsPending: boolean;
  onToggleCrawler: () => void;
  pace: ArchivePace;
  paceIsPending: boolean;
  onPaceSelect: (next: ArchivePace) => void;
}

function BoardHeaderControls(props: BoardHeaderControlsProps) {
  return (
    <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
      <CrawlerToggleButton
        autoCrawlerEnabled={props.autoCrawlerEnabled}
        isPending={props.toggleIsPending}
        onToggle={props.onToggleCrawler}
      />
      <PaceSelector
        pace={props.pace}
        isPending={props.paceIsPending}
        onSelect={props.onPaceSelect}
      />
    </div>
  );
}

export function BoardHeader({
  title,
  subtitle,
  badge,
  controls,
}: {
  title: string;
  subtitle: string;
  badge: SocketBadge;
  controls: BoardHeaderControlsProps | null;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <HeaderCopy title={title} subtitle={subtitle} badge={badge} />
      {controls ? <BoardHeaderControls {...controls} /> : null}
    </div>
  );
}
