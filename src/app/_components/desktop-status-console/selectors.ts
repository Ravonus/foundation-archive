import type { RelayOwnerDevice } from "~/app/_components/desktop-bridge-provider";

import type { ConfigDraft } from "./types";
import type { DesktopConsoleState } from "./hooks/use-desktop-console-state";

export function resolveRelayServerUrl(draft: ConfigDraft) {
  if (draft.relayServerUrl) return draft.relayServerUrl;
  return typeof window !== "undefined" ? window.location.origin : "";
}

export function pickSelectedDevice(
  state: DesktopConsoleState,
): RelayOwnerDevice | null {
  const { relayDevices } = state.bridge;
  const { selectedDeviceId } = state.raw;

  return (
    relayDevices.find((device) => device.id === selectedDeviceId) ??
    relayDevices.find((device) => device.connected) ??
    relayDevices[0] ??
    null
  );
}

function resolveInventoryLabel(
  selectedDevice: RelayOwnerDevice | null,
  reachable: boolean,
) {
  if (selectedDevice?.deviceLabel) return selectedDevice.deviceLabel;
  return reachable ? "This computer" : "Your computer";
}

export function buildVisibleInventory(
  state: DesktopConsoleState,
  selectedDevice: RelayOwnerDevice | null,
) {
  const { bridge, raw } = state;
  const selectedSnapshot = selectedDevice
    ? (bridge.relayInventories[selectedDevice.id] ?? null)
    : null;
  const visibleInventory =
    selectedSnapshot ?? (selectedDevice ? null : raw.localInventory);
  const visibleItems = visibleInventory?.items ?? [];
  const pinnedCount = visibleItems.filter((item) => item.pinned).length;

  return {
    visibleItems,
    visibleInventoryLabel: resolveInventoryLabel(
      selectedDevice,
      bridge.reachable,
    ),
    visibleInventoryTime:
      selectedSnapshot?.generatedAt ?? raw.lastLocalRefreshAt ?? null,
    pinnedCount,
  };
}
