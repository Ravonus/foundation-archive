import {
  BackupStatus,
  PinProvider,
  QueueJobKind,
  QueueJobStatus,
  RootKind,
} from "~/server/prisma-client";
import { env } from "~/env";
import { formatBytes } from "~/lib/utils";
import { parseIpfsReference } from "~/server/archive/ipfs";
import { emitArchiveEvent } from "~/server/archive/live-events";
import { getArchivePolicyState } from "~/server/archive/state";
import {
  downloadFileToArchive,
  ensureArchiveRoot,
  pinCidWithKubo,
} from "~/server/archive/storage";
import {
  type DatabaseClient,
  loadArtworkLiveCard,
  recordBackupRun,
  syncArtworkStatuses,
  syncArtworksForRoot,
} from "./shared";

type RootRecord = {
  id: string;
  cid: string;
  relativePath: string | null;
  gatewayUrl: string | null;
  originalUrl: string | null;
  mimeType: string | null;
  byteSize: number | null;
  estimatedByteSize: number | null;
  localDirectory: string | null;
  backupStatus: BackupStatus;
  pinStatus: BackupStatus;
};

type BackupRootInput = {
  artworkId: string;
  bypassSmartBudget?: boolean;
  root: RootRecord | null;
};

type DeferredOutcome = {
  status: "deferred";
  availableAt: Date;
};

type SkippedOutcome = {
  status: "skipped";
  availableAt: null;
};

type ProcessedOutcome = {
  status: "processed";
  availableAt: null;
  root: Awaited<ReturnType<DatabaseClient["ipfsRoot"]["update"]>>;
};

function isRootAlreadySatisfied(root: RootRecord) {
  return (
    root.pinStatus === BackupStatus.PINNED ||
    (root.backupStatus === BackupStatus.DOWNLOADED &&
      Boolean(root.localDirectory))
  );
}

async function headProbeRoot(root: RootRecord) {
  const sourceUrl = root.gatewayUrl ?? root.originalUrl;
  if (!sourceUrl) {
    return {
      estimatedByteSize: null as number | null,
      mimeType: root.mimeType,
    };
  }

  let estimatedByteSize = root.byteSize ?? root.estimatedByteSize ?? null;
  let mimeType = root.mimeType;

  if (!estimatedByteSize) {
    try {
      const headResponse = await fetch(sourceUrl, {
        method: "HEAD",
        headers: {
          "user-agent": "foundation-archive/0.1 (+https://foundation.app)",
        },
        signal: AbortSignal.timeout(15_000),
      });

      const headerBytes = headResponse.headers.get("content-length");
      estimatedByteSize = headerBytes ? Number(headerBytes) : null;
      mimeType = headResponse.headers.get("content-type") ?? mimeType;
    } catch {
      estimatedByteSize = null;
    }
  }

  return { estimatedByteSize, mimeType };
}

async function evaluateSmartBudget(args: {
  client: DatabaseClient;
  input: BackupRootInput;
  root: RootRecord;
}): Promise<DeferredOutcome | null> {
  const { client, input, root } = args;
  if (input.bypassSmartBudget) return null;

  const policy = await getArchivePolicyState(client);
  const { estimatedByteSize, mimeType } = await headProbeRoot(root);
  if (!estimatedByteSize) return null;

  await client.ipfsRoot.update({
    where: { id: root.id },
    data: {
      estimatedByteSize,
      mimeType,
    },
  });

  if (estimatedByteSize <= policy.smartPinMaxBytes) return null;

  await client.ipfsRoot.update({
    where: { id: root.id },
    data: {
      estimatedByteSize,
      mimeType,
      lastDeferredAt: new Date(),
      deferredUntilByteSize: policy.smartPinMaxBytes,
      deferCount: { increment: 1 },
      lastError: null,
    },
  });

  await emitArchiveEvent(client, {
    type: "root.deferred-for-size",
    summary: `Deferred ${root.cid} until the smart budget grows beyond ${formatBytes(estimatedByteSize)}.`,
    artwork: await loadArtworkLiveCard(client, input.artworkId),
    cid: root.cid,
    sizeBytes: estimatedByteSize,
    data: {
      smartBudgetBytes: policy.smartPinMaxBytes,
      deferForMs: policy.smartPinDeferMs,
    },
  });

  return {
    status: "deferred",
    availableAt: new Date(Date.now() + policy.smartPinDeferMs),
  };
}

async function downloadRootAndRecord(args: {
  client: DatabaseClient;
  input: BackupRootInput;
  root: RootRecord;
  startedAt: Date;
}) {
  const { client, input, root, startedAt } = args;
  await ensureArchiveRoot();

  const downloadResult = await downloadFileToArchive({
    cid: root.cid,
    relativePath: root.relativePath,
    gatewayUrl: root.gatewayUrl,
    originalUrl: root.originalUrl,
  });

  const updatedRoot = await client.ipfsRoot.update({
    where: { id: root.id },
    data: {
      backupStatus: BackupStatus.DOWNLOADED,
      byteSize: downloadResult.byteSize,
      estimatedByteSize: downloadResult.byteSize,
      mimeType: downloadResult.mimeType ?? root.mimeType,
      localDirectory: downloadResult.localDirectory,
      lastDownloadedAt: new Date(),
      lastDeferredAt: null,
      deferredUntilByteSize: null,
      lastError: null,
    },
  });

  await recordBackupRun(client, {
    artworkId: input.artworkId,
    rootId: root.id,
    action: "DOWNLOAD_TO_ARCHIVE",
    status: BackupStatus.DOWNLOADED,
    provider: PinProvider.NONE,
    notes: downloadResult.absolutePath,
    startedAt,
    finishedAt: new Date(),
  });

  await emitArchiveEvent(client, {
    type: "root.downloaded",
    summary: `Downloaded ${root.cid} into the server archive.`,
    artwork: await loadArtworkLiveCard(client, input.artworkId),
    cid: root.cid,
    sizeBytes: downloadResult.byteSize,
    data: {
      localDirectory: downloadResult.localDirectory,
    },
  });

  return { updatedRoot, downloadResult };
}

async function pinRootWithKubo(args: {
  client: DatabaseClient;
  input: BackupRootInput;
  root: RootRecord;
  sizeBytes: number;
  startedAt: Date;
}) {
  const { client, input, root, sizeBytes, startedAt } = args;
  const pinReference = root.originalUrl
    ? (parseIpfsReference(root.originalUrl, RootKind.UNKNOWN)?.originalCid ??
      root.cid)
    : root.cid;
  const pinResult = await pinCidWithKubo(pinReference);

  await client.ipfsRoot.update({
    where: { id: root.id },
    data: {
      pinStatus: BackupStatus.PINNED,
      pinProvider: PinProvider.KUBO,
      pinReference: pinResult.reference,
      lastPinnedAt: new Date(),
      lastDeferredAt: null,
      deferredUntilByteSize: null,
      lastError: null,
    },
  });

  await recordBackupRun(client, {
    artworkId: input.artworkId,
    rootId: root.id,
    action: "PIN_BY_CID",
    status: BackupStatus.PINNED,
    provider: PinProvider.KUBO,
    responsePayload: JSON.stringify(pinResult),
    startedAt,
    finishedAt: new Date(),
  });

  await emitArchiveEvent(client, {
    type: "root.pinned",
    summary: `Pinned ${root.cid} on the server.`,
    artwork: await loadArtworkLiveCard(client, input.artworkId),
    cid: root.cid,
    sizeBytes,
    data: {
      pinReference: pinResult.reference,
    },
  });
}

async function markPinSkipped(client: DatabaseClient, rootId: string) {
  await client.ipfsRoot.update({
    where: { id: rootId },
    data: {
      pinStatus: BackupStatus.SKIPPED,
      pinProvider: PinProvider.NONE,
    },
  });
}

async function recordRootFailure(args: {
  client: DatabaseClient;
  input: BackupRootInput;
  root: RootRecord;
  startedAt: Date;
  error: unknown;
}) {
  const { client, input, root, startedAt, error } = args;
  const message =
    error instanceof Error ? error.message : "Unknown backup failure";

  await client.ipfsRoot.update({
    where: { id: root.id },
    data: {
      backupStatus: BackupStatus.FAILED,
      pinStatus: BackupStatus.FAILED,
      lastError: message,
    },
  });

  await recordBackupRun(client, {
    artworkId: input.artworkId,
    rootId: root.id,
    action: "DOWNLOAD_TO_ARCHIVE",
    status: BackupStatus.FAILED,
    provider: PinProvider.NONE,
    errorMessage: message,
    startedAt,
    finishedAt: new Date(),
  });

  await syncArtworksForRoot(client, root.id);
}

async function backupSingleRoot(
  client: DatabaseClient,
  input: BackupRootInput,
): Promise<ProcessedOutcome | DeferredOutcome | SkippedOutcome | null> {
  if (!input.root) return null;
  const root = input.root;

  if (isRootAlreadySatisfied(root)) {
    return { status: "skipped", availableAt: null };
  }

  const startedAt = new Date();

  try {
    const deferred = await evaluateSmartBudget({ client, input, root });
    if (deferred) return deferred;

    const { updatedRoot, downloadResult } = await downloadRootAndRecord({
      client,
      input,
      root,
      startedAt,
    });

    if (env.KUBO_API_URL) {
      await pinRootWithKubo({
        client,
        input,
        root,
        sizeBytes: downloadResult.byteSize,
        startedAt,
      });
    } else {
      await markPinSkipped(client, root.id);
    }

    await syncArtworksForRoot(client, root.id);

    return {
      status: "processed",
      availableAt: null,
      root: updatedRoot,
    };
  } catch (error) {
    await recordRootFailure({ client, input, root, startedAt, error });
    throw error;
  }
}

type BackupSummary =
  | { outcome: "skipped"; reason: "artwork-not-found" }
  | { outcome: "deferred"; availableAt: Date; message: string }
  | {
      outcome: "completed";
      artwork: Awaited<ReturnType<typeof syncArtworkStatuses>>;
    };

async function removeMissingArtworkJobs(
  client: DatabaseClient,
  artworkId: string,
) {
  await client.queueJob.deleteMany({
    where: {
      kind: QueueJobKind.BACKUP_ARTWORK,
      status: QueueJobStatus.PENDING,
      dedupeKey: artworkId,
    },
  });

  await emitArchiveEvent(client, {
    type: "queue.job-skipped",
    summary: `Skipped backup for missing artwork ${artworkId}.`,
    data: {
      artworkId,
      reason: "artwork-not-found",
    },
  });
}

type RootResult = ProcessedOutcome | DeferredOutcome | SkippedOutcome | null;

async function emitFullyArchivedEvent(args: {
  client: DatabaseClient;
  artworkId: string;
  synced: NonNullable<Awaited<ReturnType<typeof syncArtworkStatuses>>>;
}) {
  const { client, artworkId, synced } = args;
  await emitArchiveEvent(client, {
    type: "artwork.server-archived",
    summary: `${synced.title} is fully pinned on the server.`,
    artwork: await loadArtworkLiveCard(client, artworkId),
    contractAddress: synced.contractAddress,
    data: {
      metadataStatus: synced.metadataStatus,
      mediaStatus: synced.mediaStatus,
    },
  });
}

export async function backupArtwork(
  client: DatabaseClient,
  artworkId: string,
  options: {
    bypassSmartBudget?: boolean;
  } = {},
): Promise<BackupSummary> {
  const artwork = await client.artwork.findUnique({
    where: { id: artworkId },
    include: {
      metadataRoot: true,
      mediaRoot: true,
    },
  });

  if (!artwork) {
    await removeMissingArtworkJobs(client, artworkId);
    return { outcome: "skipped", reason: "artwork-not-found" };
  }

  const rootResults: RootResult[] = [];

  if (artwork.metadataRoot) {
    rootResults.push(
      await backupSingleRoot(client, {
        artworkId: artwork.id,
        root: artwork.metadataRoot,
        bypassSmartBudget: options.bypassSmartBudget,
      }),
    );
  }

  if (artwork.mediaRoot) {
    rootResults.push(
      await backupSingleRoot(client, {
        artworkId: artwork.id,
        root: artwork.mediaRoot,
        bypassSmartBudget: options.bypassSmartBudget,
      }),
    );
  }

  const syncedArtwork = await syncArtworkStatuses(client, artwork.id);

  if (
    syncedArtwork?.metadataStatus === BackupStatus.PINNED &&
    (!artwork.mediaRoot || syncedArtwork.mediaStatus === BackupStatus.PINNED)
  ) {
    await emitFullyArchivedEvent({
      client,
      artworkId: artwork.id,
      synced: syncedArtwork,
    });
  }

  const deferredRoot = rootResults.find(
    (result) => result?.status === "deferred",
  );

  if (deferredRoot?.status === "deferred") {
    return {
      outcome: "deferred",
      availableAt: deferredRoot.availableAt,
      message: `Deferred larger root(s) for ${artwork.title} until the smart budget expands.`,
    };
  }

  return { outcome: "completed", artwork: syncedArtwork };
}
