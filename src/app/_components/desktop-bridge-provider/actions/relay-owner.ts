import type { RelayPinEnrichmentMatch } from "~/lib/desktop-relay";

import { parseBridgeError, withJsonHeaders } from "../lib/bridge-api";
import { pickRelayDevice } from "../lib/builders";
import {
  isTerminalJobStatus,
  subscribeToJobUpdates,
  type JobUpdateEvent,
} from "../lib/job-subscriptions";
import type {
  BridgeConfig,
  DesktopShareableWork,
  RelayDeviceStateSnapshot,
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
  setRelayDeviceStates: (
    updater: (
      current: Record<string, RelayDeviceStateSnapshot>,
    ) => Record<string, RelayDeviceStateSnapshot>,
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
  updateRelayDeviceConfig: (
    deviceId: string,
    input: Partial<BridgeConfig>,
  ) => Promise<RelayQueuedJob>;
  repairRelayDevicePins: (deviceId: string) => Promise<RelayQueuedJob>;
  syncRelayDevicePins: (deviceId: string) => Promise<RelayQueuedJob>;
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

const RELAY_JOB_TIMEOUT_MS = 45_000;

function requireOwnerToken(token: string | null): string {
  if (!token) {
    throw new Error("Pair vault is not ready yet.");
  }
  return token;
}

async function resolveRelayTargetDevice(
  deps: RelayOwnerDeps,
  refreshRelayDevices: () => Promise<RelayOwnerDevice[]>,
  deviceId?: string | null,
) {
  const devices =
    deps.relayDevices.length > 0
      ? deps.relayDevices
      : await refreshRelayDevices();
  const targetDevice = pickRelayDevice(devices, deviceId);

  if (!targetDevice) {
    throw new Error("No linked desktop device is available yet.");
  }

  return targetDevice;
}

function waitForRelayJobOutcome(
  jobId: string,
  timeoutMs: number,
): Promise<JobUpdateEvent> {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => undefined as void;
    const timer = window.setTimeout(() => {
      unsubscribe();
      reject(
        new Error(
          "The linked desktop app did not confirm the backup in time. Please check the desktop page and try again.",
        ),
      );
    }, timeoutMs);

    unsubscribe = subscribeToJobUpdates(jobId, (event) => {
      if (!isTerminalJobStatus(event.status)) return;
      window.clearTimeout(timer);
      unsubscribe();
      resolve(event);
    });
  });
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
    const deviceIds = new Set(payload.devices.map((device) => device.id));
    deps.setRelayDevices(payload.devices);
    deps.setRelayInventories((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([deviceId]) => deviceIds.has(deviceId)),
      ),
    );
    deps.setRelayDeviceStates((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([deviceId]) => deviceIds.has(deviceId)),
      ),
    );
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

    deps.setRelayDevices(
      deps.relayDevices.filter((device) => device.id !== deviceId),
    );
    deps.setRelayInventories((current) => {
      const next = { ...current };
      delete next[deviceId];
      return next;
    });
    deps.setRelayDeviceStates((current) => {
      const next = { ...current };
      delete next[deviceId];
      return next;
    });
    await refreshRelayDevices().catch(() => undefined);
  };
}

function createQueueRelayDeviceAction(deps: RelayOwnerDeps) {
  return async <T extends object>({
    deviceId,
    kind,
    payload,
    fallback,
  }: {
    deviceId: string;
    kind: "UPDATE_CONFIG" | "REPAIR_PINS" | "SYNC_PINS";
    payload: T;
    fallback: string;
  }) => {
    const ownerToken = requireOwnerToken(deps.ownerToken);

    const response = await fetch(
      "/api/relay/owner/device-action",
      withJsonHeaders({
        ownerToken,
        deviceId,
        kind,
        payload,
      }),
    );

    if (!response.ok) {
      throw new Error(await parseBridgeError(response, fallback));
    }

    return (await response.json()) as RelayQueuedJob;
  };
}

function createUpdateRelayDeviceConfig(deps: RelayOwnerDeps) {
  const queueRelayDeviceAction = createQueueRelayDeviceAction(deps);

  return async (deviceId: string, input: Partial<BridgeConfig>) =>
    queueRelayDeviceAction({
      deviceId,
      kind: "UPDATE_CONFIG",
      payload: {
        download_root_dir: input.download_root_dir,
        sync_enabled: input.sync_enabled,
        local_gateway_base_url: input.local_gateway_base_url,
        public_gateway_base_url: input.public_gateway_base_url,
        relay_enabled: input.relay_enabled,
        relay_server_url: input.relay_server_url,
        relay_device_name: input.relay_device_name,
        tunnel_enabled: input.tunnel_enabled,
      },
      fallback: "Unable to send updated settings to the linked desktop app.",
    });
}

function createRepairRelayDevicePins(deps: RelayOwnerDeps) {
  const queueRelayDeviceAction = createQueueRelayDeviceAction(deps);

  return async (deviceId: string) =>
    queueRelayDeviceAction({
      deviceId,
      kind: "REPAIR_PINS",
      payload: {},
      fallback:
        "Unable to ask the linked desktop app to re-save missing works.",
    });
}

function createSyncRelayDevicePins(deps: RelayOwnerDeps) {
  const queueRelayDeviceAction = createQueueRelayDeviceAction(deps);

  return async (deviceId: string) =>
    queueRelayDeviceAction({
      deviceId,
      kind: "SYNC_PINS",
      payload: {},
      fallback:
        "Unable to ask the linked desktop app to copy saved works into its sync folder.",
    });
}

export function createQueueWorkToRelay(
  deps: RelayOwnerDeps,
  refreshRelayDevices: () => Promise<RelayOwnerDevice[]>,
  requestRelayInventory: (deviceId: string) => void,
) {
  return async (work: DesktopShareableWork, deviceId?: string | null) => {
    const ownerToken = requireOwnerToken(deps.ownerToken);
    const targetDevice = await resolveRelayTargetDevice(
      deps,
      refreshRelayDevices,
      deviceId,
    );

    const relayWorkPayload = {
      title: work.title,
      contractAddress: work.contractAddress,
      tokenId: work.tokenId,
      foundationUrl: work.foundationUrl ?? null,
      artistUsername: work.artistUsername ?? null,
      metadataCid: work.metadataCid ?? null,
      mediaCid: work.mediaCid ?? null,
      metadataUrl: work.metadataUrl ?? null,
      sourceUrl: work.sourceUrl ?? null,
      mediaUrl: work.mediaUrl ?? null,
    };

    const response = await fetch(
      "/api/relay/owner/queue-work",
      withJsonHeaders({
        ownerToken,
        deviceId: targetDevice.id,
        work: relayWorkPayload,
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
    const outcome = await waitForRelayJobOutcome(
      payload.jobId,
      RELAY_JOB_TIMEOUT_MS,
    );

    if (outcome.status === "FAILED") {
      throw new Error(
        outcome.errorMessage ??
          "The linked desktop app couldn't save this work.",
      );
    }

    await refreshRelayDevices().catch(() => undefined);
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
  const updateRelayDeviceConfig = createUpdateRelayDeviceConfig(deps);
  const repairRelayDevicePins = createRepairRelayDevicePins(deps);
  const syncRelayDevicePins = createSyncRelayDevicePins(deps);

  return {
    refreshRelayDevices,
    createRelayPairing,
    disconnectRelayDevice,
    updateRelayDeviceConfig,
    repairRelayDevicePins,
    syncRelayDevicePins,
    enrichPins,
  };
}
