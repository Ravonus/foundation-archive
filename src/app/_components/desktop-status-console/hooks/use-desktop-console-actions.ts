/* eslint-disable max-lines */

"use client";

import type {
  BridgePinsResponse,
  RelayOwnerDevice,
  RelayPairing,
} from "~/app/_components/desktop-bridge-provider";
import { buildRelayPairingLocalUiUrl } from "~/app/_components/desktop-bridge-provider/lib/builders";

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
const RELAY_JOB_POLL_INTERVAL_MS = 1_000;
const RELAY_JOB_TIMEOUT_MS = 20_000;

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

function escapeInlineHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function openDesktopHelperWindow(localUiUrl: string) {
  if (typeof window === "undefined") return;

  const popup = window.open(
    "",
    "foundation-share-bridge-connect",
    "popup=yes,width=540,height=720",
  );

  if (!popup) return;

  const manualLink = escapeInlineHtml(localUiUrl);

  try {
    popup.document.open();
    popup.document.write(`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Opening desktop app</title>
        </head>
        <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#11100d;color:#f4efe3;font-family:ui-sans-serif,system-ui,sans-serif;padding:24px;">
          <section style="width:min(100%,420px);border:1px solid rgba(244,239,227,0.14);border-radius:28px;padding:28px;background:rgba(255,255,255,0.04);box-shadow:0 24px 80px rgba(0,0,0,0.28);">
            <p style="margin:0;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:#a9a18d;">Foundation desktop helper</p>
            <h1 style="margin:16px 0 0;font-size:32px;line-height:1.08;font-family:Georgia,serif;">Opening your local helper…</h1>
            <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#d3ccbc;">This window will switch to the helper on <code style="font-size:13px;">127.0.0.1</code> so you can actually see the connection finish.</p>
            <a href="${manualLink}" style="display:inline-flex;margin-top:18px;padding:12px 16px;border-radius:999px;background:#f4efe3;color:#11100d;text-decoration:none;font-size:14px;">Open local helper now</a>
          </section>
        </body>
      </html>`);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => {
      try {
        popup.location.replace(localUiUrl);
      } catch {
        popup.location.href = localUiUrl;
      }
    }, 1500);
  } catch {
    popup.location.href = localUiUrl;
  }
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

function pickRelayActionDevice(selectedDevice: RelayOwnerDevice | null) {
  return selectedDevice?.connected ? selectedDevice : null;
}

async function waitForRelayJob(
  refreshRelayDevices: () => Promise<RelayOwnerDevice[]>,
  deviceId: string,
  jobId: string,
) {
  const deadline = Date.now() + RELAY_JOB_TIMEOUT_MS;
  let latestDevices: RelayOwnerDevice[] = [];

  while (Date.now() <= deadline) {
    latestDevices = await refreshRelayDevices();
    const device = latestDevices.find((entry) => entry.id === deviceId) ?? null;
    const job = device?.recentJobs.find((entry) => entry.id === jobId) ?? null;

    if (job?.status === "COMPLETED" || job?.status === "FAILED") {
      return { device, job };
    }

    await sleep(RELAY_JOB_POLL_INTERVAL_MS);
  }

  const device = latestDevices.find((entry) => entry.id === deviceId) ?? null;
  const job = device?.recentJobs.find((entry) => entry.id === jobId) ?? null;
  return { device, job };
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

function useRunRepair({ state, selectedDevice }: ActionArgs) {
  const { bridge, raw, transitions } = state;

  return () => {
    transitions.startRepair(() => {
      raw.setFeedback(null);
      bridge.clearError();

      const relayDevice = pickRelayActionDevice(selectedDevice);

      if (relayDevice) {
        void bridge
          .repairRelayDevicePins(relayDevice.id)
          .then(async (queuedJob) => {
            const outcome = await waitForRelayJob(
              bridge.refreshRelayDevices,
              relayDevice.id,
              queuedJob.jobId,
            );

            if (outcome.job?.status === "FAILED") {
              throw new Error(
                outcome.job.errorMessage ??
                  "The linked desktop app couldn't re-save missing works.",
              );
            }

            bridge.requestRelayInventory(relayDevice.id);
            raw.setFeedback(
              `Asked ${relayDevice.deviceLabel} to re-save missing works. The saved list above will refresh here.`,
            );
          })
          .catch((caughtError: unknown) => {
            raw.setFeedback(
              errorMessage(
                caughtError,
                "Couldn't finish the re-save. Please try again.",
              ),
            );
          });
        return;
      }

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

function useSaveConfig({ state, relayServerUrl, selectedDevice }: ActionArgs) {
  const { bridge, raw, transitions } = state;

  return () => {
    transitions.startSaveConfig(() => {
      raw.setFeedback(null);
      bridge.clearError();

      const relayDevice = pickRelayActionDevice(selectedDevice);
      const configInput = {
        download_root_dir: raw.configDraft.downloadRootDir,
        sync_enabled: raw.configDraft.syncEnabled,
        local_gateway_base_url: raw.configDraft.localGatewayBaseUrl,
        public_gateway_base_url: raw.configDraft.publicGatewayBaseUrl,
        relay_enabled: raw.configDraft.relayEnabled,
        relay_server_url: relayServerUrl,
        relay_device_name: raw.configDraft.relayDeviceName,
      };

      if (relayDevice) {
        void bridge
          .updateRelayDeviceConfig(relayDevice.id, configInput)
          .then(async (queuedJob) => {
            const outcome = await waitForRelayJob(
              bridge.refreshRelayDevices,
              relayDevice.id,
              queuedJob.jobId,
            );

            if (outcome.job?.status === "FAILED") {
              throw new Error(
                outcome.job.errorMessage ??
                  "The linked desktop app couldn't save those settings.",
              );
            }

            raw.setFeedback(`Settings saved to ${relayDevice.deviceLabel}.`);
          })
          .catch((caughtError: unknown) => {
            raw.setFeedback(
              errorMessage(
                caughtError,
                "Couldn't save settings. Please try again.",
              ),
            );
          });
        return;
      }

      void bridge
        .updateConfig(configInput)
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

function useRunSync({ state, selectedDevice }: ActionArgs) {
  const { bridge, raw, transitions } = state;

  return () => {
    transitions.startSync(() => {
      raw.setFeedback(null);
      bridge.clearError();

      const relayDevice = pickRelayActionDevice(selectedDevice);

      if (relayDevice) {
        void bridge
          .syncRelayDevicePins(relayDevice.id)
          .then(async (queuedJob) => {
            const outcome = await waitForRelayJob(
              bridge.refreshRelayDevices,
              relayDevice.id,
              queuedJob.jobId,
            );

            if (outcome.job?.status === "FAILED") {
              throw new Error(
                outcome.job.errorMessage ??
                  "The linked desktop app couldn't copy saved works into its folder.",
              );
            }

            bridge.requestRelayInventory(relayDevice.id);
            raw.setFeedback(
              `Folder sync ran on ${relayDevice.deviceLabel}. The saved list above will refresh here.`,
            );
          })
          .catch((caughtError: unknown) => {
            raw.setFeedback(
              errorMessage(
                caughtError,
                "Couldn't copy to your folder. Please try again.",
              ),
            );
          });
        return;
      }

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
    const pairing = raw.pairing;

    if (!isPairingReady(pairing) || !pairing) {
      raw.setDeepLinkStatus("error");
      raw.setFeedback("The app link expired. Please create a fresh one.");
      return;
    }

    openDesktopHelperWindow(
      buildRelayPairingLocalUiUrl({
        pairing,
        relayServerUrl: raw.configDraft.relayServerUrl || null,
        deviceName: raw.configDraft.relayDeviceName || null,
        config: bridge.config,
      }),
    );

    raw.setDeepLinkStatus("opening");
    raw.setFeedback(
      "Opening the desktop app. A local helper window should appear too.",
    );

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
