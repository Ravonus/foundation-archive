"use client";

import { useEffect, useEffectEvent } from "react";

import type {
  BridgePinsResponse,
  RelayOwnerDevice,
} from "~/app/_components/desktop-bridge-provider";

import { pickPreferredDevice } from "./desktop-console-shared";

type InventoryCidCarrier = {
  cid: string;
  mediaCid?: string | null;
  metadataCid?: string | null;
  relatedCids?: string[];
};

function inventoryItemCids(item: InventoryCidCarrier) {
  return Array.from(
    new Set(
      [item.cid, item.mediaCid, item.metadataCid, ...(item.relatedCids ?? [])]
        .map((cid) => cid?.trim() ?? "")
        .filter(Boolean),
    ),
  );
}

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
  const requestEnrichment = useEffectEvent((cids: string[]) => {
    void enrichPins(cids).catch(() => null);
  });

  useEffect(() => {
    const localCids =
      localInventory?.items.flatMap((item) => inventoryItemCids(item)) ?? [];
    const relayCids = Object.values(relayInventories).flatMap((snapshot) =>
      snapshot.items.flatMap((item) => inventoryItemCids(item)),
    );
    const allCids = Array.from(new Set([...localCids, ...relayCids]));

    if (allCids.length === 0) return;
    requestEnrichment(allCids);
  }, [localInventory, relayInventories]);
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
  const requestInventory = useEffectEvent((deviceId: string) => {
    requestRelayInventory(deviceId);
  });

  useEffect(() => {
    for (const device of relayDevices) {
      if (device.connected && !relayInventories[device.id]) {
        requestInventory(device.id);
      }
    }
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
