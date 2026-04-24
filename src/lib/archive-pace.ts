export type ArchivePace = "slow" | "steady" | "fast" | "turbo";

export const ARCHIVE_PACE_CONFIG = {
  slow: {
    key: "slow",
    label: "Slow",
    contractsPerTick: 1,
    queueLimit: 1,
    busyDelayMs: 60_000,
    idleDelayMs: 180_000,
    maxPendingJobs: 24,
  },
  steady: {
    key: "steady",
    label: "Steady",
    contractsPerTick: 2,
    queueLimit: 3,
    busyDelayMs: 10_000,
    idleDelayMs: 35_000,
    maxPendingJobs: 240,
  },
  fast: {
    key: "fast",
    label: "Fast",
    contractsPerTick: 4,
    queueLimit: 8,
    // The worker runs the full queueLimit in parallel inside a cycle,
    // so `busyDelayMs` is pure idle gap between cycles. 500 ms is
    // plenty to let the event loop breathe without the old 4 s stall
    // that left the pipeline half-empty.
    busyDelayMs: 500,
    idleDelayMs: 10_000,
    maxPendingJobs: 576,
  },
  turbo: {
    key: "turbo",
    label: "Turbo",
    contractsPerTick: 8,
    queueLimit: 16,
    busyDelayMs: 250,
    idleDelayMs: 5_000,
    maxPendingJobs: 1_200,
  },
} as const;

export function archivePaceFromContractsPerTick(
  contractsPerTick: number | null | undefined,
): ArchivePace {
  if ((contractsPerTick ?? 0) >= ARCHIVE_PACE_CONFIG.turbo.contractsPerTick) {
    return "turbo";
  }

  if ((contractsPerTick ?? 0) >= ARCHIVE_PACE_CONFIG.fast.contractsPerTick) {
    return "fast";
  }

  if ((contractsPerTick ?? 0) >= ARCHIVE_PACE_CONFIG.steady.contractsPerTick) {
    return "steady";
  }

  return "slow";
}

export function archivePaceConfigForContractsPerTick(
  contractsPerTick: number | null | undefined,
) {
  return ARCHIVE_PACE_CONFIG[archivePaceFromContractsPerTick(contractsPerTick)];
}

export function archiveIngressGuardForPendingJobs(
  contractsPerTick: number | null | undefined,
  pendingJobs: number,
  _discoveryPerPage = 24,
) {
  const config = archivePaceConfigForContractsPerTick(contractsPerTick);
  const maxPendingJobs = config.maxPendingJobs;
  const pendingHeadroom = Math.max(maxPendingJobs - pendingJobs, 0);
  const hardPause = pendingJobs >= maxPendingJobs;
  const allowedCrawlerContracts = hardPause ? 0 : config.contractsPerTick;

  return {
    maxPendingJobs,
    pendingHeadroom,
    allowedCrawlerContracts,
    pauseIngress: hardPause,
  };
}
