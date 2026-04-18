"use client";

import type {
  BridgePinsResponse,
  RelayOwnerDevice,
  RelayPairing,
} from "~/app/_components/desktop-bridge-provider";

import type { ConfigDraft } from "../types";
import {
  draftFromConfig,
  errorMessage,
  pickPreferredDevice,
} from "./desktop-console-shared";
import type { DesktopConsoleState } from "./use-desktop-console-state";

type ActionArgs = {
  state: DesktopConsoleState;
  relayServerUrl: string;
  selectedDevice: RelayOwnerDevice | null;
};

function useReload({ state, selectedDevice }: ActionArgs) {
  const { bridge, raw, transitions } = state;

  return () => {
    transitions.startRefresh(() => {
      raw.setFeedback(null);
      bridge.clearError();

      void Promise.all([
        bridge.refreshHealth(),
        bridge.fetchConfig(),
        bridge.listPins(),
        bridge.refreshRelayDevices(),
      ])
        .then(([healthPayload, configPayload, pinsPayload]) => {
          raw.setConfigDraft(draftFromConfig(configPayload));
          raw.setLocalInventory(pinsPayload);
          raw.setLastLocalRefreshAt(healthPayload.now);
          if (selectedDevice) bridge.requestRelayInventory(selectedDevice.id);
          raw.setFeedback("Got the latest from your desktop app.");
        })
        .catch((caughtError: unknown) => {
          raw.setFeedback(
            errorMessage(
              caughtError,
              "Couldn't reach the desktop app. Please try again.",
            ),
          );
        });
    });
  };
}

function useRunRepair({ state }: ActionArgs) {
  const { bridge, raw, transitions } = state;

  return () => {
    transitions.startRepair(() => {
      raw.setFeedback(null);
      bridge.clearError();

      void bridge
        .repairPins()
        .then((result) =>
          bridge.listPins().then((payload: BridgePinsResponse) => {
            raw.setLocalInventory(payload);
            raw.setLastLocalRefreshAt(new Date().toISOString());
            const parts: string[] = [];
            if (result.repaired > 0) parts.push(`${result.repaired} re-saved`);
            if (result.healthy > 0) parts.push(`${result.healthy} already healthy`);
            if (result.failed > 0) parts.push(`${result.failed} still failing`);
            raw.setFeedback(
              `Done. ${parts.length ? parts.join(" · ") : "Nothing needed fixing."}`,
            );
          }),
        )
        .catch((caughtError: unknown) => {
          raw.setFeedback(
            errorMessage(
              caughtError,
              "Couldn't finish the re-save. Please try again.",
            ),
          );
        });
    });
  };
}

function useRunVerify({ state }: ActionArgs) {
  const { bridge, raw, transitions } = state;

  return () => {
    transitions.startVerify(() => {
      raw.setFeedback(null);
      bridge.clearError();

      void bridge
        .verifyPins()
        .then((result) => {
          const reachable = result.results.filter(
            (entry) => entry.reachable && entry.providerCount > 0,
          ).length;
          const unreachable = result.results.length - reachable;
          raw.setFeedback(
            unreachable === 0
              ? `Network check done. All ${reachable} saved work${reachable === 1 ? "" : "s"} can be found on the network.`
              : `Network check done. ${reachable} visible on the network, ${unreachable} not visible yet.`,
          );
        })
        .catch((caughtError: unknown) => {
          raw.setFeedback(
            errorMessage(
              caughtError,
              "Couldn't check the network. Please try again.",
            ),
          );
        });
    });
  };
}

function useSaveConfig({ state, relayServerUrl }: ActionArgs) {
  const { bridge, raw, transitions } = state;

  return () => {
    transitions.startSaveConfig(() => {
      raw.setFeedback(null);
      bridge.clearError();

      void bridge
        .updateConfig({
          download_root_dir: raw.configDraft.downloadRootDir,
          sync_enabled: raw.configDraft.syncEnabled,
          local_gateway_base_url: raw.configDraft.localGatewayBaseUrl,
          public_gateway_base_url: raw.configDraft.publicGatewayBaseUrl,
          relay_enabled: raw.configDraft.relayEnabled,
          relay_server_url: relayServerUrl,
          relay_device_name: raw.configDraft.relayDeviceName,
        })
        .then(() => {
          raw.setFeedback("Settings saved.");
        })
        .catch((caughtError: unknown) => {
          raw.setFeedback(
            errorMessage(
              caughtError,
              "Couldn't save settings. Please try again.",
            ),
          );
        });
    });
  };
}

function useRunSync({ state }: ActionArgs) {
  const { bridge, raw, transitions } = state;

  return () => {
    transitions.startSync(() => {
      raw.setFeedback(null);
      bridge.clearError();

      void bridge
        .syncPins()
        .then((result) =>
          bridge.listPins().then((payload: BridgePinsResponse) => {
            raw.setLocalInventory(payload);
            raw.setLastLocalRefreshAt(new Date().toISOString());
            const parts: string[] = [];
            if (result.synced > 0) parts.push(`${result.synced} copied`);
            if (result.skipped > 0) parts.push(`${result.skipped} already up to date`);
            if (result.failed > 0) parts.push(`${result.failed} failed`);
            raw.setFeedback(
              `Folder sync done. ${parts.length ? parts.join(" · ") : "Nothing to copy."}`,
            );
          }),
        )
        .catch((caughtError: unknown) => {
          raw.setFeedback(
            errorMessage(
              caughtError,
              "Couldn't copy to your folder. Please try again.",
            ),
          );
        });
    });
  };
}

function useCreatePair({ state }: ActionArgs) {
  const { bridge, raw, transitions } = state;

  return () => {
    transitions.startPairing(() => {
      raw.setFeedback(null);
      bridge.clearError();

      void bridge
        .createRelayPairing(raw.configDraft.relayDeviceName || null)
        .then((createdPairing: RelayPairing) => {
          raw.setPairing(createdPairing);
          raw.setFeedback(
            "Link ready. Click the Open desktop app button below.",
          );
        })
        .catch((caughtError: unknown) => {
          raw.setFeedback(
            errorMessage(
              caughtError,
              "Couldn't create a link. Please try again.",
            ),
          );
        });
    });
  };
}

function useConnectThisComputer({ state, relayServerUrl }: ActionArgs) {
  const { bridge, raw, transitions } = state;

  return () => {
    transitions.startConnectLocal(() => {
      raw.setFeedback(null);
      bridge.clearError();

      void bridge
        .linkLocalBridgeToRelay(
          raw.configDraft.relayDeviceName || null,
          relayServerUrl || null,
        )
        .then((devices) => {
          const preferred = pickPreferredDevice(devices);
          raw.setSelectedDeviceId(preferred?.id ?? null);
          raw.setPairing(null);
          raw.setFeedback(
            "Connected. Archive pages can now send works to this computer.",
          );
        })
        .catch((caughtError: unknown) => {
          raw.setFeedback(
            errorMessage(
              caughtError,
              "Couldn't connect. Is the desktop app running?",
            ),
          );
        });
    });
  };
}

function useDisconnectSelected({ state, selectedDevice }: ActionArgs) {
  const { bridge, raw, transitions } = state;

  return () => {
    if (!selectedDevice) return;

    transitions.startDisconnect(() => {
      raw.setFeedback(null);
      bridge.clearError();

      void bridge
        .disconnectRelayDevice(selectedDevice.id)
        .then(() => {
          raw.setFeedback("Disconnected. This site won't send works here anymore.");
        })
        .catch((caughtError: unknown) => {
          raw.setFeedback(
            errorMessage(
              caughtError,
              "Couldn't disconnect. Please try again.",
            ),
          );
        });
    });
  };
}

export type DesktopConsoleActions = {
  reload: () => void;
  runRepair: () => void;
  runVerify: () => void;
  saveConfig: () => void;
  runSync: () => void;
  createPair: () => void;
  connectThisComputer: () => void;
  disconnectSelectedDevice: () => void;
};

export function useDesktopConsoleActions(
  args: ActionArgs,
): DesktopConsoleActions {
  return {
    reload: useReload(args),
    runRepair: useRunRepair(args),
    runVerify: useRunVerify(args),
    saveConfig: useSaveConfig(args),
    runSync: useRunSync(args),
    createPair: useCreatePair(args),
    connectThisComputer: useConnectThisComputer(args),
    disconnectSelectedDevice: useDisconnectSelected(args),
  };
}

// Re-export the input args type for callers composing handler usage.
export type { ConfigDraft };
