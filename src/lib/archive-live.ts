export interface ArchiveLiveArtworkCard {
  artworkId: string;
  slug: string | null;
  title: string;
  artistName: string | null;
  artistUsername: string | null;
  posterUrl: string | null;
  contractAddress: string;
  tokenId: string;
  foundationUrl: string | null;
  mediaCid: string | null;
  metadataCid: string | null;
}

export interface ArchiveLiveEvent {
  id: string;
  type: string;
  summary: string;
  createdAt: string;
  artwork: ArchiveLiveArtworkCard | null;
  contractAddress: string | null;
  cid: string | null;
  sizeBytes: number | null;
  data: Record<string, unknown>;
}

export interface ArchiveWorkerStatusCard {
  label: string;
  mode: string;
  status: string;
  workerKey: string;
  lastSeenAt: string | null;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
  lastProcessedCount: number;
  lastError: string | null;
}

export interface ArchivePolicyCard {
  autoCrawlerEnabled: boolean;
  smartPinStartBytes: number;
  smartPinMaxBytes: number;
  smartPinCeilingBytes: number;
  smartPinGrowthFactor: number;
  smartPinDeferMs: number;
  blockWindowSize: number;
  contractsPerTick: number;
  discoverySource: string;
  discoveryPage: number;
  discoveryQueryIndex: number;
  discoveryPerPage: number;
  totalDiscoveredContracts: number;
  lastCrawlerTickAt: string | null;
  lastDiscoveryTickAt: string | null;
  lastDiscoverySummary: string | null;
  nextDeferredCid: string | null;
  nextDeferredBytes: number | null;
  lastBudgetRaisedAt: string | null;
  lastBudgetReason: string | null;
}

export interface ArchiveCrawlerCard {
  contractAddress: string;
  label: string;
  contractKind: string;
  scanMode: string;
  autoEnabled: boolean;
  completed: boolean;
  nextFromBlock: number;
  lastScannedBlock: number | null;
  scanToBlock: number | null;
  totalDiscoveredCount: number;
  lastDiscoveredCount: number;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
  lastError: string | null;
}

export interface ArchiveLiveStats {
  artworks: number;
  contracts: number;
  pendingJobs: number;
  runningJobs: number;
  failedJobs: number;
  preservedRoots: number;
  downloadedRoots: number;
  pinnedRoots: number;
  deferredRoots: number;
}

export interface ArchiveLiveSnapshot {
  stats: ArchiveLiveStats;
  worker: ArchiveWorkerStatusCard | null;
  policy: ArchivePolicyCard | null;
  crawlers: ArchiveCrawlerCard[];
  latestArchived: ArchiveLiveArtworkCard[];
  recentEvents: ArchiveLiveEvent[];
}

export interface ArchiveSocketEnvelope {
  event: ArchiveLiveEvent;
  snapshot: ArchiveLiveSnapshot;
}
