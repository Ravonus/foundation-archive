import type {
  ArchiveCrawlerCard,
  ArchiveLiveArtworkCard,
  ArchiveLiveSnapshot,
  ArchivePolicyCard,
  ArchiveWorkerStatusCard,
} from "~/lib/archive-live";
import { readRecentArchiveEvents } from "~/server/archive/live-events";
import { BackupStatus } from "~/server/prisma-client";
import type { PrismaClient } from "~/server/prisma-client";

type DatabaseClient = PrismaClient;

type ArtworkCardRow = {
  id: string;
  slug: string;
  title: string;
  artistName: string | null;
  artistUsername: string | null;
  artistWallet: string | null;
  mediaKind: string;
  sourceUrl: string | null;
  staticPreviewUrl: string | null;
  previewUrl: string | null;
  foundationUrl: string | null;
  contractAddress: string;
  tokenId: string;
  mediaStatus: string;
  metadataRoot: {
    cid: string;
  } | null;
  mediaRoot: {
    cid: string;
    gatewayUrl: string | null;
  } | null;
};

function archivedPosterUrl(artwork: ArtworkCardRow) {
  const isArchived =
    artwork.mediaStatus === "DOWNLOADED" || artwork.mediaStatus === "PINNED";
  if (!isArchived || artwork.mediaKind !== "IMAGE" || !artwork.mediaRoot) {
    return null;
  }

  return artwork.mediaRoot.gatewayUrl;
}

export function toLiveArtworkCard(
  artwork: ArtworkCardRow | null | undefined,
): ArchiveLiveArtworkCard | null {
  if (!artwork) return null;

  return {
    artworkId: artwork.id,
    slug: artwork.slug,
    title: artwork.title,
    artistName: artwork.artistName,
    artistUsername: artwork.artistUsername,
    artistWallet: artwork.artistWallet,
    posterUrl:
      archivedPosterUrl(artwork) ??
      artwork.staticPreviewUrl ??
      artwork.previewUrl ??
      (artwork.mediaKind === "IMAGE" ? artwork.sourceUrl : null),
    contractAddress: artwork.contractAddress,
    tokenId: artwork.tokenId,
    foundationUrl: artwork.foundationUrl,
    mediaCid: artwork.mediaRoot?.cid ?? null,
    metadataCid: artwork.metadataRoot?.cid ?? null,
  };
}

function toWorkerCard(worker: {
  label: string;
  lastError: string | null;
  lastProcessedCount: number;
  lastRunFinishedAt: Date | null;
  lastRunStartedAt: Date | null;
  lastSeenAt: Date;
  mode: string;
  status: string;
  workerKey: string;
} | null): ArchiveWorkerStatusCard | null {
  if (!worker) return null;

  return {
    label: worker.label,
    mode: worker.mode,
    status: worker.status,
    workerKey: worker.workerKey,
    lastSeenAt: worker.lastSeenAt.toISOString(),
    lastRunStartedAt: worker.lastRunStartedAt?.toISOString() ?? null,
    lastRunFinishedAt: worker.lastRunFinishedAt?.toISOString() ?? null,
    lastProcessedCount: worker.lastProcessedCount,
    lastError: worker.lastError,
  };
}

function toPolicyCard(policy: {
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
  lastCrawlerTickAt: Date | null;
  lastDiscoveryTickAt: Date | null;
  lastDiscoverySummary: string | null;
  nextDeferredCid: string | null;
  nextDeferredBytes: number | null;
  lastBudgetRaisedAt: Date | null;
  lastBudgetReason: string | null;
} | null): ArchivePolicyCard | null {
  if (!policy) return null;

  return {
    autoCrawlerEnabled: policy.autoCrawlerEnabled,
    smartPinStartBytes: policy.smartPinStartBytes,
    smartPinMaxBytes: policy.smartPinMaxBytes,
    smartPinCeilingBytes: policy.smartPinCeilingBytes,
    smartPinGrowthFactor: policy.smartPinGrowthFactor,
    smartPinDeferMs: policy.smartPinDeferMs,
    blockWindowSize: policy.blockWindowSize,
    contractsPerTick: policy.contractsPerTick,
    discoverySource: policy.discoverySource,
    discoveryPage: policy.discoveryPage,
    discoveryQueryIndex: policy.discoveryQueryIndex,
    discoveryPerPage: policy.discoveryPerPage,
    totalDiscoveredContracts: policy.totalDiscoveredContracts,
    lastCrawlerTickAt: policy.lastCrawlerTickAt?.toISOString() ?? null,
    lastDiscoveryTickAt: policy.lastDiscoveryTickAt?.toISOString() ?? null,
    lastDiscoverySummary: policy.lastDiscoverySummary,
    nextDeferredCid: policy.nextDeferredCid,
    nextDeferredBytes: policy.nextDeferredBytes,
    lastBudgetRaisedAt: policy.lastBudgetRaisedAt?.toISOString() ?? null,
    lastBudgetReason: policy.lastBudgetReason,
  };
}

function toCrawlerCard(crawler: {
  scanMode: string;
  autoEnabled: boolean;
  completed: boolean;
  nextFromBlock: number;
  lastScannedBlock: number | null;
  scanToBlock: number | null;
  totalDiscoveredCount: number;
  lastDiscoveredCount: number;
  lastRunStartedAt: Date | null;
  lastRunFinishedAt: Date | null;
  lastError: string | null;
  contract: {
    address: string;
    label: string;
    contractKind: string;
  };
}): ArchiveCrawlerCard {
  return {
    contractAddress: crawler.contract.address,
    label: crawler.contract.label,
    contractKind: crawler.contract.contractKind,
    scanMode: crawler.scanMode,
    autoEnabled: crawler.autoEnabled,
    completed: crawler.completed,
    nextFromBlock: crawler.nextFromBlock,
    lastScannedBlock: crawler.lastScannedBlock,
    scanToBlock: crawler.scanToBlock,
    totalDiscoveredCount: crawler.totalDiscoveredCount,
    lastDiscoveredCount: crawler.lastDiscoveredCount,
    lastRunStartedAt: crawler.lastRunStartedAt?.toISOString() ?? null,
    lastRunFinishedAt: crawler.lastRunFinishedAt?.toISOString() ?? null,
    lastError: crawler.lastError,
  };
}

const SATISFIED_ARTWORK_STATUSES: BackupStatus[] = [
  BackupStatus.DOWNLOADED,
  BackupStatus.PINNED,
  BackupStatus.SKIPPED,
];

const ARTWORK_WITH_ROOT_WHERE = {
  OR: [{ metadataRootId: { not: null } }, { mediaRootId: { not: null } }],
};

function anyPreservedArtworkWhere() {
  return {
    ...ARTWORK_WITH_ROOT_WHERE,
    OR: [
      {
        metadataStatus: {
          in: SATISFIED_ARTWORK_STATUSES,
        },
      },
      {
        mediaStatus: {
          in: SATISFIED_ARTWORK_STATUSES,
        },
      },
    ],
  };
}

function fullyPreservedArtworkWhere() {
  return {
    ...ARTWORK_WITH_ROOT_WHERE,
    metadataStatus: {
      in: SATISFIED_ARTWORK_STATUSES,
    },
    mediaStatus: {
      in: SATISFIED_ARTWORK_STATUSES,
    },
  };
}

function deferredArtworkWhere() {
  return {
    AND: [
      ARTWORK_WITH_ROOT_WHERE,
      {
        OR: [
          {
            metadataStatus: BackupStatus.PENDING,
            metadataRoot: {
              is: {
                backupStatus: BackupStatus.PENDING,
                lastDeferredAt: { not: null },
              },
            },
          },
          {
            mediaStatus: BackupStatus.PENDING,
            mediaRoot: {
              is: {
                backupStatus: BackupStatus.PENDING,
                lastDeferredAt: { not: null },
              },
            },
          },
        ],
      },
    ],
  };
}

async function findNextDeferredRoot(
  client: DatabaseClient,
  smartPinMaxBytes: number,
) {
  return client.ipfsRoot.findFirst({
    where: {
      backupStatus: "PENDING",
      lastDeferredAt: { not: null },
      OR: [
        { estimatedByteSize: { gt: smartPinMaxBytes } },
        { byteSize: { gt: smartPinMaxBytes } },
      ],
    },
    orderBy: [{ estimatedByteSize: "asc" }, { byteSize: "asc" }],
    select: {
      cid: true,
      estimatedByteSize: true,
      byteSize: true,
    },
  });
}

async function fetchSnapshotStats(client: DatabaseClient) {
  const now = new Date();

  const [
    artworks,
    contracts,
    readyPendingJobs,
    runningJobs,
    failedJobs,
    anyPreservedArtworks,
    fullyPreservedArtworks,
    downloadedRoots,
    pinnedRoots,
    deferredArtworks,
  ] = await Promise.all([
    client.artwork.count({
      where: ARTWORK_WITH_ROOT_WHERE,
    }),
    client.contractRegistry.count(),
    client.queueJob.count({
      where: {
        kind: "BACKUP_ARTWORK",
        status: "PENDING",
        availableAt: {
          lte: now,
        },
      },
    }),
    client.queueJob.count({
      where: {
        kind: "BACKUP_ARTWORK",
        status: "RUNNING",
      },
    }),
    client.queueJob.count({
      where: {
        kind: "BACKUP_ARTWORK",
        status: "FAILED",
      },
    }),
    client.artwork.count({
      where: anyPreservedArtworkWhere(),
    }),
    client.artwork.count({
      where: fullyPreservedArtworkWhere(),
    }),
    client.ipfsRoot.count({ where: { backupStatus: "DOWNLOADED" } }),
    client.ipfsRoot.count({ where: { pinStatus: "PINNED" } }),
    client.artwork.count({
      where: deferredArtworkWhere(),
    }),
  ]);

  return {
    artworks,
    contracts,
    pendingJobs: readyPendingJobs + runningJobs,
    runningJobs,
    failedJobs,
    preservedRoots: anyPreservedArtworks,
    fullyPreservedArtworks,
    downloadedRoots,
    pinnedRoots,
    deferredRoots: deferredArtworks,
  };
}

async function fetchLatestArchivedArtworks(client: DatabaseClient) {
  return client.artwork.findMany({
    where: {
      OR: [
        {
          metadataRoot: {
            is: {
              OR: [{ backupStatus: "DOWNLOADED" }, { pinStatus: "PINNED" }],
            },
          },
        },
        {
          mediaRoot: {
            is: {
              OR: [{ backupStatus: "DOWNLOADED" }, { pinStatus: "PINNED" }],
            },
          },
        },
      ],
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 40,
    select: {
      id: true,
      slug: true,
      title: true,
      artistName: true,
      artistUsername: true,
      artistWallet: true,
      mediaKind: true,
      sourceUrl: true,
      staticPreviewUrl: true,
      previewUrl: true,
      foundationUrl: true,
      contractAddress: true,
      tokenId: true,
      mediaStatus: true,
      metadataRoot: { select: { cid: true } },
      mediaRoot: { select: { cid: true, gatewayUrl: true } },
    },
  });
}

async function fetchSnapshotAuxiliaries(client: DatabaseClient) {
  const [stats, worker, crawlers, latestArchived, recentEvents] =
    await Promise.all([
      fetchSnapshotStats(client),
      client.workerHeartbeat.findFirst({
        orderBy: [{ lastSeenAt: "desc" }],
      }),
      client.contractCrawlerState.findMany({
        include: { contract: true },
        orderBy: [{ updatedAt: "desc" }],
        take: 8,
      }),
      fetchLatestArchivedArtworks(client),
      readRecentArchiveEvents(client, 14),
    ]);

  return { stats, worker, crawlers, latestArchived, recentEvents };
}

export async function getArchiveLiveSnapshot(
  client: DatabaseClient,
): Promise<ArchiveLiveSnapshot> {
  const policyRecord = await client.archivePolicyState.findUnique({
    where: { id: "global" },
  });

  const [nextDeferredRoot, aux] = await Promise.all([
    policyRecord
      ? findNextDeferredRoot(client, policyRecord.smartPinMaxBytes)
      : Promise.resolve(null),
    fetchSnapshotAuxiliaries(client),
  ]);

  const { stats, worker, crawlers, latestArchived, recentEvents } = aux;

  return {
    stats,
    worker: toWorkerCard(worker),
    policy: toPolicyCard(
      policyRecord
        ? {
            ...policyRecord,
            nextDeferredCid: nextDeferredRoot?.cid ?? null,
            nextDeferredBytes:
              nextDeferredRoot?.estimatedByteSize ??
              nextDeferredRoot?.byteSize ??
              null,
          }
        : null,
    ),
    crawlers: crawlers.map((crawler) => toCrawlerCard(crawler)),
    latestArchived: latestArchived
      .map((artwork) => toLiveArtworkCard(artwork))
      .filter(Boolean) as ArchiveLiveArtworkCard[],
    recentEvents,
  };
}
