"use client";

import { useArchiveLiveSnapshot } from "~/app/_components/archive-live-board/use-archive-live-snapshot";
import { CountUp, FadeUp } from "~/app/_components/motion";
import type { ArchiveLiveSnapshot } from "~/lib/archive-live";

/// Client-side hero counters. Subscribes to the shared archive live
/// snapshot (same socket the ArchiveLiveBoard uses) so the counts tick
/// in near-real-time as the worker emits `archive:update` events — no
/// more waiting 5-30 s for the next SSR re-render before the numbers
/// move.
export function HeroStats({
  initialSnapshot,
}: {
  initialSnapshot: ArchiveLiveSnapshot;
}) {
  const { snapshot } = useArchiveLiveSnapshot(initialSnapshot);
  const artworkCount = snapshot.stats.artworks;
  const pinnedRootCount = snapshot.stats.pinnedRoots;
  const pendingJobCount = snapshot.stats.pendingJobs;

  return (
    <FadeUp delay={0.75} duration={0.5}>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[0.7rem] uppercase tracking-[0.22em] text-[var(--color-muted)]">
        <span
          className="inline-flex items-center gap-2"
          title="Works we know about and are saving."
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]"
          />
          <CountUp value={artworkCount} /> work
          {artworkCount === 1 ? "" : "s"} tracked
        </span>
        <span
          className="inline-flex items-center gap-2"
          title="Files fully saved to the archive."
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-info)]"
          />
          <CountUp value={pinnedRootCount} /> file
          {pinnedRootCount === 1 ? "" : "s"} saved
        </span>
        {pendingJobCount > 0 ? (
          <span
            className="inline-flex items-center gap-2"
            title="Works waiting in line to be saved."
          >
            <span
              aria-hidden
              className="dot-pulse h-1.5 w-1.5 rounded-full bg-[var(--color-warn)]"
            />
            <CountUp value={pendingJobCount} /> in line
          </span>
        ) : null}
      </div>
    </FadeUp>
  );
}
