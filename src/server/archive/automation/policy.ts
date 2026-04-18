import {
  BackupStatus,
  QueueJobKind,
  QueueJobStatus,
} from "~/server/prisma-client";
import { emitArchiveEvent } from "~/server/archive/live-events";
import { getArchivePolicyState } from "~/server/archive/state";

import { type DatabaseClient } from "./types";

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

export async function maybeAdvanceSmartPinBudget(client: DatabaseClient) {
  const policy = await getArchivePolicyState(client);
  if (
    policy.lastBudgetRaisedAt &&
    Date.now() - policy.lastBudgetRaisedAt.getTime() < policy.smartPinDeferMs
  ) {
    return {
      advanced: false,
      policy,
    };
  }

  if (await hasPendingRootsInCurrentTier(client, policy.smartPinMaxBytes)) {
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
    smallestDeferredRoot.estimatedByteSize ??
    smallestDeferredRoot.byteSize ??
    Math.ceil(policy.smartPinMaxBytes * policy.smartPinGrowthFactor);

  const nextBudget = Math.min(
    policy.smartPinCeilingBytes,
    Math.max(
      Math.ceil(policy.smartPinMaxBytes * policy.smartPinGrowthFactor),
      target,
    ),
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
      lastBudgetReason: `Raised to include ${smallestDeferredRoot.cid}`,
    },
  });

  await emitArchiveEvent(client, {
    type: "policy.smart-pin-budget-raised",
    summary: `Smart pin budget widened to ${nextBudget} bytes.`,
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
