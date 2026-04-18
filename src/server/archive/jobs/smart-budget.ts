import { BackupStatus } from "~/server/prisma-client";

export type SmartBudgetRootSnapshot = {
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
    (root.backupStatus === BackupStatus.DOWNLOADED &&
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

export function artworkBlockedBySmartBudget(
  artwork: SmartBudgetArtworkSnapshot,
  smartPinMaxBytes: number,
) {
  if (!artwork) {
    return false;
  }

  const unsatisfiedRoots = [artwork.metadataRoot, artwork.mediaRoot].filter(
    (root): root is Exclude<SmartBudgetRootSnapshot, null> =>
      !rootAlreadySatisfied(root),
  );

  if (unsatisfiedRoots.length === 0) {
    return false;
  }

  return unsatisfiedRoots.every((root) =>
    rootKnownTooLarge(root, smartPinMaxBytes),
  );
}
