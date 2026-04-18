"use client";

import { motion } from "motion/react";

import { cn } from "~/lib/utils";

import { EASE } from "./constants";
import type { StatCard } from "./stats";
import { progressFillClass } from "./tone";
import type { Tone } from "./types";

function statToneTextClass(tone: Tone) {
  switch (tone) {
    case "ok":
      return "text-[var(--color-ok)]";
    case "warn":
      return "text-[var(--color-warn)]";
    case "info":
      return "text-[var(--color-info)]";
    case "err":
      return "text-[var(--color-err)]";
    case "muted":
      return "text-[var(--color-muted)]";
  }
}

function StatPulseOverlay() {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-[var(--tint-warn)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.55, 0] }}
      transition={{
        duration: 2.4,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}

function StatProgressBar({
  tone,
  progress,
  value,
}: {
  tone: Tone;
  progress: number;
  value: number;
}) {
  return (
    <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-alt)]">
      <motion.div
        className={cn("h-full rounded-full", progressFillClass(tone))}
        initial={false}
        animate={{
          width: `${Math.max(progress, value > 0 ? 6 : 0)}%`,
        }}
        transition={{ duration: 0.45, ease: EASE }}
      />
    </div>
  );
}

function StatCardTile({
  stat,
  index,
  reduce,
}: {
  stat: StatCard;
  index: number;
  reduce: boolean;
}) {
  const Icon = stat.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        ease: EASE,
        delay: reduce ? 0 : index * 0.04,
      }}
      className="relative overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-3 sm:rounded-2xl sm:px-4 sm:py-4"
    >
      {stat.pulsing ? <StatPulseOverlay /> : null}
      <div className="relative flex items-center justify-between gap-2">
        <p className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[var(--color-muted)] sm:text-[0.62rem]">
          {stat.label}
        </p>
        <Icon className={cn("h-3.5 w-3.5", statToneTextClass(stat.tone))} />
      </div>
      <p className="relative mt-1.5 font-serif text-2xl tabular-nums text-[var(--color-ink)] sm:text-3xl">
        {stat.value.toLocaleString()}
      </p>
      <p className="relative mt-1 text-[0.74rem] leading-relaxed text-[var(--color-body)]">
        {stat.hint}
      </p>
      {stat.meta ? (
        <p className="relative mt-1 text-[0.66rem] text-[var(--color-subtle)]">
          {stat.meta}
        </p>
      ) : null}
      {stat.progress !== null ? (
        <StatProgressBar
          tone={stat.tone}
          progress={stat.progress}
          value={stat.value}
        />
      ) : null}
    </motion.div>
  );
}

export function StatsGrid({
  stats,
  reduce,
}: {
  stats: Array<StatCard>;
  reduce: boolean;
}) {
  return (
    <div className="mt-5 grid w-full max-w-full min-w-0 grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
      {stats.map((stat, index) => (
        <StatCardTile
          key={stat.label}
          stat={stat}
          index={index}
          reduce={reduce}
        />
      ))}
    </div>
  );
}

export function QueueWaitingBanner({
  pendingJobs,
}: {
  pendingJobs: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--tint-warn)] px-3 py-2 text-xs text-[var(--color-warn)]"
    >
      <span
        aria-hidden
        className="dot-pulse mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-warn)]"
      />
      <span>
        {pendingJobs.toLocaleString()} work
        {pendingJobs === 1 ? "" : "s"} waiting in line. We&apos;ll work through
        them at the current pace.
      </span>
    </div>
  );
}
