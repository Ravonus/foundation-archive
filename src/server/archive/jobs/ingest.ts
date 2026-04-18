import {
  BackupStatus,
  QueueJobStatus,
} from "~/server/prisma-client";
import { emitArchiveEvent } from "~/server/archive/live-events";
import { fetchAllFoundationWorksByCreator } from "~/server/archive/foundation-api";
import {
  contractScanJobPayloadSchema,
  publicArchiveProfileInputSchema,
  publicArchiveWorkInputSchema,
} from "~/server/archive/schemas";
import {
  BACKUP_PRIORITY,
  type DatabaseClient,
  isArchived,
  isPinned,
  normalizeAddress,
  PUBLIC_QUEUE_PRIORITY,
} from "./shared";
import {
  countJobsAhead,
  enqueueContractTokenIngest,
  queueArtworkBackup,
} from "./queue";
import { persistDiscoveredFoundationWorks } from "./contract-upserts";
import { discoverTokenIdsFromLogs } from "./ethereum-rpc";

export { ingestContractToken } from "./ingest-contract-token";
export { ingestFoundationMintUrl } from "./ingest-foundation";

function canBackupArtworkDirectly(artwork: {
  metadataRootId: string | null;
  mediaRootId: string | null;
  metadataStatus: BackupStatus;
  mediaStatus: BackupStatus;
  mediaRoot: unknown;
}) {
  const hasRoots = Boolean(artwork.metadataRootId ?? artwork.mediaRootId);
  if (!hasRoots) return false;
  const metadataOk =
    isArchived(artwork.metadataStatus) ||
    artwork.metadataStatus === BackupStatus.PENDING ||
    artwork.metadataStatus === BackupStatus.FAILED;
  const mediaOk =
    !artwork.mediaRoot ||
    isArchived(artwork.mediaStatus) ||
    artwork.mediaStatus === BackupStatus.PENDING ||
    artwork.mediaStatus === BackupStatus.FAILED;
  return metadataOk && mediaOk;
}

function isArtworkFullyPinned(artwork: {
  metadataStatus: BackupStatus;
  mediaStatus: BackupStatus;
  mediaRoot: unknown;
}) {
  return (
    isPinned(artwork.metadataStatus) &&
    (artwork.mediaRoot ? isPinned(artwork.mediaStatus) : true)
  );
}

export async function requestArtworkArchive(
  client: DatabaseClient,
  rawInput: unknown,
) {
  const input = publicArchiveWorkInputSchema.parse(rawInput);
  const contractAddress = normalizeAddress(input.contractAddress);

  const artwork = await client.artwork.findUnique({
    where: {
      chainId_contractAddress_tokenId: {
        chainId: input.chainId,
        contractAddress,
        tokenId: input.tokenId,
      },
    },
    include: {
      metadataRoot: true,
      mediaRoot: true,
    },
  });

  if (artwork && isArtworkFullyPinned(artwork)) {
    return {
      artworkId: artwork.id,
      state: "already-pinned" as const,
      jobId: null,
      jobsAhead: 0,
      title: artwork.title,
    };
  }

  const canBackupDirectly = Boolean(artwork && canBackupArtworkDirectly(artwork));

  const job =
    canBackupDirectly && artwork
      ? await queueArtworkBackup({
          client,
          artworkId: artwork.id,
          priority: PUBLIC_QUEUE_PRIORITY,
        })
      : await enqueueContractTokenIngest(client, {
          chainId: input.chainId,
          contractAddress,
          tokenId: input.tokenId,
          priority: PUBLIC_QUEUE_PRIORITY,
          backupPriority: PUBLIC_QUEUE_PRIORITY,
        });

  return {
    artworkId: artwork?.id ?? null,
    state: canBackupDirectly
      ? ("backup-queued" as const)
      : ("ingest-queued" as const),
    jobId: job.id,
    jobsAhead: await countJobsAhead(client, job),
    title: artwork?.title ?? null,
  };
}

type ProfileArchiveTotals = {
  queuedWorks: number;
  alreadyPinnedWorks: number;
  backupQueuedWorks: number;
  ingestQueuedWorks: number;
  jobIds: Set<string>;
};

function accumulateProfileArchiveResult(
  totals: ProfileArchiveTotals,
  result: Awaited<ReturnType<typeof requestArtworkArchive>>,
) {
  if (result.state === "already-pinned") {
    totals.alreadyPinnedWorks += 1;
    return;
  }

  totals.queuedWorks += 1;
  if (result.state === "backup-queued") totals.backupQueuedWorks += 1;
  if (result.state === "ingest-queued") totals.ingestQueuedWorks += 1;
  if (result.jobId) totals.jobIds.add(result.jobId);
}

function profileArchiveLabel(input: {
  label?: string;
  username?: string;
  accountAddress: string;
}) {
  return (
    input.label ??
    input.username?.replace(/^@+/, "") ??
    `${input.accountAddress.slice(0, 6)}...${input.accountAddress.slice(-4)}`
  );
}

export async function requestProfileArchive(
  client: DatabaseClient,
  rawInput: unknown,
) {
  const input = publicArchiveProfileInputSchema.parse(rawInput);
  const publicJobsAhead = await client.queueJob.count({
    where: {
      status: {
        in: [QueueJobStatus.PENDING, QueueJobStatus.RUNNING],
      },
      priority: {
        gte: PUBLIC_QUEUE_PRIORITY,
      },
    },
  });

  const works = await fetchAllFoundationWorksByCreator(
    input.accountAddress,
    24,
    20,
  );
  await persistDiscoveredFoundationWorks(client, works, {
    backupPriority: BACKUP_PRIORITY,
    indexedFrom: "foundation-profile-search",
  });

  const totals: ProfileArchiveTotals = {
    queuedWorks: 0,
    alreadyPinnedWorks: 0,
    backupQueuedWorks: 0,
    ingestQueuedWorks: 0,
    jobIds: new Set<string>(),
  };

  for (const work of works) {
    const result = await requestArtworkArchive(client, {
      chainId: work.chainId,
      contractAddress: work.contractAddress,
      tokenId: work.tokenId,
      foundationUrl: work.foundationUrl,
    });
    accumulateProfileArchiveResult(totals, result);
  }

  return {
    totalWorks: works.length,
    queuedWorks: totals.queuedWorks,
    alreadyPinnedWorks: totals.alreadyPinnedWorks,
    backupQueuedWorks: totals.backupQueuedWorks,
    ingestQueuedWorks: totals.ingestQueuedWorks,
    publicJobsAhead,
    jobIds: Array.from(totals.jobIds),
    label: profileArchiveLabel(input),
  };
}

function tokenRange(startTokenId: number, endTokenId: number) {
  const size = endTokenId - startTokenId + 1;
  if (size > 2000) {
    throw new Error("Token range scans are capped at 2,000 IDs per request.");
  }

  return Array.from({ length: size }, (_, index) =>
    (startTokenId + index).toString(),
  );
}

async function resolveScanTokenIds(payload: {
  fromBlock?: number;
  toBlock?: number;
  startTokenId?: number;
  endTokenId?: number;
  contractAddress: string;
}) {
  if (typeof payload.fromBlock === "number") {
    return discoverTokenIdsFromLogs({
      contractAddress: payload.contractAddress,
      fromBlock: payload.fromBlock,
      toBlock: payload.toBlock,
    });
  }
  return tokenRange(payload.startTokenId ?? 0, payload.endTokenId ?? 0);
}

export async function scanContractTokens(
  client: DatabaseClient,
  rawPayload: string,
) {
  const payload = contractScanJobPayloadSchema.parse(
    JSON.parse(rawPayload) as unknown,
  );

  const tokenIds = await resolveScanTokenIds(payload);

  let queued = 0;
  for (const tokenId of tokenIds) {
    await enqueueContractTokenIngest(client, {
      chainId: payload.chainId,
      contractAddress: payload.contractAddress,
      tokenId,
    });
    queued += 1;
  }

  await client.contractRegistry.update({
    where: {
      chainId_address: {
        chainId: payload.chainId,
        address: normalizeAddress(payload.contractAddress),
      },
    },
    data: {
      lastScanRequestedAt: new Date(),
      lastScanCompletedAt: new Date(),
    },
  });

  await emitArchiveEvent(client, {
    type: "crawler.manual-contract-scan-queued",
    summary: `Queued ${queued} token${queued === 1 ? "" : "s"} from ${payload.contractAddress}.`,
    contractAddress: payload.contractAddress,
    data: {
      queued,
      fromBlock: payload.fromBlock ?? null,
      toBlock: payload.toBlock ?? null,
      startTokenId: payload.startTokenId ?? null,
      endTokenId: payload.endTokenId ?? null,
    },
  });

  return {
    queued,
    contractAddress: payload.contractAddress,
  };
}

