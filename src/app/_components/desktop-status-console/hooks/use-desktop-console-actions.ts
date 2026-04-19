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

type PreparePairingOptions = {
  force?: boolean;
  silent?: boolean;
};

const PAIRING_POLL_INTERVAL_MS = 1_000;
const PAIRING_WAIT_TIMEOUT_MS = 15_000;
const PAIRING_REFRESH_BUFFER_MS = 30_000;

type LocalReloadResult =
  | {
      status: "success";
      configDraft: ConfigDraft;
      now: string;
      pinsPayload: BridgePinsResponse;
    }
  | {
      status: "skipped";
    }
  | {
      status: "error";
      error: unknown;
    };

type RelayReloadResult =
  | {
      status: "success";
      devices: RelayOwnerDevice[];
    }
  | {
      status: "error";
      devices: RelayOwnerDevice[];
      error: unknown;
    };

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isPairingReady(pairing: RelayPairing | null) {
  if (!pairing) return false;

  const expiresAt = Date.parse(pairing.expiresAt);
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt - Date.now() > PAIRING_REFRESH_BUFFER_MS;
}

async function waitForConnectedRelayDevice(
  refreshRelayDevices: () => Promise<RelayOwnerDevice[]>,
) {
  const deadline = Date.now() + PAIRING_WAIT_TIMEOUT_MS;
  let latestDevices: RelayOwnerDevice[] = [];

  while (Date.now() <= deadline) {
    try {
      latestDevices = await refreshRelayDevices();
      const preferred = pickPreferredDevice(latestDevices);

      if (preferred?.connected) {
        return preferred;
      }
    } catch {
      // Keep waiting so a just-opened desktop app has a chance to finish linking.
    }

    await sleep(PAIRING_POLL_INTERVAL_MS);
  }

  return pickPreferredDevice(latestDevices);
}

async function reloadLocalBridge(
  state: DesktopConsoleState,
  enabled: boolean,
): Promise<LocalReloadResult> {
  if (!enabled) {
    return { status: "skipped" };
  }

  try {
    const [healthPayload, configPayload, pinsPayload] = await Promise.all([
      state.bridge.refreshHealth(),
      state.bridge.fetchConfig(),
      state.bridge.listPins(),
    ]);

    return {
      status: "success",
      configDraft: draftFromConfig(configPayload),
      now: healthPayload.now,
      pinsPayload,
    };
  } catch (error) {
    return {
      status: "error",
      error,
    };
  }
}

async function reloadRelayDevices(
  state: DesktopConsoleState,
): Promise<RelayReloadResult> {
  try {
    return {
      status: "success",
      devices: await state.bridge.refreshRelayDevices(),
    };
  } catch (error) {
    return {
      status: "error",
      devices: state.bridge.relayDevices,
      error,
    };
  }
}

function resolveReloadFailure(
  localResult: LocalReloadResult,
  relayResult: RelayReloadResult,
) {
  if (relayResult.status === "error") {
    return relayResult.error;
  }

  if (localResult.status === "error") {
    return localResult.error;
  }

  return new Error("Refresh failed.");
}

function resolveReloadFeedback(input: {
  refreshLocalBridge: boolean;
  reachable: boolean;
  selectedDevice: RelayOwnerDevice | null;
}) {
  if (input.selectedDevice?.connected && !input.reachable) {
    return "Checked your linked desktop app.";
  }

  if (!input.refreshLocalBridge) {
    return "Checked for linked desktop apps.";
  }

  return "Got the latest from your desktop app.";
}

function useReload({ state, selectedDevice }: ActionArgs) {
  const { bridge, raw, transitions } = state;

  return () => {
    transitions.startRefresh(() => {
      raw.setFeedback(null);
      bridge.clearError();

      const refreshLocalBridge =
        bridge.reachable || bridge.localBridgeProbeEnabled;

      void Promise.all([
        reloadLocalBridge(state, refreshLocalBridge),
        reloadRelayDevices(state),
      ])
        .then(([localResult, relayResult]) => {
          if (localResult.status === "success") {
            raw.setConfigDraft(localResult.configDraft);
            raw.setLocalInventory(localResult.pinsPayload);
            raw.setLastLocalRefreshAt(localResult.now);
          }

          const nextSelectedDevice = selectedDevice
            ? (relayResult.devices.find(
                (device) => device.id === selectedDevice.id,
              ) ?? pickPreferredDevice(relayResult.devices))
            : pickPreferredDevice(relayResult.devices);

          raw.setSelectedDeviceId(nextSelectedDevice?.id ?? null);

          if (nextSelectedDevice?.connected) {
            bridge.requestRelayInventory(nextSelectedDevice.id);
          }

          if (
            localResult.status !== "success" &&
            relayResult.status !== "success"
          ) {
            throw resolveReloadFailure(localResult, relayResult);
          }

          raw.setFeedback(
            resolveReloadFeedback({
              refreshLocalBridge,
              reachable: bridge.reachable,
              selectedDevice: nextSelectedDevice,
            }),
          );
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
            if (result.healthy > 0)
              parts.push(`${result.healthy} already healthy`);
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
            if (result.skipped > 0)
              parts.push(`${result.skipped} already up to date`);
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

function usePreparePairingLink({ state }: ActionArgs) {
  const { bridge, raw, transitions } = state;

  return (options?: PreparePairingOptions) => {
    if (!options?.force && isPairingReady(raw.pairing)) {
      raw.setDeepLinkStatus("ready");
      if (!options?.silent) {
        raw.setFeedback("Desktop app link ready. Click below to open it.");
      }
      return;
    }

    transitions.startPairing(() => {
      if (!options?.silent) {
        raw.setFeedback(null);
      }
      bridge.clearError();
      raw.setDeepLinkStatus("preparing");

      void bridge
        .createRelayPairing(raw.configDraft.relayDeviceName || null)
        .then((createdPairing: RelayPairing) => {
          raw.setPairing(createdPairing);
          raw.setDeepLinkStatus("ready");
          if (!options?.silent) {
            raw.setFeedback("Desktop app link ready. Click below to open it.");
          }
        })
        .catch((caughtError: unknown) => {
          raw.setDeepLinkStatus("error");
          raw.setFeedback(
            errorMessage(
              caughtError,
              "Couldn't prepare the desktop app link. Please try again.",
            ),
          );
        });
    });
  };
}

function useOpenPreparedPairing({ state }: ActionArgs) {
  const { bridge, raw } = state;

  return () => {
    if (!isPairingReady(raw.pairing)) {
      raw.setDeepLinkStatus("error");
      raw.setFeedback("The app link expired. Please create a fresh one.");
      return;
    }

    raw.setDeepLinkStatus("opening");
    raw.setFeedback("Opening the desktop app and waiting for it to confirm.");

    void (async () => {
      await sleep(250);
      raw.setDeepLinkStatus("waiting");

      const connectedDevice = await waitForConnectedRelayDevice(
        bridge.refreshRelayDevices,
      );

      if (!connectedDevice) {
        raw.setDeepLinkStatus("ready");
        raw.setFeedback(
          "Still waiting for the desktop app. Try the link again if nothing opened.",
        );
        return;
      }

      raw.setSelectedDeviceId(connectedDevice.id);

      if (connectedDevice.connected) {
        raw.setPairing(null);
        raw.setDeepLinkStatus("idle");
        raw.setFeedback(
          "Connected. Archive pages can now send works to this computer.",
        );
        bridge.requestRelayInventory(connectedDevice.id);
        return;
      }

      raw.setDeepLinkStatus("ready");
      raw.setFeedback(
        "The app woke up, but it hasn't confirmed the link yet. You can try the link again below.",
      );
    })().catch((caughtError: unknown) => {
      raw.setDeepLinkStatus("error");
      raw.setFeedback(
        errorMessage(
          caughtError,
          "Couldn't finish linking with the desktop app. Please try again.",
        ),
      );
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
          raw.setDeepLinkStatus("idle");
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
          raw.setDeepLinkStatus("idle");
          raw.setFeedback(
            "Disconnected. This site won't send works here anymore.",
          );
        })
        .catch((caughtError: unknown) => {
          raw.setFeedback(
            errorMessage(caughtError, "Couldn't disconnect. Please try again."),
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
  preparePairingLink: (options?: PreparePairingOptions) => void;
  openPreparedPairing: () => void;
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
    preparePairingLink: usePreparePairingLink(args),
    openPreparedPairing: useOpenPreparedPairing(args),
    connectThisComputer: useConnectThisComputer(args),
    disconnectSelectedDevice: useDisconnectSelected(args),
  };
}

// Re-export the input args type for callers composing handler usage.
export type { ConfigDraft };
