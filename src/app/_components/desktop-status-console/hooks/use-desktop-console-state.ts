"use client";

import { useDesktopBridge } from "~/app/_components/desktop-bridge-provider";

import {
  useDesktopConsoleConfigDraftSync,
  useDesktopConsoleInitialLoad,
} from "./use-desktop-console-initial-load";
import { useDesktopConsoleRawState } from "./use-desktop-console-raw-state";
import {
  useDesktopConsolePinEnrichment,
  useDesktopConsoleRemoteConfigSync,
  useDesktopConsoleRelayInventoryRequests,
  useDesktopConsoleSelectedDeviceSync,
} from "./use-desktop-console-sync";
import { useDesktopConsoleTransitions } from "./use-desktop-console-transitions";

export type DesktopConsoleState = ReturnType<typeof useDesktopConsoleState>;

export function useDesktopConsoleState() {
  const bridge = useDesktopBridge();
  const raw = useDesktopConsoleRawState();
  const transitions = useDesktopConsoleTransitions();

  useDesktopConsoleConfigDraftSync(bridge.config, raw.setConfigDraft);
  useDesktopConsoleInitialLoad({
    bridge,
    setLocalInventory: raw.setLocalInventory,
    setConfigDraft: raw.setConfigDraft,
    setLastLocalRefreshAt: raw.setLastLocalRefreshAt,
    setFeedback: raw.setFeedback,
  });
  useDesktopConsolePinEnrichment({
    localInventory: raw.localInventory,
    relayInventories: bridge.relayInventories,
    enrichPins: bridge.enrichPins,
  });
  useDesktopConsoleRelayInventoryRequests({
    relayDevices: bridge.relayDevices,
    relayInventories: bridge.relayInventories,
    requestRelayInventory: bridge.requestRelayInventory,
  });
  useDesktopConsoleSelectedDeviceSync({
    relayDevices: bridge.relayDevices,
    selectedDeviceId: raw.selectedDeviceId,
    setSelectedDeviceId: raw.setSelectedDeviceId,
  });
  useDesktopConsoleRemoteConfigSync({
    relayDevices: bridge.relayDevices,
    relayDeviceStates: bridge.relayDeviceStates,
    selectedDeviceId: raw.selectedDeviceId,
    setConfigDraft: raw.setConfigDraft,
  });

  return { bridge, raw, transitions };
}
