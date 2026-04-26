import { BackupStatus } from "~/server/prisma-client";

import { archivePinningEnabled } from "./shared";

export type SmartBudgetRootSnapshot = {
  id?: string;
  backupStatus: BackupStatus;
  pinStatus: BackupStatus;
  localDirectory: string | null;
  estimatedByteSize: number | null;
  byteSize: number | null;
} | null;

export type SmartBudgetArtworkSnapshot = {
  metadataRoot: SmartBudgetRootSnapshot;
  mediaRoot: SmartBudgetRootSnapshot;
} | null;

export function rootAlreadySatisfied(root: SmartBudgetRootSnapshot) {
  if (!root) return true;

  return (
    root.pinStatus === BackupStatus.PINNED ||
    (!archivePinningEnabled() &&
      root.backupStatus === BackupStatus.DOWNLOADED &&
      Boolean(root.localDirectory))
  );
}

export function rootKnownTooLarge(
  root: Exclude<SmartBudgetRootSnapshot, null>,
  smartPinMaxBytes: number,
) {
  const size = root.estimatedByteSize ?? root.byteSize;
  return size !== null && size > smartPinMaxBytes;
}

export function rootNeedsFailedRepair(
  root: Exclude<SmartBudgetRootSnapshot, null>,
) {
  return (
    !rootAlreadySatisfied(root) &&
    (root.backupStatus === BackupStatus.FAILED ||
      root.pinStatus === BackupStatus.FAILED)
  );
}

export function artworkNeedsOnlyFailedRootRepair(
  artwork: SmartBudgetArtworkSnapshot,
) {
  const unsatisfiedRoots = unsatisfiedSmartBudgetRoots(artwork);
  return (
    unsatisfiedRoots.length > 0 &&
    unsatisfiedRoots.every((root) => rootNeedsFailedRepair(root))
  );
}

export function artworkBlockedBySmartBudget(
  artwork: SmartBudgetArtworkSnapshot,
  smartPinMaxBytes: number,
) {
  if (!artwork) {
    return false;
  }

  const unsatisfiedRoots = unsatisfiedSmartBudgetRoots(artwork);

  if (unsatisfiedRoots.length === 0) {
    return false;
  }

  return unsatisfiedRoots.every((root) =>
    rootKnownTooLarge(root, smartPinMaxBytes),
  );
}

export function unsatisfiedSmartBudgetRoots(
  artwork: SmartBudgetArtworkSnapshot,
) {
  if (!artwork) {
    return [];
  }

  return [artwork.metadataRoot, artwork.mediaRoot].filter(
    (root): root is Exclude<SmartBudgetRootSnapshot, null> =>
      !rootAlreadySatisfied(root),
  );
}

export function unsatisfiedSmartBudgetRootIds(
  artwork: SmartBudgetArtworkSnapshot,
) {
  return unsatisfiedSmartBudgetRoots(artwork)
    .map((root) => root.id)
    .filter((value): value is string => Boolean(value));
}

export function nextProcessableRootPriority(
  artwork: SmartBudgetArtworkSnapshot,
  smartPinMaxBytes: number,
) {
  if (!artwork) {
    return {
      rank: 4,
      size: Number.MAX_SAFE_INTEGER,
    };
  }

  const unsatisfiedRoots = unsatisfiedSmartBudgetRoots(artwork);
  if (
    unsatisfiedRoots.length > 0 &&
    unsatisfiedRoots.every((root) => rootNeedsFailedRepair(root))
  ) {
    return {
      rank: 2,
      size: Number.MAX_SAFE_INTEGER,
    };
  }

  let sawUnknownSize = false;
  let smallestKnownSize: number | null = null;

  for (const root of unsatisfiedRoots) {
    const size = root.estimatedByteSize ?? root.byteSize;
    if (size === null) {
      sawUnknownSize = true;
      continue;
    }

    if (size > smartPinMaxBytes) {
      continue;
    }

    smallestKnownSize =
      smallestKnownSize === null ? size : Math.min(smallestKnownSize, size);
  }

  if (smallestKnownSize !== null) {
    return {
      rank: 0,
      size: smallestKnownSize,
    };
  }

  if (sawUnknownSize) {
    return {
      rank: 1,
      size: Number.MAX_SAFE_INTEGER,
    };
  }

  return {
    rank: 3,
    size: Number.MAX_SAFE_INTEGER,
  };
}
