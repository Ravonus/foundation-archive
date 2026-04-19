"use client";

import type {
  BridgeConfig,
  RelayOwnerDevice,
} from "~/app/_components/desktop-bridge-provider";

import type { ConfigDraft } from "../types";

export const EMPTY_DRAFT: ConfigDraft = {
  downloadRootDir: "",
  syncEnabled: false,
  localGatewayBaseUrl: "",
  publicGatewayBaseUrl: "",
  relayEnabled: false,
  relayServerUrl: "",
  relayDeviceName: "",
  tunnelEnabled: false,
  tunnelHostname: null,
  tunnelLastError: null,
};

export function draftFromConfig(config: BridgeConfig): ConfigDraft {
  return {
    downloadRootDir: config.download_root_dir,
    syncEnabled: config.sync_enabled,
    localGatewayBaseUrl: config.local_gateway_base_url,
    publicGatewayBaseUrl: config.public_gateway_base_url,
    relayEnabled: config.relay_enabled,
    relayServerUrl: config.relay_server_url,
    relayDeviceName: config.relay_device_name,
    tunnelEnabled: config.tunnel_enabled,
    tunnelHostname: config.tunnel_hostname,
    tunnelLastError: config.tunnel_last_error,
  };
}

export function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export function pickPreferredDevice(devices: RelayOwnerDevice[]) {
  return devices.find((device) => device.connected) ?? devices[0] ?? null;
}
