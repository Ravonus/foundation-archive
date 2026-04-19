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

export function hasConnectedRelayDevice(devices: RelayOwnerDevice[]) {
  return devices.some((device) => device.connected);
}

function resolveInventoryLabel(input: {
  selectedDevice: RelayOwnerDevice | null;
  reachable: boolean;
  usingRelaySnapshot: boolean;
}) {
  if (input.usingRelaySnapshot && input.selectedDevice?.deviceLabel) {
    return input.selectedDevice.deviceLabel;
  }

  if (input.reachable) {
    return "This computer";
  }

  return "Your computer";
}

export function buildVisibleInventory(
  state: DesktopConsoleState,
  selectedDevice: RelayOwnerDevice | null,
) {
  const { bridge, raw } = state;
  const selectedSnapshot = selectedDevice
    ? (bridge.relayInventories[selectedDevice.id] ?? null)
    : null;
  const visibleInventory = selectedSnapshot ?? raw.localInventory;
  const visibleItems = visibleInventory?.items ?? [];
  const pinnedCount = visibleItems.filter((item) => item.pinned).length;

  return {
    visibleItems,
    visibleInventoryLabel: resolveInventoryLabel({
      selectedDevice,
      reachable: bridge.reachable,
      usingRelaySnapshot: Boolean(selectedSnapshot),
    }),
    visibleInventoryTime:
      selectedSnapshot?.generatedAt ?? raw.lastLocalRefreshAt ?? null,
    pinnedCount,
  };
}
