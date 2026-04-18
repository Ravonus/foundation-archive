import { useMemo } from "react";

import type {
  ArchiveLiveArtworkCard,
  ArchiveLiveSnapshot,
} from "~/lib/archive-live";
import {
  archiveIngressGuardForPendingJobs,
  archivePaceFromContractsPerTick,
} from "~/lib/archive-pace";

import { activityGroupKey, isArtworkCard } from "./activity-signal";
import { computePipelineShares } from "./stats";
import type { ActivityGroup } from "./types";

function resolveSourceActivity(
  snapshot: ArchiveLiveSnapshot,
): Array<ArchiveLiveArtworkCard> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const archived = snapshot.latestArchived ?? [];
  if (archived.length > 0) return archived;
  return snapshot.recentEvents
    .map((event) => event.artwork)
    .filter(isArtworkCard);
}

function groupActivity(
  source: Array<ArchiveLiveArtworkCard>,
): Array<ActivityGroup> {
  const map = new Map<string, ActivityGroup>();
  for (const artwork of source) {
    const key = activityGroupKey(artwork);
    const existing = map.get(key);
    if (existing) {
      existing.sharedCount += 1;
      continue;
    }
    map.set(key, { artwork, key, sharedCount: 1 });
  }
  return Array.from(map.values());
}

export function useBoardDerived(snapshot: ArchiveLiveSnapshot) {
  const shares = useMemo(
    () => computePipelineShares(snapshot.stats),
    [snapshot.stats],
  );

  const policy = snapshot.policy;
  const pace = archivePaceFromContractsPerTick(policy?.contractsPerTick);
  const backlogGuard = policy
    ? archiveIngressGuardForPendingJobs(
        policy.contractsPerTick,
        snapshot.stats.pendingJobs,
        policy.discoveryPerPage,
      )
    : null;
  const drainMode = Boolean(
    policy?.autoCrawlerEnabled && backlogGuard?.pauseIngress,
  );

  const sourceActivity = useMemo(
    () => resolveSourceActivity(snapshot),
    [snapshot],
  );
  const activityGroups = useMemo(
    () => groupActivity(sourceActivity),
    [sourceActivity],
  );

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const hasLatestArchived = (snapshot.latestArchived ?? []).length > 0;
  const activityHeading = hasLatestArchived
    ? "Recently saved"
    : "Recently discovered";
  const activityLabel = hasLatestArchived
    ? "Archive activity"
    : "Finding new works";

  return {
    shares,
    policy,
    pace,
    backlogGuard,
    drainMode,
    activityGroups,
    activityHeading,
    activityLabel,
  };
}

export function useWorkerStatus(snapshot: ArchiveLiveSnapshot) {
  const worker = snapshot.worker;
  const workerSeenRecently = worker?.lastSeenAt
    ? Date.now() - new Date(worker.lastSeenAt).getTime() < 90_000
    : false;
  const workerIsRunning = worker?.status.toLowerCase() === "running";
  const workerStatusLabel = !worker
    ? "Worker not seen"
    : !workerSeenRecently
      ? "Worker stale"
      : `Worker ${worker.status.toLowerCase()}`;
  const queueWaitingOnWorker =
    snapshot.stats.pendingJobs > 0 &&
    (!workerSeenRecently || !workerIsRunning);
  const workerIsActive = workerIsRunning && workerSeenRecently;

  return {
    worker,
    workerIsActive,
    workerStatusLabel,
    queueWaitingOnWorker,
  };
}
