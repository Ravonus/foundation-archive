import type { LocalBridgeActions } from "../actions/local-bridge";
import type { RelayOwnerActions } from "../actions/relay-owner";
import type {
  BridgeConfig,
  BridgeHealth,
  BridgeNetworkStatus,
  BridgeSession,
  BridgeStatus,
  DesktopBridgeContextValue,
  DesktopShareableWork,
  PinVerificationResult,
  RelayDeviceStateSnapshot,
  RelayInventorySnapshot,
  RelayOwnerDevice,
  RelayPairing,
  VerifyPinsResult,
} from "../types";
import type { RelayPinEnrichmentMatch } from "~/lib/desktop-relay";

export type ContextValueInputs = {
  bridgeUrl: string;
  setBridgeUrl: (url: string) => void;
  status: BridgeStatus;
  networkStatus: BridgeNetworkStatus;
  retryNetwork: () => void;
  pinVerifications: Record<string, PinVerificationResult>;
  verifyPins: (cids?: string[]) => Promise<VerifyPinsResult>;
  session: BridgeSession | null;
  health: BridgeHealth | null;
  config: BridgeConfig | null;
  ownerToken: string | null;
  relayDevices: RelayOwnerDevice[];
  relayInventories: Record<string, RelayInventorySnapshot>;
  relayDeviceStates: Record<string, RelayDeviceStateSnapshot>;
  relaySocketConnected: boolean;
  localBridgeProbeEnabled: boolean;
  pinEnrichment: Record<string, RelayPinEnrichmentMatch[]>;
  error: string | null;
  reachable: boolean;
  localBridgeActions: LocalBridgeActions;
  relayOwnerActions: RelayOwnerActions;
  buildRelayPairingUrl: (
    pairing: RelayPairing,
    relayServerUrl?: string | null,
    deviceName?: string | null,
  ) => string;
  buildWorkShareUrl: (work: DesktopShareableWork) => Promise<string>;
  buildSessionViewUrl: () => string | null;
  clearError: () => void;
};

export function buildDesktopBridgeContextValue(
  inputs: ContextValueInputs,
): DesktopBridgeContextValue {
  const { localBridgeActions, relayOwnerActions } = inputs;

  return {
    bridgeUrl: inputs.bridgeUrl,
    setBridgeUrl: inputs.setBridgeUrl,
    status: inputs.status,
    networkStatus: inputs.networkStatus,
    retryNetwork: inputs.retryNetwork,
    pinVerifications: inputs.pinVerifications,
    verifyPins: inputs.verifyPins,
    session: inputs.session,
    health: inputs.health,
    config: inputs.config,
    ownerToken: inputs.ownerToken,
    relayDevices: inputs.relayDevices,
    relayInventories: inputs.relayInventories,
    relayDeviceStates: inputs.relayDeviceStates,
    relaySocketConnected: inputs.relaySocketConnected,
    localBridgeProbeEnabled: inputs.localBridgeProbeEnabled,
    pinEnrichment: inputs.pinEnrichment,
    error: inputs.error,
    reachable: inputs.reachable,
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
    buildRelayPairingUrl: inputs.buildRelayPairingUrl,
    enrichPins: relayOwnerActions.enrichPins,
    queueWorkToRelay: relayOwnerActions.queueWorkToRelay,
    shareWork: localBridgeActions.shareWork,
    uploadFiles: localBridgeActions.uploadFiles,
    buildWorkShareUrl: inputs.buildWorkShareUrl,
    buildSessionViewUrl: inputs.buildSessionViewUrl,
    clearError: inputs.clearError,
  };
}
