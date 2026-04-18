export type RelayPinInventoryItem = {
  cid: string;
  pinned: boolean;
  pinType: string | null;
  managed: boolean;
  label: string | null;
  sourceKind: string | null;
  title: string | null;
  contractAddress: string | null;
  tokenId: string | null;
  foundationUrl: string | null;
  artistUsername: string | null;
  accountAddress: string | null;
  username: string | null;
  addedAt: string | null;
  lastVerifiedAt: string | null;
  lastRepairedAt: string | null;
  lastError: string | null;
  pinReference: string | null;
  verifyCount: number;
  repairCount: number;
  syncPath: string | null;
  localGatewayUrl: string | null;
  publicGatewayUrl: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  syncCount: number;
};

export type RelayPinEnrichmentMatch = {
  role: "METADATA" | "MEDIA";
  id: string;
  slug: string;
  title: string;
  artistName: string | null;
  artistUsername: string | null;
  foundationUrl: string | null;
  contractAddress: string;
  tokenId: string;
  posterUrl: string | null;
};

export type RelayOwnerWireMessage =
  | {
      type: "owner.snapshot";
      devices: unknown[];
    }
  | {
      type: "owner.inventory";
      deviceId: string;
      generatedAt: string;
      items: RelayPinInventoryItem[];
    }
  | {
      type: "owner.jobUpdate";
      deviceId: string;
      jobId: string;
      status: string;
      createdAt?: string;
      finishedAt?: string | null;
      errorMessage?: string | null;
    }
  | {
      type: "owner.error";
      message: string;
    };

export type RelayOwnerClientMessage =
  | {
      type: "owner.refresh";
    }
  | {
      type: "owner.requestInventory";
      deviceId: string;
    };

export const FOUNDATION_SHARE_BRIDGE_SCHEME = "foundationsharebridge";

export function resolveArchiveSocketUrl() {
  if (process.env.NEXT_PUBLIC_ARCHIVE_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_ARCHIVE_SOCKET_URL;
  }

  if (typeof window === "undefined") return "http://127.0.0.1:43129";
  return `${window.location.protocol}//${window.location.hostname}:43129`;
}

export function resolveArchiveRelayWebSocketUrl(ownerToken: string) {
  const baseUrl = resolveArchiveSocketUrl();
  const url = new URL("/desktop-relay", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("role", "owner");
  url.searchParams.set("ownerToken", ownerToken);
  return url.toString();
}

export function buildFoundationShareBridgeDeepLink(input: {
  relayServerUrl: string;
  pairingCode: string;
  deviceName: string;
}) {
  const params = new URLSearchParams();
  params.set("relay_server_url", input.relayServerUrl);
  params.set("pairing_code", input.pairingCode);
  params.set("device_name", input.deviceName);
  return `${FOUNDATION_SHARE_BRIDGE_SCHEME}://pair?${params.toString()}`;
}
