"use client";

import { motion } from "motion/react";

import { cn } from "~/lib/utils";

import { EASE } from "./constants";
import type { PipelineShares } from "./stats";

function PipelineHeading({
  drainModeCopy,
}: {
  drainModeCopy: string | null;
}) {
  return (
    <div>
      <p className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[var(--color-muted)]">
        Archive progress
      </p>
      <p className="mt-1 text-sm text-[var(--color-body)]">
        {drainModeCopy ??
          "At a glance: how much is already safe, how much is being saved now, and how much is scheduled for later."}
      </p>
    </div>
  );
}

function PipelineLegend({ shares }: { shares: PipelineShares }) {
  return (
    <div className="flex flex-wrap gap-2 text-[0.68rem] text-[var(--color-muted)]">
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-2.5 py-1"
        title="Already fully saved to the archive."
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]"
        />
        saved {Math.round(shares.preservedShare)}%
      </span>
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-2.5 py-1"
        title="Works actively waiting to be saved."
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-[var(--color-warn)]"
        />
        in line {Math.round(shares.queuedShare)}%
      </span>
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-2.5 py-1"
        title="Larger works scheduled for a later batch."
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-[var(--color-info)]"
        />
        scheduled {Math.round(shares.deferredShare)}%
      </span>
    </div>
  );
}

function PipelineBar({ shares }: { shares: PipelineShares }) {
  return (
    <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-alt)]">
      <motion.div
        className="absolute inset-y-0 left-0 bg-[var(--color-ok)]"
        initial={false}
        animate={{ width: `${shares.preservedShare}%` }}
        transition={{ duration: 0.45, ease: EASE }}
      />
      <motion.div
        className="absolute inset-y-0 bg-[var(--color-warn)]"
        initial={false}
        animate={{
          width: `${shares.queuedShare}%`,
          left: `${shares.preservedShare}%`,
        }}
        transition={{ duration: 0.45, ease: EASE }}
      />
      <motion.div
        className="absolute inset-y-0 bg-[var(--color-info)]"
        initial={false}
        animate={{
          width: `${shares.deferredShare}%`,
          left: `${shares.preservedShare + shares.queuedShare}%`,
        }}
        transition={{ duration: 0.45, ease: EASE }}
      />
    </div>
  );
}

export function PipelinePanel({
  shares,
  drainModeCopy,
  drainDetail,
}: {
  shares: PipelineShares;
  drainModeCopy: string | null;
  drainDetail: string | null;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PipelineHeading drainModeCopy={drainModeCopy} />
        <PipelineLegend shares={shares} />
      </div>
      <PipelineBar shares={shares} />
      {drainDetail ? (
        <p className="mt-3 text-xs text-[var(--color-info)]">{drainDetail}</p>
      ) : null}
    </div>
  );
}

function StatusChip({
  className,
  dotClass,
  pulse,
  title,
  children,
}: {
  className: string;
  dotClass: string;
  pulse: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          dotClass,
          pulse ? "dot-pulse" : "",
        )}
      />
      {children}
    </span>
  );
}

export interface StatusRowProps {
  autoCrawlerEnabled: boolean | null;
  workerIsActive: boolean | null;
  workerStatusLabel: string | null;
  paceLabel: string | null;
  drainModeActive: boolean;
}

function ScrapeChip({ enabled }: { enabled: boolean }) {
  return (
    <StatusChip
      className={cn(
        enabled
          ? "bg-[var(--tint-ok)] text-[var(--color-ok)]"
          : "bg-[var(--tint-warn)] text-[var(--color-warn)]",
      )}
      dotClass={enabled ? "bg-[var(--color-ok)]" : "bg-[var(--color-warn)]"}
      pulse={enabled}
      title={
        enabled
          ? "We're actively looking for new works on Foundation."
          : "Auto-discovery is paused."
      }
    >
      Discovering {enabled ? "on" : "paused"}
    </StatusChip>
  );
}

function humanizeWorkerLabel(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes("not seen")) return "Saver offline";
  if (lower.includes("stale")) return "Saver lagging";
  if (lower.includes("running")) return "Saver running";
  if (lower.includes("idle")) return "Saver idle";
  return label.replace(/^worker\s/i, "Saver ");
}

function WorkerChip({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  return (
    <StatusChip
      className={
        active
          ? "bg-[var(--tint-info)] text-[var(--color-info)]"
          : "bg-[var(--tint-muted)] text-[var(--color-muted)]"
      }
      dotClass={active ? "bg-[var(--color-info)]" : "bg-[var(--color-subtle)]"}
      pulse={active}
      title={
        active
          ? "The background save process is running and making progress."
          : "The background save process isn't active right now."
      }
    >
      {humanizeWorkerLabel(label)}
    </StatusChip>
  );
}

export function StatusRow({
  autoCrawlerEnabled,
  workerIsActive,
  workerStatusLabel,
  paceLabel,
  drainModeActive,
}: StatusRowProps) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
      {autoCrawlerEnabled !== null ? (
        <ScrapeChip enabled={autoCrawlerEnabled} />
      ) : null}
      {workerStatusLabel !== null && workerIsActive !== null ? (
        <WorkerChip active={workerIsActive} label={workerStatusLabel} />
      ) : null}
      {paceLabel ? (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line-strong)] px-2.5 py-1 text-[var(--color-muted)]"
          title="How quickly we find and save new works."
        >
          Pace {paceLabel}
        </span>
      ) : null}
      {drainModeActive ? (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-[var(--tint-info)] px-2.5 py-1 text-[var(--color-info)]"
          title="The line is long — we're finishing current saves before looking for more."
        >
          Catching up
        </span>
      ) : null}
    </div>
  );
}
