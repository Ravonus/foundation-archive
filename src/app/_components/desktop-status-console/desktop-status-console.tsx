"use client";

import {
  buildVisibleInventory,
  hasConnectedRelayDevice,
  pickSelectedDevice,
  resolveRelayServerUrl,
} from "./selectors";
import { useDesktopConsoleActions } from "./hooks/use-desktop-console-actions";
import { useDesktopConsoleState } from "./hooks/use-desktop-console-state";
import { AdvancedSettingsSection } from "./sections/advanced-settings-section";
import { BridgeStatusHeader } from "./sections/bridge-status-header";
import { ConnectSection } from "./sections/connect-section";
import { SavedWorksSection } from "./sections/saved-works-section";
import { UploadSection } from "./sections/upload-section";

function resolvePairingUrl(input: {
  pairing: ReturnType<typeof useDesktopConsoleState>["raw"]["pairing"];
  relayServerUrl: string;
  relayDeviceName: string;
  buildRelayPairingUrl: ReturnType<
    typeof useDesktopConsoleState
  >["bridge"]["buildRelayPairingUrl"];
}) {
  if (!input.pairing) {
    return null;
  }

  return input.buildRelayPairingUrl(
    input.pairing,
    input.relayServerUrl.length > 0 ? input.relayServerUrl : null,
    input.relayDeviceName.length > 0 ? input.relayDeviceName : null,
  );
}

function resolveControlLabel(input: {
  selectedDevice: ReturnType<typeof pickSelectedDevice>;
  reachable: boolean;
}) {
  if (input.selectedDevice?.connected) {
    return input.selectedDevice.deviceLabel
      ? `${input.selectedDevice.deviceLabel} linked`
      : "linked desktop app";
  }

  if (input.selectedDevice) {
    return `${input.selectedDevice.deviceLabel} offline`;
  }

  if (input.reachable) {
    return "app connected here";
  }

  return "not ready yet";
}

export function DesktopStatusConsole() {
  const state = useDesktopConsoleState();
  const { bridge, raw, transitions } = state;

  const selectedDevice = pickSelectedDevice(state);
  const selectedDeviceState = selectedDevice
    ? (bridge.relayDeviceStates[selectedDevice.id] ?? null)
    : null;
  const relayConnected = hasConnectedRelayDevice(bridge.relayDevices);
  const canControlSelectedDevice = selectedDevice
    ? selectedDevice.connected
    : bridge.reachable;
  const relayServerUrl = resolveRelayServerUrl(raw.configDraft);
  const pairingUrl = resolvePairingUrl({
    pairing: raw.pairing,
    relayServerUrl,
    relayDeviceName: raw.configDraft.relayDeviceName,
    buildRelayPairingUrl: bridge.buildRelayPairingUrl,
  });
  const sessionUrl = bridge.buildSessionViewUrl();
  const inventoryView = buildVisibleInventory(state, selectedDevice);
  const controlLabel = resolveControlLabel({
    selectedDevice,
    reachable: bridge.reachable,
  });
  const isConnectedRemotely =
    selectedDevice?.connected === true || selectedDeviceState !== null;
  const showConnectSection = !relayConnected;

  const actions = useDesktopConsoleActions({
    state,
    relayServerUrl,
    selectedDevice,
  });

  return (
    <section className="space-y-6">
      <BridgeStatusHeader
        selectedDevice={selectedDevice}
        isRefreshing={transitions.isRefreshing}
        reload={actions.reload}
        feedback={raw.feedback}
        error={bridge.error}
        networkStatus={bridge.networkStatus}
        relayConnected={relayConnected}
        localBridgeProbeEnabled={bridge.localBridgeProbeEnabled}
        reachable={bridge.reachable}
        retryNetwork={bridge.retryNetwork}
        relayDevices={bridge.relayDevices}
        setSelectedDeviceId={raw.setSelectedDeviceId}
        pinnedCount={inventoryView.pinnedCount}
        visibleInventoryTime={inventoryView.visibleInventoryTime}
        requestRelayInventory={bridge.requestRelayInventory}
        sessionUrl={sessionUrl}
        pairingUrl={pairingUrl}
        openPreparedPairing={actions.openPreparedPairing}
        disconnectSelectedDevice={actions.disconnectSelectedDevice}
        isDisconnecting={transitions.isDisconnecting}
      />

      {showConnectSection ? (
        <ConnectSection
          reachable={bridge.reachable}
          relayConnected={relayConnected}
          localBridgeProbeEnabled={bridge.localBridgeProbeEnabled}
          ownerTokenReady={Boolean(bridge.ownerToken)}
          pairing={raw.pairing}
          pairingUrl={pairingUrl}
          deepLinkStatus={raw.deepLinkStatus}
          selectedDevice={selectedDevice}
          isConnectingLocal={transitions.isConnectingLocal}
          isPairing={transitions.isPairing}
          isDisconnecting={transitions.isDisconnecting}
          connectThisComputer={actions.connectThisComputer}
          preparePairingLink={actions.preparePairingLink}
          openPreparedPairing={actions.openPreparedPairing}
          disconnectSelectedDevice={actions.disconnectSelectedDevice}
        />
      ) : null}

      <UploadSection
        reachable={bridge.reachable}
        selectedDevice={selectedDevice}
        uploadFiles={bridge.uploadFiles}
        onUploaded={(result) => {
          bridge
            .listPins()
            .then((payload) => {
              raw.setLocalInventory(payload);
              raw.setLastLocalRefreshAt(new Date().toISOString());
            })
            .catch(() => undefined);
          raw.setFeedback(
            `Pinned ${result.file_count} file${result.file_count === 1 ? "" : "s"} to this computer.`,
          );
        }}
        setFeedback={raw.setFeedback}
      />

      <SavedWorksSection
        visibleItems={inventoryView.visibleItems}
        pinnedCount={inventoryView.pinnedCount}
        pinEnrichment={bridge.pinEnrichment}
        pinVerifications={bridge.pinVerifications}
        isVerifying={transitions.isVerifying}
        reachable={bridge.reachable}
        canRepair={selectedDevice ? selectedDevice.connected : bridge.reachable}
        isRepairing={transitions.isRepairing}
        runRepair={actions.runRepair}
        runVerify={actions.runVerify}
      />

      <AdvancedSettingsSection
        reachable={bridge.reachable}
        canControl={canControlSelectedDevice}
        controlLabel={controlLabel}
        configDraft={raw.configDraft}
        setConfigDraft={raw.setConfigDraft}
        isSavingConfig={transitions.isSavingConfig}
        isRepairing={transitions.isRepairing}
        isSyncing={transitions.isSyncing}
        isConnectedRemotely={isConnectedRemotely}
        saveConfig={actions.saveConfig}
        runRepair={actions.runRepair}
        runSync={actions.runSync}
      />
    </section>
  );
}
