import type { BridgeConfig, BridgeHealth } from "../types";

export function bridgeConfigFromHealth(payload: BridgeHealth): BridgeConfig {
  return {
    download_root_dir: payload.download_root_dir,
    sync_enabled: payload.sync_enabled,
    local_gateway_base_url: payload.local_gateway_base_url,
    public_gateway_base_url: payload.public_gateway_base_url,
    relay_enabled: payload.relay_enabled,
    relay_server_url: payload.relay_server_url,
    relay_device_name: payload.relay_device_name,
    relay_device_id: payload.relay_device_id,
    relay_device_label: payload.relay_device_label,
    relay_last_connected_at: payload.relay_last_connected_at,
    relay_last_error: payload.relay_last_error,
    config_file: payload.config_file,
  };
}
