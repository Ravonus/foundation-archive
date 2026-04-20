import {
  BackupStatus,
  PinProvider,
  QueueJobKind,
  QueueJobStatus,
  RootKind,
} from "~/server/prisma-client";
import { env } from "~/env";
import { formatBytes } from "~/lib/utils";
import {
  dependencyManifestIsCurrent,
  verifyArchivedRootDependencies,
} from "~/server/archive/dependencies";
import { emitArchiveEvent } from "~/server/archive/live-events";
import { getArchivePolicyState } from "~/server/archive/state";
import {
  downloadFileToArchive,
  ensureArchiveRoot,
  hydrateCidDirectory,
  pinCidWithKubo,
} from "~/server/archive/storage";
import {
  type DatabaseClient,
  FAILED_ROOT_RETRY_COOLDOWN_MS,
  loadArtworkLiveCard,
  recordBackupRun,
  syncArtworkStatuses,
  syncArtworksForRoot,
} from "./shared";

type RootRecord = {
  id: string;
  cid: string;
  kind: RootKind;
  relativePath: string | null;
  gatewayUrl: string | null;
  originalUrl: string | null;
  mimeType: string | null;
  byteSize: number | null;
  estimatedByteSize: number | null;
  localDirectory: string | null;
  backupStatus: BackupStatus;
  pinStatus: BackupStatus;
  updatedAt: Date;
};

type BackupRootInput = {
  artworkId: string;
  bypassSmartBudget?: boolean;
  artwork: {
    previewUrl: string | null;
    staticPreviewUrl: string | null;
  };
  root: RootRecord | null;
};

type DeferredOutcome = {
  status: "deferred";
  availableAt: Date;
  reason: "size" | "retry-cooldown";
  retainJob?: boolean;
};

type SkippedOutcome = {
  status: "skipped";
  availableAt: null;
};

type ProcessedOutcome = {
  status: "processed";
  availableAt: null;
};

function hasDownloadedRoot(root: RootRecord) {
  return (
    root.backupStatus === BackupStatus.DOWNLOADED &&
    Boolean(root.localDirectory)
  );
}

function isRootAlreadySatisfied(root: RootRecord) {
  return (
    root.pinStatus === BackupStatus.PINNED ||
    (!env.KUBO_API_URL && hasDownloadedRoot(root))
  );
}

async function rootNeedsDependencyVerification(root: RootRecord) {
  if (!hasDownloadedRoot(root)) return false;
  return !(await dependencyManifestIsCurrent(root));
}

async function shouldSkipSatisfiedRoot(root: RootRecord) {
  if (!isRootAlreadySatisfied(root)) return false;
  return !(await rootNeedsDependencyVerification(root));
}

async function resolveDownloadResult(args: {
  client: DatabaseClient;
  input: BackupRootInput;
  root: RootRecord;
  startedAt: Date;
}) {
  const { client, input, root, startedAt } = args;
  if (hasDownloadedRoot(root)) {
    return {
      byteSize: root.byteSize ?? root.estimatedByteSize ?? 0,
    };
  }

  const { downloadResult } = await downloadRootAndRecord({
    client,
    input,
    root,
    startedAt,
  });
  return downloadResult;
}

function recentFailedRetryAt(root: RootRecord) {
  if (
    root.backupStatus !== BackupStatus.FAILED &&
    root.pinStatus !== BackupStatus.FAILED
  ) {
    return null;
  }

  return new Date(root.updatedAt.getTime() + FAILED_ROOT_RETRY_COOLDOWN_MS);
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

  // Intentionally don't emit a live event here. Deferrals are a routine
  // outcome while the current smart-pin tier is exhausted — surfacing one
  // per root floods the live feed with noise users don't need. The tier
  // advance event still surfaces when the budget moves up.

  return {
    status: "deferred",
    availableAt: new Date(Date.now() + policy.smartPinDeferMs),
    reason: "size",
    retainJob: false,
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

  if (root.relativePath) {
    const hydration = await hydrateCidDirectory({
      cid: root.cid,
      skipPath: root.relativePath,
    });
    if (hydration.downloaded > 0 || hydration.truncatedByBudget) {
      console.warn(
        `[archive] Hydrated ${hydration.downloaded} sibling asset(s) for ${root.cid} (${formatBytes(hydration.totalBytes)}${hydration.truncatedByBudget ? ", truncated by budget" : ""}).`,
      );
    }
  }

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

  // Flip artwork-level status to DOWNLOADED now so the UI shows "Almost saved"
  // immediately, even if the pin step below takes a while (or fails).
  await syncArtworksForRoot(client, root.id);

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
  // Pin by root.cid — the local-add path reads the cold-storage dir
  // laid out at ipfs/<root.cid>/<relativePath>. The earlier
  // parseIpfsReference(originalUrl) swap targeted the bitswap /pin/add
  // flow, which the local-add path doesn't need.
  const pinResult = await pinCidWithKubo(root.cid);

  if (!pinResult.pinned) {
    // Partial directory — local add produced a different CID. Keep the
    // file-tree copy on disk (hydration will fill in siblings on a
    // later worker pass), leave the row's pinStatus alone, and record
    // the skip so we have a breadcrumb in backup_runs. We deliberately
    // don't emit a live event here — it would just add noise while the
    // normal hydration path catches up.
    await recordBackupRun(client, {
      artworkId: input.artworkId,
      rootId: root.id,
      action: "PIN_BY_CID",
      status: BackupStatus.SKIPPED,
      provider: PinProvider.NONE,
      responsePayload: JSON.stringify(pinResult),
      startedAt,
      finishedAt: new Date(),
    });
    return;
  }

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
      // The file-tree copy was just deleted by the pin step, so the
      // hot-and-cold bookkeeping no longer points at a live directory.
      // Null the localDirectory so anything that reads this row later
      // knows the authoritative copy lives in kubo's blockstore.
      localDirectory: null,
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

  const startedAt = new Date();

  try {
    if (!input.bypassSmartBudget) {
      const retryAt = recentFailedRetryAt(root);
      if (retryAt && retryAt.getTime() > Date.now()) {
        return {
          status: "deferred",
          availableAt: retryAt,
          reason: "retry-cooldown",
          retainJob: false,
        };
      }
    }

    const deferred = await evaluateSmartBudget({ client, input, root });
    if (deferred) return deferred;

    if (await shouldSkipSatisfiedRoot(root)) {
      return { status: "skipped", availableAt: null };
    }

    const downloadedRoot = hasDownloadedRoot(root);
    const downloadResult = await resolveDownloadResult({
      client,
      input,
      root,
      startedAt,
    });

    try {
      await verifyArchivedRootDependencies({
        root,
        artwork: input.artwork,
      });
    } catch (error) {
      console.warn(
        `[archive] Dependency verification partial for ${root.cid}:`,
        error instanceof Error ? error.message : error,
      );
    }

    if (env.KUBO_API_URL) {
      try {
        await pinRootWithKubo({
          client,
          input,
          root,
          sizeBytes: downloadResult.byteSize,
          startedAt,
        });
      } catch (pinError) {
        // The file is already on disk. A pin failure shouldn't undo that or
        // flip the artwork back to "Retrying" — just record the pin as failed
        // so it gets retried, and let the root stay DOWNLOADED.
        const message =
          pinError instanceof Error ? pinError.message : "Unknown pin failure";
        console.warn(
          `[archive] Pin failed for ${root.cid}, leaving as DOWNLOADED:`,
          message,
        );
        await client.ipfsRoot.update({
          where: { id: root.id },
          data: {
            pinStatus: BackupStatus.FAILED,
            lastError: message,
          },
        });
        await recordBackupRun(client, {
          artworkId: input.artworkId,
          rootId: root.id,
          action: "PIN_BY_CID",
          status: BackupStatus.FAILED,
          provider: PinProvider.KUBO,
          errorMessage: message,
          startedAt,
          finishedAt: new Date(),
        });
      }
    } else if (!downloadedRoot) {
      await markPinSkipped(client, root.id);
    }

    await syncArtworksForRoot(client, root.id);

    return {
      status: "processed",
      availableAt: null,
    };
  } catch (error) {
    await recordRootFailure({ client, input, root, startedAt, error });
    throw error;
  }
}

type BackupSummary =
  | { outcome: "skipped"; reason: "artwork-not-found" }
  | {
      outcome: "deferred";
      availableAt: Date;
      message: string;
      retainJob?: boolean;
    }
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
        artwork,
        root: artwork.metadataRoot,
        bypassSmartBudget: options.bypassSmartBudget,
      }),
    );
  }

  if (artwork.mediaRoot) {
    rootResults.push(
      await backupSingleRoot(client, {
        artworkId: artwork.id,
        artwork,
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
      message:
        deferredRoot.reason === "retry-cooldown"
          ? `Paused a recently failed root for ${artwork.title} before trying it again.`
          : `Deferred larger root(s) for ${artwork.title} until a later smart-pin tier unlocks.`,
      retainJob: deferredRoot.retainJob,
    };
  }

  return { outcome: "completed", artwork: syncedArtwork };
}
