/* eslint-disable complexity, max-lines */

import {
  BackupStatus,
  PinProvider,
  QueueJobKind,
  QueueJobStatus,
  type RootKind,
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
  kuboHasRecursivePin,
  hydrateCidDirectory,
  pinCidWithKubo,
  pinCidWithKuboNetwork,
} from "~/server/archive/storage";
import {
  buildRelayGatewayUrl,
  findRelayGatewayCandidates,
} from "~/server/relay/pin-routing";
import {
  indexKuboDagCids,
  syncArtworkRootCidIndex,
} from "~/server/archive/cid-index";
import {
  type DatabaseClient,
  FAILED_ROOT_RETRY_COOLDOWN_MS,
  loadArtworkLiveCard,
  recordBackupRun,
  syncArtworkStatuses,
  syncArtworksForRoot,
} from "./shared";
import { probeRootSize } from "./root-size-probe";

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
    id: string;
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
type ResolvedDownloadResult = {
  byteSize: number;
  alreadyPinned?: boolean;
  hasLocalArchive: boolean;
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
}): Promise<ResolvedDownloadResult> {
  const { client, input, root, startedAt } = args;
  if (hasDownloadedRoot(root)) {
    return {
      byteSize: root.byteSize ?? root.estimatedByteSize ?? 0,
      hasLocalArchive: true,
    };
  }

  try {
    const { downloadResult } = await downloadRootAndRecord({
      client,
      input,
      root,
      startedAt,
    });
    return {
      byteSize: downloadResult.byteSize,
      hasLocalArchive: true,
    };
  } catch (error) {
    if (!env.KUBO_API_URL) throw error;
    return pinRootWithKuboNetworkFallback({
      client,
      input,
      root,
      startedAt,
      reason: error,
    });
  }
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

async function evaluateSmartBudget(args: {
  client: DatabaseClient;
  input: BackupRootInput;
  root: RootRecord;
}): Promise<DeferredOutcome | null> {
  const { client, input, root } = args;
  if (input.bypassSmartBudget) return null;

  const policy = await getArchivePolicyState(client);
  const { estimatedByteSize, mimeType } = await probeRootSize(root);
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
    retainJob: true,
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

  const gatewayUrls = await gatewayUrlsForPinnedRelayPeers(client, root);
  const downloadResult = await downloadFileToArchive({
    cid: root.cid,
    relativePath: root.relativePath,
    gatewayUrl: root.gatewayUrl,
    originalUrl: root.originalUrl,
    gatewayUrls,
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

function relayPathSegments(root: RootRecord) {
  return (root.relativePath ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

async function gatewayUrlsForPinnedRelayPeers(
  client: DatabaseClient,
  root: RootRecord,
) {
  const candidates = await findRelayGatewayCandidates(client, root.cid).catch(
    () => [],
  );
  const segments = relayPathSegments(root);
  return candidates
    .map((candidate) => buildRelayGatewayUrl(candidate, root.cid, segments))
    .filter((url): url is string => Boolean(url));
}

function formatPinReason(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

async function markRootPinnedByKubo(args: {
  client: DatabaseClient;
  input: BackupRootInput;
  root: RootRecord;
  startedAt: Date;
  sizeBytes: number;
  provider: "kubo-existing-pin" | "kubo-network";
  reason?: unknown;
}) {
  const { client, input, root, startedAt, sizeBytes, provider, reason } = args;
  await client.ipfsRoot.update({
    where: { id: root.id },
    data: {
      backupStatus: BackupStatus.DOWNLOADED,
      pinStatus: BackupStatus.PINNED,
      pinProvider: PinProvider.KUBO,
      pinReference: root.cid,
      lastDownloadedAt: new Date(),
      lastPinnedAt: new Date(),
      lastDeferredAt: null,
      deferredUntilByteSize: null,
      localDirectory: null,
      lastError: null,
    },
  });

  await recordBackupRun(client, {
    artworkId: input.artworkId,
    rootId: root.id,
    action: "PIN_BY_CID",
    status: BackupStatus.PINNED,
    provider: PinProvider.KUBO,
    notes: reason
      ? `Pinned through ${provider} after: ${formatPinReason(reason)}`
      : `Pinned through ${provider}.`,
    responsePayload: JSON.stringify({
      pinned: true,
      provider,
      reference: root.cid,
    }),
    startedAt,
    finishedAt: new Date(),
  });

  await syncArtworksForRoot(client, root.id);

  await emitArchiveEvent(client, {
    type: "root.pinned",
    summary: `Pinned ${root.cid} on the server.`,
    artwork: await loadArtworkLiveCard(client, input.artworkId),
    cid: root.cid,
    sizeBytes,
    data: {
      pinReference: root.cid,
      provider,
    },
  });
}

async function markExistingKuboPinIfPresent(args: {
  client: DatabaseClient;
  input: BackupRootInput;
  root: RootRecord;
  startedAt: Date;
}) {
  const { client, input, root, startedAt } = args;
  if (!env.KUBO_API_URL) return false;
  if (!(await kuboHasRecursivePin(root.cid))) return false;

  await markRootPinnedByKubo({
    client,
    input,
    root,
    startedAt,
    sizeBytes: root.byteSize ?? root.estimatedByteSize ?? 0,
    provider: "kubo-existing-pin",
  });
  return true;
}

async function pinRootWithKuboNetworkFallback(args: {
  client: DatabaseClient;
  input: BackupRootInput;
  root: RootRecord;
  startedAt: Date;
  reason: unknown;
}): Promise<ResolvedDownloadResult> {
  const { client, input, root, startedAt, reason } = args;
  await pinCidWithKuboNetwork(root.cid);
  const sizeBytes = root.byteSize ?? root.estimatedByteSize ?? 0;

  await markRootPinnedByKubo({
    client,
    input,
    root,
    startedAt,
    sizeBytes,
    provider: "kubo-network",
    reason,
  });

  return {
    byteSize: sizeBytes,
    alreadyPinned: true,
    hasLocalArchive: false,
  };
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
    return false;
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

  return true;
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

async function tryIndexRootDagCids(args: {
  client: DatabaseClient;
  input: BackupRootInput;
  root: RootRecord;
}) {
  if (!env.KUBO_API_URL) return;

  try {
    const result = await indexKuboDagCids({
      client: args.client,
      artworkId: args.input.artworkId,
      rootId: args.root.id,
      rootKind: args.root.kind,
      rootCid: args.root.cid,
    });

    if (result.indexed > 0) {
      console.warn(
        `[archive] Indexed ${result.indexed} child CID(s) for ${args.root.cid}.`,
      );
    }
  } catch (error) {
    console.warn(
      `[archive] Child CID indexing skipped for ${args.root.cid}:`,
      error instanceof Error ? error.message : error,
    );
  }
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

async function pinResolvedRootWithKubo(args: {
  client: DatabaseClient;
  input: BackupRootInput;
  root: RootRecord;
  downloadResult: ResolvedDownloadResult;
  startedAt: Date;
}) {
  const { client, input, root, downloadResult, startedAt } = args;
  try {
    const pinnedLocally = await pinRootWithKubo({
      client,
      input,
      root,
      sizeBytes: downloadResult.byteSize,
      startedAt,
    });
    if (!pinnedLocally) {
      await pinRootWithKuboNetworkFallback({
        client,
        input,
        root,
        startedAt,
        reason: "Local archive directory did not reproduce the root CID.",
      });
    }
  } catch (pinError) {
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
}

async function backupSingleRoot(
  client: DatabaseClient,
  input: BackupRootInput,
): Promise<ProcessedOutcome | DeferredOutcome | SkippedOutcome | null> {
  if (!input.root) return null;
  const root = input.root;

  const startedAt = new Date();

  try {
    if (
      await markExistingKuboPinIfPresent({
        client,
        input,
        root,
        startedAt,
      })
    ) {
      await tryIndexRootDagCids({ client, input, root });
      return {
        status: "processed",
        availableAt: null,
      };
    }

    if (!input.bypassSmartBudget) {
      const retryAt = recentFailedRetryAt(root);
      if (retryAt && retryAt.getTime() > Date.now()) {
        return {
          status: "deferred",
          availableAt: retryAt,
          reason: "retry-cooldown",
          retainJob: true,
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

    if (downloadResult.hasLocalArchive) {
      try {
        await verifyArchivedRootDependencies({
          client,
          root,
          artwork: input.artwork,
        });
      } catch (error) {
        console.warn(
          `[archive] Dependency verification partial for ${root.cid}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    await tryIndexRootDagCids({ client, input, root });

    if (env.KUBO_API_URL && !downloadResult.alreadyPinned) {
      await pinResolvedRootWithKubo({
        client,
        input,
        root,
        downloadResult,
        startedAt,
      });
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

  await syncArtworkRootCidIndex(client, artwork.id);

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
