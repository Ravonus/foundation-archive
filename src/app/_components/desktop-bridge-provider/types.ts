import type {
  RelayPinEnrichmentMatch,
  RelayPinInventoryItem,
} from "~/lib/desktop-relay";

export type BridgeSession = {
  session_id: string;
  session_secret: string;
  website_origin: string;
  account_address: string | null;
  profile_username: string | null;
  client_name: string | null;
  connected_at: string;
};

export type ConnectSessionResponse = {
  session: BridgeSession;
  message: string;
};

export type BridgeHealth = {
  status: string;
  service: string;
  ipfs_api_url: string;
  state_file: string;
  config_file: string;
  active_sessions: number;
  watched_pin_count: number;
  repair_interval_seconds: number;
  last_repair_cycle_at: string | null;
  download_root_dir: string;
  sync_enabled: boolean;
  local_gateway_base_url: string;
  public_gateway_base_url: string;
  relay_enabled: boolean;
  relay_server_url: string;
  relay_device_name: string;
  relay_device_id: string | null;
  relay_device_label: string | null;
  relay_last_connected_at: string | null;
  relay_last_error: string | null;
  now: string;
};

export type BridgeConfig = {
  download_root_dir: string;
  sync_enabled: boolean;
  local_gateway_base_url: string;
  public_gateway_base_url: string;
  relay_enabled: boolean;
  relay_server_url: string;
  relay_device_name: string;
  relay_device_id: string | null;
  relay_device_label: string | null;
  relay_last_connected_at: string | null;
  relay_last_error: string | null;
  config_file: string;
};

export type RelayOwnerDevice = {
  id: string;
  deviceLabel: string;
  relayEnabled: boolean;
  connected: boolean;
  lastSeenAt: string | null;
  lastError: string | null;
  lastCompletedJobAt: string | null;
  createdAt: string;
  pendingJobCount: number;
  recentJobs: Array<{
    id: string;
    kind: string;
    status: string;
    errorMessage: string | null;
    createdAt: string;
    finishedAt: string | null;
  }>;
};

export type RelayPairing = {
  id: string;
  pairingCode: string;
  expiresAt: string;
  label: string | null;
};

export type RelayQueuedJob = {
  jobId: string;
  status: string;
  createdAt: string;
};

export type BridgePinInventoryItem = RelayPinInventoryItem;

export type BridgePinsResponse = {
  total: number;
  pinnedCount: number;
  managedCount: number;
  last_repair_cycle_at: string | null;
  items: BridgePinInventoryItem[];
};

export type RepairPinsResult = {
  repaired: number;
  healthy: number;
  failed: number;
  message: string;
};

export type SyncPinsResult = {
  synced: number;
  failed: number;
  skipped: number;
  message: string;
};

export type ShareWorkResult = {
  share_id: string;
  title: string;
  contract_address: string;
  token_id: string;
  foundation_url: string | null;
  artist_username: string | null;
  message: string;
  pins: Array<{
    cid: string;
    label: string | null;
    pinned: boolean;
    provider: string;
    pin_reference: string;
    requested_at: string;
  }>;
};

export type DesktopShareableWork = {
  title: string;
  contractAddress: string;
  tokenId: string;
  foundationUrl?: string | null;
  artistUsername?: string | null;
  metadataCid?: string | null;
  mediaCid?: string | null;
};

export type RelayInventorySnapshot = {
  deviceId: string;
  generatedAt: string;
  items: BridgePinInventoryItem[];
};

export type BridgeStatus = "checking" | "disconnected" | "connected";

export type BridgeNetworkStatus = {
  attempts: number;
  nextRetryAt: number | null;
  lastError: string | null;
  retrying: boolean;
};

export type PinVerificationResult = {
  cid: string;
  reachable: boolean;
  providerCount: number;
  checkedAt: string;
  error: string | null;
};

export type VerifyPinsResult = {
  checkedAt: string;
  results: PinVerificationResult[];
};

export type DesktopBridgeContextValue = {
  bridgeUrl: string;
  setBridgeUrl: (url: string) => void;
  status: BridgeStatus;
  networkStatus: BridgeNetworkStatus;
  retryNetwork: () => void;
  pinVerifications: Record<string, PinVerificationResult>;
  verifyPins: (cids?: string[]) => Promise<VerifyPinsResult>;
  session: BridgeSession | null;
  health: BridgeHealth | null;
  config: BridgeConfig | null;
  ownerToken: string | null;
  relayDevices: RelayOwnerDevice[];
  relayInventories: Record<string, RelayInventorySnapshot>;
  relaySocketConnected: boolean;
  localBridgeProbeEnabled: boolean;
  pinEnrichment: Record<string, RelayPinEnrichmentMatch[]>;
  error: string | null;
  reachable: boolean;
  connect: () => Promise<BridgeSession>;
  disconnect: () => Promise<void>;
  unlinkLocalRelay: () => Promise<void>;
  refreshHealth: () => Promise<BridgeHealth>;
  fetchConfig: () => Promise<BridgeConfig>;
  updateConfig: (input: Partial<BridgeConfig>) => Promise<BridgeConfig>;
  listPins: () => Promise<BridgePinsResponse>;
  repairPins: () => Promise<RepairPinsResult>;
  syncPins: () => Promise<SyncPinsResult>;
  refreshRelayDevices: () => Promise<RelayOwnerDevice[]>;
  requestRelayInventory: (deviceId: string) => void;
  disconnectRelayDevice: (deviceId: string) => Promise<void>;
  createRelayPairing: (label?: string | null) => Promise<RelayPairing>;
  linkLocalBridgeToRelay: (
    label?: string | null,
    relayServerUrl?: string | null,
  ) => Promise<RelayOwnerDevice[]>;
  buildRelayPairingUrl: (
    pairing: RelayPairing,
    relayServerUrl?: string | null,
    deviceName?: string | null,
  ) => string;
  enrichPins: (
    cids: string[],
  ) => Promise<Record<string, RelayPinEnrichmentMatch[]>>;
  queueWorkToRelay: (
    work: DesktopShareableWork,
    deviceId?: string | null,
  ) => Promise<RelayQueuedJob>;
  shareWork: (work: DesktopShareableWork) => Promise<ShareWorkResult>;
  buildWorkShareUrl: (work: DesktopShareableWork) => Promise<string>;
  buildSessionViewUrl: () => string | null;
  clearError: () => void;
};
