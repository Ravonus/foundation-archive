export type ArchivePace = "slow" | "steady" | "fast";

export const ARCHIVE_PACE_CONFIG = {
  slow: {
    key: "slow",
    label: "Slow",
    contractsPerTick: 1,
    queueLimit: 1,
    busyDelayMs: 28_000,
    idleDelayMs: 90_000,
    maxPendingJobs: 96,
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
    busyDelayMs: 4_000,
    idleDelayMs: 15_000,
    maxPendingJobs: 576,
  },
} as const;

export function archivePaceFromContractsPerTick(
  contractsPerTick: number | null | undefined,
): ArchivePace {
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
