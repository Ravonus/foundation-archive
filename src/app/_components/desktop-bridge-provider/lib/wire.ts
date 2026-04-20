import type { BridgeConfig, BridgeHealth } from "../types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pickString(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const candidate = raw[key];
    if (typeof candidate === "string") return candidate;
  }
  return "";
}

function pickOptionalString(
  raw: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const candidate = raw[key];
    if (typeof candidate === "string") return candidate;
    if (candidate === null) return null;
  }
  return null;
}

function pickBool(raw: Record<string, unknown>, ...keys: string[]): boolean {
  for (const key of keys) {
    const candidate = raw[key];
    if (typeof candidate === "boolean") return candidate;
  }
  return false;
}

function pickNumber(raw: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const candidate = raw[key];
    if (typeof candidate === "number") return candidate;
  }
  return 0;
}

function pickOptionalNumber(
  raw: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    const candidate = raw[key];
    if (typeof candidate === "number") return candidate;
    if (candidate === null) return null;
  }
  return null;
}

export function normalizeBridgeHealth(payload: unknown): BridgeHealth {
  const raw = asRecord(payload);
  return {
    status: pickString(raw, "status"),
    service: pickString(raw, "service"),
    ipfs_api_url: pickString(raw, "ipfsApiUrl", "ipfs_api_url"),
    state_file: pickString(raw, "stateFile", "state_file"),
    config_file: pickString(raw, "configFile", "config_file"),
    active_sessions: pickNumber(raw, "activeSessions", "active_sessions"),
    watched_pin_count: pickNumber(raw, "watchedPinCount", "watched_pin_count"),
    repair_interval_seconds: pickNumber(
      raw,
      "repairIntervalSeconds",
      "repair_interval_seconds",
    ),
    last_repair_cycle_at: pickOptionalString(
      raw,
      "lastRepairCycleAt",
      "last_repair_cycle_at",
    ),
    download_root_dir: pickString(raw, "downloadRootDir", "download_root_dir"),
    sync_enabled: pickBool(raw, "syncEnabled", "sync_enabled"),
    local_gateway_base_url: pickString(
      raw,
      "localGatewayBaseUrl",
      "local_gateway_base_url",
    ),
    public_gateway_base_url: pickString(
      raw,
      "publicGatewayBaseUrl",
      "public_gateway_base_url",
    ),
    relay_enabled: pickBool(raw, "relayEnabled", "relay_enabled"),
    relay_server_url: pickString(raw, "relayServerUrl", "relay_server_url"),
    relay_device_name: pickString(raw, "relayDeviceName", "relay_device_name"),
    relay_device_id: pickOptionalString(raw, "relayDeviceId", "relay_device_id"),
    relay_device_label: pickOptionalString(
      raw,
      "relayDeviceLabel",
      "relay_device_label",
    ),
    relay_last_connected_at: pickOptionalString(
      raw,
      "relayLastConnectedAt",
      "relay_last_connected_at",
    ),
    relay_last_error: pickOptionalString(
      raw,
      "relayLastError",
      "relay_last_error",
    ),
    now: pickString(raw, "now"),
  };
}

export function normalizeBridgeConfig(payload: unknown): BridgeConfig {
  const raw = asRecord(payload);
  return {
    download_root_dir: pickString(raw, "downloadRootDir", "download_root_dir"),
    sync_enabled: pickBool(raw, "syncEnabled", "sync_enabled"),
    local_gateway_base_url: pickString(
      raw,
      "localGatewayBaseUrl",
      "local_gateway_base_url",
    ),
    public_gateway_base_url: pickString(
      raw,
      "publicGatewayBaseUrl",
      "public_gateway_base_url",
    ),
    relay_enabled: pickBool(raw, "relayEnabled", "relay_enabled"),
    relay_server_url: pickString(raw, "relayServerUrl", "relay_server_url"),
    relay_device_name: pickString(raw, "relayDeviceName", "relay_device_name"),
    relay_device_id: pickOptionalString(raw, "relayDeviceId", "relay_device_id"),
    relay_device_label: pickOptionalString(
      raw,
      "relayDeviceLabel",
      "relay_device_label",
    ),
    relay_last_connected_at: pickOptionalString(
      raw,
      "relayLastConnectedAt",
      "relay_last_connected_at",
    ),
    relay_last_error: pickOptionalString(
      raw,
      "relayLastError",
      "relay_last_error",
    ),
    tunnel_enabled: pickBool(raw, "tunnelEnabled", "tunnel_enabled"),
    tunnel_hostname: pickOptionalString(raw, "tunnelHostname", "tunnel_hostname"),
    tunnel_last_error: pickOptionalString(
      raw,
      "tunnelLastError",
      "tunnel_last_error",
    ),
    config_file: pickString(raw, "configFile", "config_file"),
  };
}

export type BridgeSessionSummary = {
  session_id: string;
  website_origin: string;
  account_address: string | null;
  profile_username: string | null;
  client_name: string | null;
  connected_at: string;
};

export function normalizeBridgeSessionSummary(
  payload: unknown,
): BridgeSessionSummary {
  const raw = asRecord(payload);
  return {
    session_id: pickString(raw, "sessionId", "session_id"),
    website_origin: pickString(raw, "websiteOrigin", "website_origin"),
    account_address: pickOptionalString(
      raw,
      "accountAddress",
      "account_address",
    ),
    profile_username: pickOptionalString(
      raw,
      "profileUsername",
      "profile_username",
    ),
    client_name: pickOptionalString(raw, "clientName", "client_name"),
    connected_at: pickString(raw, "connectedAt", "connected_at"),
  };
}

// Re-export pickOptionalNumber so downstream may use it for future fields.
export { pickOptionalNumber };
