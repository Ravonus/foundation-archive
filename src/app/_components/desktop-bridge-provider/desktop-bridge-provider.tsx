/* eslint-disable max-lines-per-function */

"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { RelayOwnerClientMessage } from "~/lib/desktop-relay";
import type { RelayPinEnrichmentMatch } from "~/lib/desktop-relay";

import {
  createLocalBridgeActions,
  type LocalBridgeDeps,
} from "./actions/local-bridge";
import {
  createQueueWorkToRelay,
  createRelayOwnerActions,
  type RelayOwnerDeps,
} from "./actions/relay-owner";
import {
  buildRelayPairingUrl as buildRelayPairingUrlPure,
  buildSessionViewUrl as buildSessionViewUrlPure,
  buildWorkShareUrl as buildWorkShareUrlPure,
} from "./lib/builders";
import { trimTrailingSlash } from "./lib/bridge-api";
import {
  BRIDGE_SESSION_KEY,
  BRIDGE_URL_KEY,
  DEFAULT_BRIDGE_URL,
  RELAY_DEVICES_CACHE_KEY,
} from "./constants";
import { DesktopBridgeContext } from "./context";
import { bridgeConfigFromHealth } from "./lib/derive-config";
import type {
  BridgeConfig,
  BridgeHealth,
  BridgeSession,
  DesktopBridgeContextValue,
  BridgeStatus,
  DesktopShareableWork,
  PinVerificationResult,
  RelayDeviceStateSnapshot,
  RelayInventorySnapshot,
  RelayOwnerDevice,
  RelayPairing,
} from "./types";
import { useBridgeHealthProbe } from "./hooks/use-bridge-health-probe";
import { useInitialStorage } from "./hooks/use-initial-storage";
import { useOwnerRefresh } from "./hooks/use-owner-refresh";
import { usePinVerificationLoop } from "./hooks/use-pin-verification-loop";
import { useRelaySocket } from "./hooks/use-relay-socket";

/// Read the cached relay devices snapshot once at mount so the Save-to-
/// computer button can render instantly on page refresh instead of waiting
/// a second or two for the owner socket to handshake. The cache is treated
/// as an optimistic bootstrap only; fresh snapshots replace it.
function readCachedRelayDevices(): RelayOwnerDevice[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(RELAY_DEVICES_CACHE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RelayOwnerDevice[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function localRelayLabel(config: BridgeConfig) {
  const configuredLabel = config.relay_device_label?.trim();
  if (configuredLabel && configuredLabel.length > 0) return configuredLabel;

  const configuredName = config.relay_device_name.trim();
  if (configuredName.length > 0) return configuredName;

  return "Foundation desktop app";
}

function createLocalRelayDevice(input: {
  deviceId: string;
  label: string;
  connected: boolean;
  lastSeenAt: string | null;
  lastError: string | null;
  createdAt: string;
}): RelayOwnerDevice {
  return {
    id: input.deviceId,
    deviceLabel: input.label,
    relayEnabled: true,
    connected: input.connected,
    lastSeenAt: input.lastSeenAt,
    lastError: input.lastError,
    lastCompletedJobAt: null,
    createdAt: input.createdAt,
    pendingJobCount: 0,
    recentJobs: [],
  };
}

function relayDevicesWithLocalBridge(input: {
  devices: RelayOwnerDevice[];
  config: BridgeConfig | null;
  reachable: boolean;
  health: BridgeHealth | null;
}) {
  const { devices, config, reachable, health } = input;
  const deviceId = config?.relay_device_id?.trim();
  if (!deviceId || !config?.relay_enabled) return devices;

  const now = health?.now ?? new Date().toISOString();
  const label = localRelayLabel(config);
  const connectionTime = reachable
    ? now
    : (config.relay_last_connected_at ?? null);
  const markConnected = (device: RelayOwnerDevice): RelayOwnerDevice =>
    device.id === deviceId
      ? {
          ...device,
          connected: reachable,
          relayEnabled: true,
          deviceLabel: device.deviceLabel.length > 0 ? device.deviceLabel : label,
          lastSeenAt: device.lastSeenAt ?? connectionTime,
          lastError: null,
        }
      : device;

  const existing = devices.find((device) => device.id === deviceId);
  if (existing) return devices.map(markConnected);

  return [
    createLocalRelayDevice({
      deviceId,
      label,
      connected: reachable,
      lastSeenAt: connectionTime,
      lastError: config.relay_last_error,
      createdAt: now,
    }),
    ...devices,
  ];
}

export function DesktopBridgeProvider({ children }: { children: ReactNode }) {
  const [bridgeUrl, setBridgeUrlState] = useState(DEFAULT_BRIDGE_URL);
  const [session, setSession] = useState<BridgeSession | null>(null);
  const [status, setStatus] = useState<BridgeStatus>("checking");
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [config, setConfig] = useState<BridgeConfig | null>(null);
  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const [relayDevices, setRelayDevices] = useState<RelayOwnerDevice[]>(() =>
    readCachedRelayDevices(),
  );
  const [relayInventories, setRelayInventories] = useState<
    Record<string, RelayInventorySnapshot>
  >({});
  const [relayDeviceStates, setRelayDeviceStates] = useState<
    Record<string, RelayDeviceStateSnapshot>
  >({});
  const [relaySocketConnected, setRelaySocketConnected] = useState(false);
  const [pinEnrichment, setPinEnrichment] = useState<
    Record<string, RelayPinEnrichmentMatch[]>
  >({});
  const [reachable, setReachable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinVerifications, setPinVerifications] = useState<
    Record<string, PinVerificationResult>
  >({});
  const relaySocketRef = useRef<WebSocket | null>(null);

  useInitialStorage({ setBridgeUrlState, setSession, setOwnerToken });

  // Persist the relay device snapshot so the next page load can bootstrap
  // from it immediately instead of flickering through a disconnected state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (relayDevices.length === 0) {
      window.localStorage.removeItem(RELAY_DEVICES_CACHE_KEY);
      return;
    }
    try {
      window.localStorage.setItem(
        RELAY_DEVICES_CACHE_KEY,
        JSON.stringify(relayDevices),
      );
    } catch {
      // Quota / disabled storage — best effort.
    }
  }, [relayDevices]);

  const {
    networkStatus,
    probeEnabled: localBridgeProbeEnabled,
    retryNow: retryNetwork,
  } = useBridgeHealthProbe(bridgeUrl, session, config, {
    setHealth,
    setConfig,
    setReachable,
    setStatus,
  });

  useRelaySocket(ownerToken, relaySocketRef, {
    setRelaySocketConnected,
    setRelayDevices,
    setRelayInventories,
    setRelayDeviceStates,
    setError,
  });

  const visibleRelayDevices = useMemo(
    () =>
      relayDevicesWithLocalBridge({
        devices: relayDevices,
        config,
        reachable,
        health,
      }),
    [config, health, reachable, relayDevices],
  );

  const persistSession = (nextSession: BridgeSession | null) => {
    setSession(nextSession);
    if (nextSession) {
      window.localStorage.setItem(
        BRIDGE_SESSION_KEY,
        JSON.stringify(nextSession),
      );
    } else {
      window.localStorage.removeItem(BRIDGE_SESSION_KEY);
    }
  };

  const setBridgeUrl = (nextUrl: string) => {
    const normalized = trimTrailingSlash(nextUrl.trim() || DEFAULT_BRIDGE_URL);
    setBridgeUrlState(normalized);
    window.localStorage.setItem(BRIDGE_URL_KEY, normalized);
  };

  const relayOwnerDeps: RelayOwnerDeps = {
    ownerToken,
    relaySocketConnected,
    relayDevices: visibleRelayDevices,
    pinEnrichment,
    setRelayDevices,
    setRelayInventories,
    setRelayDeviceStates,
    setPinEnrichment,
  };
  const requestRelayInventory = (deviceId: string) => {
    const socket = relaySocketRef.current;
    // `readyState` is typed `number` but the socket itself may be null or closed mid-teardown.
    if (socket?.readyState !== window.WebSocket.OPEN) return;

    socket.send(
      JSON.stringify({
        type: "owner.requestInventory",
        deviceId,
      } satisfies RelayOwnerClientMessage),
    );
  };
  const relayOwnerBaseActions = createRelayOwnerActions(relayOwnerDeps);
  const queueWorkToRelay = (
    work: DesktopShareableWork,
    deviceId?: string | null,
  ) =>
    createQueueWorkToRelay(
      relayOwnerDeps,
      relayOwnerBaseActions.refreshRelayDevices,
      requestRelayInventory,
    )(work, deviceId);
  const relayOwnerActions = {
    ...relayOwnerBaseActions,
    requestRelayInventory,
    queueWorkToRelay,
  };

  const localBridgeDeps: LocalBridgeDeps = {
    bridgeUrl,
    session,
    config,
    reachable,
    setHealth,
    setConfig,
    setReachable,
    setStatus,
    setError,
    persistSession,
    bridgeConfigFromHealth,
    createRelayPairing: relayOwnerBaseActions.createRelayPairing,
    refreshRelayDevices: relayOwnerBaseActions.refreshRelayDevices,
  };
  const localBridgeActions = createLocalBridgeActions(localBridgeDeps);

  useOwnerRefresh(ownerToken, relayOwnerBaseActions.refreshRelayDevices);

  const verifyPins = async (cids?: string[]) => {
    const result = await localBridgeActions.verifyPins(cids);
    setPinVerifications((prev) => {
      const next = { ...prev };
      for (const entry of result.results) next[entry.cid] = entry;
      return next;
    });
    return result;
  };

  usePinVerificationLoop(reachable, verifyPins);

  const buildRelayPairingUrl = (
    pairing: RelayPairing,
    relayServerUrl?: string | null,
    deviceName?: string | null,
  ) =>
    buildRelayPairingUrlPure({
      pairing,
      relayServerUrl,
      deviceName,
      config,
    });

  const buildWorkShareUrl = async (work: DesktopShareableWork) => {
    const activeSession = await localBridgeActions.ensureConnected();
    return buildWorkShareUrlPure(bridgeUrl, activeSession, work);
  };

  const value: DesktopBridgeContextValue = {
    bridgeUrl,
    setBridgeUrl,
    status,
    networkStatus,
    retryNetwork,
    pinVerifications,
    verifyPins,
    session,
    health,
    config,
    ownerToken,
    relayDevices: visibleRelayDevices,
    relayInventories,
    relayDeviceStates,
    relaySocketConnected,
    localBridgeProbeEnabled,
    pinEnrichment,
    error,
    reachable,
    connect: localBridgeActions.connect,
    disconnect: localBridgeActions.disconnect,
    unlinkLocalRelay: localBridgeActions.unlinkLocalRelay,
    refreshHealth: localBridgeActions.refreshHealth,
    fetchConfig: localBridgeActions.fetchConfig,
    updateConfig: localBridgeActions.updateConfig,
    listPins: localBridgeActions.listPins,
    repairPins: localBridgeActions.repairPins,
    syncPins: localBridgeActions.syncPins,
    refreshRelayDevices: relayOwnerActions.refreshRelayDevices,
    requestRelayInventory: relayOwnerActions.requestRelayInventory,
    disconnectRelayDevice: relayOwnerActions.disconnectRelayDevice,
    updateRelayDeviceConfig: relayOwnerActions.updateRelayDeviceConfig,
    repairRelayDevicePins: relayOwnerActions.repairRelayDevicePins,
    syncRelayDevicePins: relayOwnerActions.syncRelayDevicePins,
    createRelayPairing: relayOwnerActions.createRelayPairing,
    linkLocalBridgeToRelay: localBridgeActions.linkLocalBridgeToRelay,
    buildRelayPairingUrl,
    enrichPins: relayOwnerActions.enrichPins,
    queueWorkToRelay: relayOwnerActions.queueWorkToRelay,
    shareWork: localBridgeActions.shareWork,
    uploadFiles: localBridgeActions.uploadFiles,
    buildWorkShareUrl,
    buildSessionViewUrl: () => buildSessionViewUrlPure(bridgeUrl, session),
    clearError: () => setError(null),
  };

  return (
    <DesktopBridgeContext.Provider value={value}>
      {children}
    </DesktopBridgeContext.Provider>
  );
}
