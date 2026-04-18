"use client";

import { useEffect } from "react";

import type {
  BridgePinsResponse,
  RelayOwnerDevice,
} from "~/app/_components/desktop-bridge-provider";

import { pickPreferredDevice } from "./desktop-console-shared";

type PinEnrichmentArgs = {
  localInventory: BridgePinsResponse | null;
  relayInventories: Record<string, { items: { cid: string }[] }>;
  enrichPins: (cids: string[]) => Promise<unknown>;
};

export function useDesktopConsolePinEnrichment({
  localInventory,
  relayInventories,
  enrichPins,
}: PinEnrichmentArgs) {
  useEffect(() => {
    const localCids = localInventory?.items.map((item) => item.cid) ?? [];
    const relayCids = Object.values(relayInventories).flatMap((snapshot) =>
      snapshot.items.map((item) => item.cid),
    );
    const allCids = Array.from(new Set([...localCids, ...relayCids]));

    if (allCids.length === 0) return;
    void enrichPins(allCids).catch(() => null);
  }, [localInventory, relayInventories, enrichPins]);
}

type RelayInventoryArgs = {
  relayDevices: RelayOwnerDevice[];
  relayInventories: Record<string, unknown>;
  requestRelayInventory: (deviceId: string) => void;
};

export function useDesktopConsoleRelayInventoryRequests({
  relayDevices,
  relayInventories,
  requestRelayInventory,
}: RelayInventoryArgs) {
  useEffect(() => {
    for (const device of relayDevices) {
      if (device.connected && !relayInventories[device.id]) {
        requestRelayInventory(device.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relayDevices, relayInventories]);
}

type SelectedDeviceArgs = {
  relayDevices: RelayOwnerDevice[];
  selectedDeviceId: string | null;
  setSelectedDeviceId: (id: string | null) => void;
};

export function useDesktopConsoleSelectedDeviceSync({
  relayDevices,
  selectedDeviceId,
  setSelectedDeviceId,
}: SelectedDeviceArgs) {
  useEffect(() => {
    if (relayDevices.length === 0) {
      setSelectedDeviceId(null);
      return;
    }

    const selectedStillExists = relayDevices.some(
      (device) => device.id === selectedDeviceId,
    );

    if (selectedStillExists) return;

    const preferred = pickPreferredDevice(relayDevices);
    setSelectedDeviceId(preferred?.id ?? null);
  }, [relayDevices, selectedDeviceId, setSelectedDeviceId]);
}
