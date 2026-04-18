import {
  BackupStatus,
  QueueJobKind,
  QueueJobStatus,
} from "~/server/prisma-client";
import { emitArchiveEvent } from "~/server/archive/live-events";
import { getArchivePolicyState } from "~/server/archive/state";

import { type DatabaseClient } from "./types";

const MIB = 1024 * 1024;
const SMART_PIN_TIER_FACTORS = [1, 2, 5] as const;

async function findSmallestDeferredRoot(
  client: DatabaseClient,
  smartPinMaxBytes: number,
) {
  return client.ipfsRoot.findFirst({
    where: {
      backupStatus: "PENDING",
      lastDeferredAt: {
        not: null,
      },
      OR: [
        {
          estimatedByteSize: {
            gt: smartPinMaxBytes,
          },
        },
        {
          byteSize: {
            gt: smartPinMaxBytes,
          },
        },
      ],
    },
    orderBy: [{ estimatedByteSize: "asc" }, { byteSize: "asc" }],
  });
}

async function hasPendingRootsInCurrentTier(
  client: DatabaseClient,
  smartPinMaxBytes: number,
) {
  const activeBackupJobs = await client.queueJob.findMany({
    where: {
      kind: QueueJobKind.BACKUP_ARTWORK,
      status: {
        in: [QueueJobStatus.PENDING, QueueJobStatus.RUNNING],
      },
    },
    select: {
      dedupeKey: true,
    },
  });

  const artworkIds = activeBackupJobs
    .map((job) => job.dedupeKey)
    .filter((value): value is string => Boolean(value));

  if (artworkIds.length === 0) {
    return false;
  }

  const artworks = await client.artwork.findMany({
    where: {
      id: {
        in: artworkIds,
      },
    },
    select: {
      metadataRoot: {
        select: {
          backupStatus: true,
          pinStatus: true,
          localDirectory: true,
          estimatedByteSize: true,
          byteSize: true,
        },
      },
      mediaRoot: {
        select: {
          backupStatus: true,
          pinStatus: true,
          localDirectory: true,
          estimatedByteSize: true,
          byteSize: true,
        },
      },
    },
  });

  return artworks.some((artwork) =>
    [artwork.metadataRoot, artwork.mediaRoot].some((root) => {
      if (!root) return false;

      const alreadySatisfied =
        root.pinStatus === BackupStatus.PINNED ||
        (root.backupStatus === BackupStatus.DOWNLOADED &&
          Boolean(root.localDirectory));

      if (alreadySatisfied) {
        return false;
      }

      const size = root.estimatedByteSize ?? root.byteSize;
      return size === null || size <= smartPinMaxBytes;
    }),
  );
}

function nextSmartPinBudgetTier(currentBytes: number, ceilingBytes: number) {
  if (currentBytes >= ceilingBytes) {
    return ceilingBytes;
  }

  const ceilingMiB = Math.max(Math.ceil(ceilingBytes / MIB), 1);

  for (let magnitude = 1; magnitude <= ceilingMiB * 10; magnitude *= 10) {
    for (const factor of SMART_PIN_TIER_FACTORS) {
      const candidate = factor * magnitude * MIB;
      if (candidate > currentBytes) {
        return Math.min(candidate, ceilingBytes);
      }
    }
  }

  return ceilingBytes;
}

async function automaticCrawlerScanCompleted(client: DatabaseClient) {
  const [totalAutoCrawlers, unfinishedAutoCrawlers] = await Promise.all([
    client.contractCrawlerState.count({
      where: {
        autoEnabled: true,
      },
    }),
    client.contractCrawlerState.count({
      where: {
        autoEnabled: true,
        completed: false,
      },
    }),
  ]);

  return totalAutoCrawlers > 0 && unfinishedAutoCrawlers === 0;
}

async function hasActiveAutomationBacklog(client: DatabaseClient) {
  const pendingAutomationJobs = await client.queueJob.count({
    where: {
      status: {
        in: [QueueJobStatus.PENDING, QueueJobStatus.RUNNING],
      },
      kind: {
        in: [
          QueueJobKind.INGEST_FOUNDATION_URL,
          QueueJobKind.INGEST_CONTRACT_TOKEN,
          QueueJobKind.SCAN_CONTRACT_TOKENS,
        ],
      },
    },
  });

  return pendingAutomationJobs > 0;
}

export async function maybeAdvanceSmartPinBudget(
  client: DatabaseClient,
  input: {
    completedFoundationPass: boolean;
  },
) {
  const policy = await getArchivePolicyState(client);
  if (!input.completedFoundationPass) {
    return {
      advanced: false,
      policy,
    };
  }

  const [hasCurrentTierWork, scanCompleted, hasAutomationBacklog] =
    await Promise.all([
      hasPendingRootsInCurrentTier(client, policy.smartPinMaxBytes),
      automaticCrawlerScanCompleted(client),
      hasActiveAutomationBacklog(client),
    ]);

  if (hasCurrentTierWork || !scanCompleted || hasAutomationBacklog) {
    return {
      advanced: false,
      policy,
    };
  }

  const smallestDeferredRoot = await findSmallestDeferredRoot(
    client,
    policy.smartPinMaxBytes,
  );

  if (!smallestDeferredRoot) {
    return {
      advanced: false,
      policy,
    };
  }

  const target =
    smallestDeferredRoot.estimatedByteSize ?? smallestDeferredRoot.byteSize;
  const nextBudget = nextSmartPinBudgetTier(
    policy.smartPinMaxBytes,
    policy.smartPinCeilingBytes,
  );

  if (nextBudget <= policy.smartPinMaxBytes) {
    return {
      advanced: false,
      policy,
    };
  }

  const updatedPolicy = await client.archivePolicyState.update({
    where: { id: policy.id },
    data: {
      smartPinMaxBytes: nextBudget,
      lastBudgetRaisedAt: new Date(),
      lastBudgetReason:
        "Advanced to the next smart-pin tier after a full Foundation scan pass",
    },
  });

  await emitArchiveEvent(client, {
    type: "policy.smart-pin-budget-raised",
    summary: `Advanced the smart-pin tier to ${nextBudget} bytes after a full Foundation scan pass.`,
    cid: smallestDeferredRoot.cid,
    sizeBytes: target,
    data: {
      previousBudgetBytes: policy.smartPinMaxBytes,
      nextBudgetBytes: nextBudget,
      targetCid: smallestDeferredRoot.cid,
    },
  });

  return {
    advanced: true,
    policy: updatedPolicy,
  };
}
