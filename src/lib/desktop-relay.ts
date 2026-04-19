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
  previewLocalGatewayUrl: string | null;
  previewPublicGatewayUrl: string | null;
  mediaKind: string | null;
  metadataCid: string | null;
  mediaCid: string | null;
  relatedCids: string[];
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
export const PUBLIC_UTILITY_GATEWAY_BASE_URL = "https://dweb.link";

function isLoopback(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function rewriteConfiguredSocketUrl(configured: URL) {
  if (typeof window === "undefined") return configured.toString();

  const configuredLoopback = isLoopback(configured.hostname);
  const currentLoopback = isLoopback(window.location.hostname);

  if (configuredLoopback && !currentLoopback) {
    return window.location.origin;
  }

  return configured.toString();
}

export function resolveArchiveSocketUrl() {
  const envUrl = process.env.NEXT_PUBLIC_ARCHIVE_SOCKET_URL;
  if (envUrl) {
    if (typeof window !== "undefined") {
      try {
        return rewriteConfiguredSocketUrl(new URL(envUrl));
      } catch {
        return envUrl;
      }
    }

    return envUrl;
  }

  if (typeof window === "undefined") {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    return siteUrl?.length ? siteUrl : "https://foundation.agorix.io";
  }

  if (isLoopback(window.location.hostname)) {
    return `${window.location.protocol}//${window.location.hostname}:43129`;
  }

  return window.location.origin;
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

export function buildPublicUtilityGatewayUrl(cid: string) {
  return `${PUBLIC_UTILITY_GATEWAY_BASE_URL}/ipfs/${encodeURIComponent(cid.trim())}`;
}
