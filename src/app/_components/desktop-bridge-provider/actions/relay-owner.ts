import type { RelayPinEnrichmentMatch } from "~/lib/desktop-relay";

import { parseBridgeError, withJsonHeaders } from "../lib/bridge-api";
import { pickRelayDevice } from "../lib/builders";
import type {
  DesktopShareableWork,
  RelayInventorySnapshot,
  RelayOwnerDevice,
  RelayPairing,
  RelayQueuedJob,
} from "../types";

export type RelayOwnerDeps = {
  ownerToken: string | null;
  relayDevices: RelayOwnerDevice[];
  pinEnrichment: Record<string, RelayPinEnrichmentMatch[]>;
  setRelayDevices: (devices: RelayOwnerDevice[]) => void;
  setRelayInventories: (
    updater: (
      current: Record<string, RelayInventorySnapshot>,
    ) => Record<string, RelayInventorySnapshot>,
  ) => void;
  setPinEnrichment: (
    enrichment: Record<string, RelayPinEnrichmentMatch[]>,
  ) => void;
};

export type RelayOwnerActions = {
  refreshRelayDevices: () => Promise<RelayOwnerDevice[]>;
  createRelayPairing: (label?: string | null) => Promise<RelayPairing>;
  requestRelayInventory: (deviceId: string) => void;
  disconnectRelayDevice: (deviceId: string) => Promise<void>;
  queueWorkToRelay: (
    work: DesktopShareableWork,
    deviceId?: string | null,
  ) => Promise<RelayQueuedJob>;
  enrichPins: (
    cids: string[],
  ) => Promise<Record<string, RelayPinEnrichmentMatch[]>>;
};

export type RelayOwnerBaseActions = Omit<
  RelayOwnerActions,
  "requestRelayInventory" | "queueWorkToRelay"
>;

function requireOwnerToken(token: string | null): string {
  if (!token) {
    throw new Error("Pair vault is not ready yet.");
  }
  return token;
}

function createRefreshRelayDevices(deps: RelayOwnerDeps) {
  return async () => {
    const ownerToken = requireOwnerToken(deps.ownerToken);

    const response = await fetch(
      "/api/relay/owner/devices",
      withJsonHeaders({ ownerToken }),
    );
    if (!response.ok) {
      throw new Error(
        await parseBridgeError(
          response,
          "Unable to load linked desktop devices.",
        ),
      );
    }

    const payload = (await response.json()) as { devices: RelayOwnerDevice[] };
    deps.setRelayDevices(payload.devices);
    return payload.devices;
  };
}

function createCreateRelayPairing(deps: RelayOwnerDeps) {
  return async (label?: string | null) => {
    const ownerToken = requireOwnerToken(deps.ownerToken);

    const response = await fetch(
      "/api/relay/owner/pair",
      withJsonHeaders({
        ownerToken,
        label: label ?? null,
      }),
    );

    if (!response.ok) {
      throw new Error(
        await parseBridgeError(
          response,
          "Unable to create a desktop pairing code.",
        ),
      );
    }

    return (await response.json()) as RelayPairing;
  };
}

function createDisconnectRelayDevice(
  deps: RelayOwnerDeps,
  refreshRelayDevices: () => Promise<RelayOwnerDevice[]>,
) {
  return async (deviceId: string) => {
    const ownerToken = requireOwnerToken(deps.ownerToken);

    const response = await fetch(
      "/api/relay/owner/disconnect-device",
      withJsonHeaders({
        ownerToken,
        deviceId,
      }),
    );

    if (!response.ok) {
      throw new Error(
        await parseBridgeError(
          response,
          "Unable to disconnect this desktop app.",
        ),
      );
    }

    deps.setRelayInventories((current) => {
      const next = { ...current };
      delete next[deviceId];
      return next;
    });
    await refreshRelayDevices().catch(() => undefined);
  };
}

export function createQueueWorkToRelay(
  deps: RelayOwnerDeps,
  refreshRelayDevices: () => Promise<RelayOwnerDevice[]>,
  requestRelayInventory: (deviceId: string) => void,
) {
  return async (work: DesktopShareableWork, deviceId?: string | null) => {
    const ownerToken = requireOwnerToken(deps.ownerToken);

    const devices =
      deps.relayDevices.length > 0
        ? deps.relayDevices
        : await refreshRelayDevices();
    const targetDevice = pickRelayDevice(devices, deviceId);

    if (!targetDevice) {
      throw new Error("No linked desktop device is available yet.");
    }

    const response = await fetch(
      "/api/relay/owner/queue-work",
      withJsonHeaders({
        ownerToken,
        deviceId: targetDevice.id,
        work: {
          title: work.title,
          contractAddress: work.contractAddress,
          tokenId: work.tokenId,
          foundationUrl: work.foundationUrl ?? null,
          artistUsername: work.artistUsername ?? null,
          metadataCid: work.metadataCid ?? null,
          mediaCid: work.mediaCid ?? null,
        },
      }),
    );

    if (!response.ok) {
      throw new Error(
        await parseBridgeError(
          response,
          "Unable to queue this work for the linked desktop app.",
        ),
      );
    }

    const payload = (await response.json()) as RelayQueuedJob;
    void refreshRelayDevices().catch(() => undefined);
    requestRelayInventory(targetDevice.id);
    return payload;
  };
}

function normalizeCids(
  cids: string[],
  pinEnrichment: Record<string, RelayPinEnrichmentMatch[]>,
) {
  return Array.from(
    new Set(cids.map((cid) => cid.trim()).filter((cid) => cid.length > 0)),
  ).filter((cid) => pinEnrichment[cid] === undefined);
}

function createEnrichPins(deps: RelayOwnerDeps) {
  return async (cids: string[]) => {
    if (!deps.ownerToken) {
      return {};
    }

    const nextCids = normalizeCids(cids, deps.pinEnrichment);

    if (nextCids.length === 0) {
      return deps.pinEnrichment;
    }

    const response = await fetch(
      "/api/relay/owner/pin-enrichment",
      withJsonHeaders({
        ownerToken: deps.ownerToken,
        cids: nextCids,
      }),
    );

    if (!response.ok) {
      throw new Error(
        await parseBridgeError(
          response,
          "Unable to load Foundation pin context.",
        ),
      );
    }

    const payload = (await response.json()) as {
      enrichments: Array<{
        cid: string;
        matches: RelayPinEnrichmentMatch[];
      }>;
    };

    const nextMap = { ...deps.pinEnrichment };
    for (const item of payload.enrichments) {
      nextMap[item.cid] = item.matches;
    }
    for (const cid of nextCids) {
      if (!(cid in nextMap)) {
        nextMap[cid] = [];
      }
    }
    deps.setPinEnrichment(nextMap);
    return nextMap;
  };
}

export function createRelayOwnerActions(
  deps: RelayOwnerDeps,
): RelayOwnerBaseActions {
  const refreshRelayDevices = createRefreshRelayDevices(deps);
  const createRelayPairing = createCreateRelayPairing(deps);
  const disconnectRelayDevice = createDisconnectRelayDevice(
    deps,
    refreshRelayDevices,
  );
  const enrichPins = createEnrichPins(deps);

  return {
    refreshRelayDevices,
    createRelayPairing,
    disconnectRelayDevice,
    enrichPins,
  };
}
