import { shortAddress } from "~/lib/utils";
import type {
  BridgePinInventoryItem,
  PinVerificationResult,
  RelayOwnerDevice,
} from "~/app/_components/desktop-bridge-provider";

export type PinMatch = {
  role: "METADATA" | "MEDIA";
  id: string;
  slug: string;
  title: string;
  artistName: string | null;
  artistUsername: string | null;
  foundationUrl: string | null;
  chainId: number;
  contractAddress: string;
  tokenId: string;
  posterUrl: string | null;
};

export type ConfigDraft = {
  downloadRootDir: string;
  syncEnabled: boolean;
  localGatewayBaseUrl: string;
  publicGatewayBaseUrl: string;
  relayEnabled: boolean;
  relayServerUrl: string;
  relayDeviceName: string;
  tunnelEnabled: boolean;
  tunnelHostname: string | null;
  tunnelLastError: string | null;
};

export type PinVerificationSummary = PinVerificationResult & {
  totalRoots: number;
  checkedRoots: number;
  reachableRoots: number;
  incomplete: boolean;
  hasFailure: boolean;
};

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)),
  );
}

function pinMatchScore(match: PinMatch) {
  let score = 0;
  if (match.role === "MEDIA") score += 4;
  if (match.posterUrl) score += 2;
  if (match.foundationUrl) score += 1;
  if (match.artistUsername) score += 1;
  return score;
}

export function pinItemCids(item: BridgePinInventoryItem) {
  return uniqueNonEmpty([
    item.cid,
    item.mediaCid,
    item.metadataCid,
    ...item.relatedCids,
  ]);
}

export function pinMatchesForItem(
  item: BridgePinInventoryItem,
  pinEnrichment: Record<string, PinMatch[]>,
) {
  const deduped = new Map<string, PinMatch>();

  for (const cid of pinItemCids(item)) {
    for (const match of pinEnrichment[cid] ?? []) {
      const key = match.id;
      const existing = deduped.get(key);
      if (!existing || pinMatchScore(match) > pinMatchScore(existing)) {
        deduped.set(key, match);
      }
    }
  }

  return Array.from(deduped.values()).sort((left, right) => {
    const scoreDelta = pinMatchScore(right) - pinMatchScore(left);
    if (scoreDelta !== 0) return scoreDelta;
    return left.title.localeCompare(right.title);
  });
}

export function pinVerificationForItem(
  item: BridgePinInventoryItem,
  verifications: Record<string, PinVerificationResult>,
): PinVerificationSummary | null {
  const cids = pinItemCids(item);
  const entries = cids
    .map((cid) => verifications[cid] ?? null)
    .filter((entry): entry is PinVerificationResult => Boolean(entry));

  if (entries.length === 0) return null;

  const reachableEntries = entries.filter(
    (entry) => entry.reachable && entry.providerCount > 0,
  );
  const failedEntries = entries.filter(
    (entry) =>
      !entry.reachable || entry.providerCount <= 0 || Boolean(entry.error),
  );
  const checkedAt = entries.reduce((latest, entry) => {
    if (!latest) return entry.checkedAt;
    return latest > entry.checkedAt ? latest : entry.checkedAt;
  }, "");

  return {
    cid: item.cid,
    reachable:
      failedEntries.length === 0 &&
      entries.length === cids.length &&
      reachableEntries.length === cids.length,
    providerCount:
      reachableEntries.length > 0
        ? Math.min(...reachableEntries.map((entry) => entry.providerCount))
        : 0,
    checkedAt,
    error:
      failedEntries[0]?.error ??
      (failedEntries.length > 0
        ? `Only ${reachableEntries.length} of ${cids.length} linked roots are visible on the network.`
        : null),
    totalRoots: cids.length,
    checkedRoots: entries.length,
    reachableRoots: reachableEntries.length,
    incomplete: entries.length < cids.length,
    hasFailure: failedEntries.length > 0,
  };
}

export function itemLabel(item: BridgePinInventoryItem) {
  if (item.title) return item.title;
  if (item.label) return item.label;
  if (item.foundationUrl) return "Foundation root";
  return "IPFS root";
}

export function itemContext(item: BridgePinInventoryItem) {
  if (item.contractAddress && item.tokenId) {
    return `${shortAddress(item.contractAddress)} #${item.tokenId}`;
  }

  if (item.username) return `@${item.username}`;
  if (item.artistUsername) return `@${item.artistUsername}`;
  return "Pinned on your computer";
}

export function statusLabel(device: RelayOwnerDevice | null) {
  if (!device) return "Not connected";
  if (device.connected) return "Connected";
  return "Offline";
}
