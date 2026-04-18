"use client";

import { useReducedMotion } from "motion/react";

import type { ArchiveLiveSnapshot } from "~/lib/archive-live";
import { ARCHIVE_PACE_CONFIG } from "~/lib/archive-pace";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

import { ActivityPanel } from "./activity-panel";
import {
  BoardHeader,
  type BoardHeaderControlsProps,
} from "./board-header";
import { CrawlerPanel } from "./crawler-panel";
import { LiveFeedPanel } from "./live-feed-panel";
import { PipelinePanel, StatusRow } from "./pipeline-panel";
import { QueueWaitingBanner, StatsGrid } from "./stats-grid";
import { buildStatCards } from "./stats";
import { resolveSocketBadge } from "./socket-badge";
import { useArchiveLiveSnapshot } from "./use-archive-live-snapshot";
import {
  useBoardDerived,
  useWorkerStatus,
} from "./use-board-derived";

export interface ArchiveLiveBoardProps {
  initialSnapshot: ArchiveLiveSnapshot;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  showCrawler?: boolean;
  showControls?: boolean;
  hideFeed?: boolean;
}

function useArchiveBoardMutations(
  setSnapshot: (
    update: (current: ArchiveLiveSnapshot) => ArchiveLiveSnapshot,
  ) => void,
) {
  const toggleCrawlerMutation = api.archive.setAutoCrawlerEnabled.useMutation({
    onSuccess: (result) => {
      setSnapshot((current) => ({
        ...current,
        policy: current.policy
          ? {
              ...current.policy,
              autoCrawlerEnabled: result.autoCrawlerEnabled,
            }
          : current.policy,
      }));
    },
  });
  const setPaceMutation = api.archive.setArchivePace.useMutation({
    onSuccess: (result) => {
      setSnapshot((current) => ({
        ...current,
        policy: current.policy
          ? {
              ...current.policy,
              contractsPerTick: result.contractsPerTick,
            }
          : current.policy,
      }));
    },
  });

  return { toggleCrawlerMutation, setPaceMutation };
}

function buildHeaderControls(
  showControls: boolean,
  params: {
    policy: ArchiveLiveSnapshot["policy"];
    pace: ReturnType<typeof useBoardDerived>["pace"];
    toggleCrawlerMutation: ReturnType<
      typeof useArchiveBoardMutations
    >["toggleCrawlerMutation"];
    setPaceMutation: ReturnType<
      typeof useArchiveBoardMutations
    >["setPaceMutation"];
  },
): BoardHeaderControlsProps | null {
  if (!showControls || !params.policy) return null;
  const policy = params.policy;
  return {
    autoCrawlerEnabled: policy.autoCrawlerEnabled,
    toggleIsPending: params.toggleCrawlerMutation.isPending,
    onToggleCrawler: () =>
      params.toggleCrawlerMutation.mutate({
        enabled: !policy.autoCrawlerEnabled,
      }),
    pace: params.pace,
    paceIsPending: params.setPaceMutation.isPending,
    onPaceSelect: (next) => params.setPaceMutation.mutate({ pace: next }),
  };
}

function buildDrainCopy(
  drainMode: boolean,
  backlogGuard: ReturnType<typeof useBoardDerived>["backlogGuard"],
) {
  if (!drainMode || !backlogGuard) {
    return { drainModeCopy: null, drainDetail: null };
  }
  return {
    drainModeCopy: `Pausing new discoveries while the line drops below ${backlogGuard.maxPendingJobs.toLocaleString()} waiting works.`,
    drainDetail:
      "We're finishing the works already in line first. New discoveries will pick up automatically once there's room.",
  };
}

function BoardPrimaryCard({
  headerProps,
  derived,
  statusRowProps,
  stats,
  reduce,
  queueWaitingOnWorker,
  pendingJobs,
}: {
  headerProps: Parameters<typeof BoardHeader>[0];
  derived: ReturnType<typeof useBoardDerived>;
  statusRowProps: Parameters<typeof StatusRow>[0];
  stats: ReturnType<typeof buildStatCards>;
  reduce: boolean;
  queueWaitingOnWorker: boolean;
  pendingJobs: number;
}) {
  const drainCopy = buildDrainCopy(derived.drainMode, derived.backlogGuard);
  return (
    <div className="w-full max-w-full min-w-0 rounded-2xl border border-[var(--color-line)] bg-[linear-gradient(180deg,var(--color-surface),var(--color-surface-quiet))] p-4 shadow-[0_30px_90px_-70px_rgba(17,17,17,0.35)] overflow-x-hidden sm:rounded-3xl sm:p-6">
      <BoardHeader {...headerProps} />
      <StatusRow {...statusRowProps} />
      <PipelinePanel
        shares={derived.shares}
        drainModeCopy={drainCopy.drainModeCopy}
        drainDetail={drainCopy.drainDetail}
      />
      <StatsGrid stats={stats} reduce={reduce} />
      {queueWaitingOnWorker ? (
        <QueueWaitingBanner pendingJobs={pendingJobs} />
      ) : null}
    </div>
  );
}

function buildStatusRowProps(
  derived: ReturnType<typeof useBoardDerived>,
  workerStatus: ReturnType<typeof useWorkerStatus>,
  snapshot: ArchiveLiveSnapshot,
): Parameters<typeof StatusRow>[0] {
  const shouldShowWorker = Boolean(
    workerStatus.worker ?? snapshot.stats.pendingJobs > 0,
  );
  return {
    autoCrawlerEnabled: derived.policy
      ? derived.policy.autoCrawlerEnabled
      : null,
    workerIsActive: shouldShowWorker ? workerStatus.workerIsActive : null,
    workerStatusLabel: shouldShowWorker ? workerStatus.workerStatusLabel : null,
    paceLabel: derived.policy
      ? ARCHIVE_PACE_CONFIG[derived.pace].label.toLowerCase()
      : null,
    drainModeActive: derived.drainMode && derived.backlogGuard !== null,
  };
}

function BoardSecondaryGrid({
  compact,
  hideFeed,
  derived,
  latestEvent,
  snapshot,
  showCrawler,
  pulseId,
}: {
  compact: boolean;
  hideFeed: boolean;
  derived: ReturnType<typeof useBoardDerived>;
  latestEvent: Parameters<typeof ActivityPanel>[0]["latestEvent"];
  snapshot: ArchiveLiveSnapshot;
  showCrawler: boolean;
  pulseId: string | null;
}) {
  const hasQueue = snapshot.stats.pendingJobs > 0;
  return (
    <div
      className={cn(
        "grid w-full max-w-full min-w-0 gap-4 overflow-x-hidden",
        hideFeed
          ? ""
          : compact
            ? "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"
            : "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]",
      )}
    >
      <div className="min-w-0 space-y-4">
        <ActivityPanel
          heading={derived.activityHeading}
          label={derived.activityLabel}
          hasQueue={hasQueue}
          groups={derived.activityGroups}
          latestEvent={latestEvent}
          compact={compact}
        />
        {showCrawler && snapshot.crawlers.length > 0 ? (
          <CrawlerPanel crawlers={snapshot.crawlers} compact={compact} />
        ) : null}
      </div>
      {hideFeed ? null : (
        <LiveFeedPanel events={snapshot.recentEvents} pulseId={pulseId} />
      )}
    </div>
  );
}

export function ArchiveLiveBoard({
  initialSnapshot,
  title = "Live archive activity",
  subtitle = "See new works being discovered and saved in real time.",
  compact = false,
  showCrawler = true,
  showControls = false,
  hideFeed = false,
}: ArchiveLiveBoardProps) {
  const reduce = useReducedMotion();
  const {
    snapshot,
    setSnapshot,
    isConnected,
    daemonReachable,
    pulseId,
    latestEvent,
  } = useArchiveLiveSnapshot(initialSnapshot);
  const { toggleCrawlerMutation, setPaceMutation } =
    useArchiveBoardMutations(setSnapshot);
  const derived = useBoardDerived(snapshot);
  const workerStatus = useWorkerStatus(snapshot);
  const stats = buildStatCards(snapshot.stats, derived.shares);
  const badge = resolveSocketBadge(isConnected, daemonReachable);

  const headerControls = buildHeaderControls(showControls, {
    policy: derived.policy,
    pace: derived.pace,
    toggleCrawlerMutation,
    setPaceMutation,
  });
  const statusRowProps = buildStatusRowProps(derived, workerStatus, snapshot);

  return (
    <section className="w-full max-w-full min-w-0 space-y-5 overflow-x-hidden">
      <BoardPrimaryCard
        headerProps={{ title, subtitle, badge, controls: headerControls }}
        derived={derived}
        statusRowProps={statusRowProps}
        stats={stats}
        reduce={Boolean(reduce)}
        queueWaitingOnWorker={workerStatus.queueWaitingOnWorker}
        pendingJobs={snapshot.stats.pendingJobs}
      />
      <BoardSecondaryGrid
        compact={compact}
        hideFeed={hideFeed}
        derived={derived}
        latestEvent={latestEvent}
        snapshot={snapshot}
        showCrawler={showCrawler}
        pulseId={pulseId}
      />
    </section>
  );
}
