import {
  parseBridgeError,
  requestBridgeJson,
  trimTrailingSlash,
  withJsonHeaders,
} from "../lib/bridge-api";
import { resolveLinkRelayServerUrl } from "../lib/builders";
import { normalizeBridgeConfig, normalizeBridgeHealth } from "../lib/wire";
import type {
  BridgeConfig,
  BridgeHealth,
  BridgePinsResponse,
  BridgeSession,
  ConnectSessionResponse,
  DesktopShareableWork,
  RelayOwnerDevice,
  RelayPairing,
  RepairPinsResult,
  ShareWorkResult,
  SyncPinsResult,
  UploadFilesInput,
  UploadFilesResult,
  VerifyPinsResult,
} from "../types";

export type LocalBridgeDeps = {
  bridgeUrl: string;
  session: BridgeSession | null;
  config: BridgeConfig | null;
  reachable: boolean;
  setHealth: (health: BridgeHealth) => void;
  setConfig: (config: BridgeConfig) => void;
  setReachable: (reachable: boolean) => void;
  setStatus: (status: "checking" | "disconnected" | "connected") => void;
  setError: (message: string | null) => void;
  persistSession: (session: BridgeSession | null) => void;
  bridgeConfigFromHealth: (
    payload: BridgeHealth,
    previous: BridgeConfig | null,
  ) => BridgeConfig;
  createRelayPairing: (label?: string | null) => Promise<RelayPairing>;
  refreshRelayDevices: () => Promise<RelayOwnerDevice[]>;
};

export type LocalBridgeActions = {
  refreshHealth: () => Promise<BridgeHealth>;
  connect: () => Promise<BridgeSession>;
  disconnect: () => Promise<void>;
  unlinkLocalRelay: () => Promise<void>;
  listPins: () => Promise<BridgePinsResponse>;
  fetchConfig: () => Promise<BridgeConfig>;
  updateConfig: (input: Partial<BridgeConfig>) => Promise<BridgeConfig>;
  repairPins: () => Promise<RepairPinsResult>;
  syncPins: () => Promise<SyncPinsResult>;
  verifyPins: (cids?: string[]) => Promise<VerifyPinsResult>;
  linkLocalBridgeToRelay: (
    label?: string | null,
    relayServerUrl?: string | null,
  ) => Promise<RelayOwnerDevice[]>;
  shareWork: (work: DesktopShareableWork) => Promise<ShareWorkResult>;
  uploadFiles: (input: UploadFilesInput) => Promise<UploadFilesResult>;
  ensureConnected: () => Promise<BridgeSession>;
};

function createRefreshHealth(deps: LocalBridgeDeps) {
  return async () => {
    const raw = await requestBridgeJson<unknown>({
      bridgeUrl: deps.bridgeUrl,
      path: "/health",
      init: { method: "GET" },
      fallback: `Unable to reach the desktop app at ${deps.bridgeUrl}.`,
    });
    const payload = normalizeBridgeHealth(raw);

    deps.setHealth(payload);
    deps.setConfig(deps.bridgeConfigFromHealth(payload, deps.config));
    deps.setReachable(true);
    deps.setStatus(deps.session ? "connected" : "disconnected");
    deps.setError(null);

    return payload;
  };
}

function createConnect(deps: LocalBridgeDeps) {
  return async () => {
    const payload = await requestBridgeJson<ConnectSessionResponse>({
      bridgeUrl: deps.bridgeUrl,
      path: "/session/connect",
      init: withJsonHeaders({
        website_origin: window.location.origin,
        client_name: "foundation-archive-site",
      }),
      fallback: `Unable to connect to the desktop app at ${deps.bridgeUrl}. Start the Rust app and make sure this URL is reachable.`,
    });

    deps.persistSession(payload.session);
    deps.setReachable(true);
    deps.setStatus("connected");
    deps.setError(null);

    return payload.session;
  };
}

function createDisconnect(deps: LocalBridgeDeps) {
  return async () => {
    if (deps.session) {
      await fetch(
        `${trimTrailingSlash(deps.bridgeUrl)}/session/disconnect`,
        withJsonHeaders({
          session_secret: deps.session.session_secret,
        }),
      ).catch(() => undefined);
    }

    deps.persistSession(null);
    deps.setError(null);
    deps.setStatus(deps.reachable ? "disconnected" : "checking");
  };
}

function createUnlinkLocalRelay(
  deps: LocalBridgeDeps,
  refreshHealth: () => Promise<BridgeHealth>,
  fetchConfig: () => Promise<BridgeConfig>,
) {
  return async () => {
    await requestBridgeJson<{ unlinked: boolean }>({
      bridgeUrl: deps.bridgeUrl,
      path: "/relay/unlink",
      init: { method: "POST" },
      fallback: "Unable to disconnect the desktop app from this archive site.",
    });

    await Promise.allSettled([
      refreshHealth(),
      fetchConfig(),
      deps.refreshRelayDevices(),
    ]);
    deps.setError(null);
  };
}

function createListPins(deps: LocalBridgeDeps) {
  return async () => {
    const payload = await requestBridgeJson<BridgePinsResponse>({
      bridgeUrl: deps.bridgeUrl,
      path: "/pins",
      init: { method: "GET" },
      fallback: "Unable to load the local desktop app inventory.",
    });

    deps.setError(null);
    return payload;
  };
}

function createFetchConfig(deps: LocalBridgeDeps) {
  return async () => {
    const raw = await requestBridgeJson<unknown>({
      bridgeUrl: deps.bridgeUrl,
      path: "/config",
      init: { method: "GET" },
      fallback: "Unable to load the local desktop app settings.",
    });
    const payload = normalizeBridgeConfig(raw);

    deps.setConfig(payload);
    deps.setError(null);
    return payload;
  };
}

function createUpdateConfig(
  deps: LocalBridgeDeps,
  refreshHealth: () => Promise<BridgeHealth>,
) {
  return async (input: Partial<BridgeConfig>) => {
    const raw = await requestBridgeJson<unknown>({
      bridgeUrl: deps.bridgeUrl,
      path: "/config",
      init: withJsonHeaders(input),
      fallback: "Unable to save the local desktop app settings.",
    });
    const payload = normalizeBridgeConfig(raw);

    deps.setConfig(payload);
    await refreshHealth().catch(() => null);
    deps.setError(null);
    return payload;
  };
}

function createRepairPins(
  deps: LocalBridgeDeps,
  refreshHealth: () => Promise<BridgeHealth>,
) {
  return async () => {
    const payload = await requestBridgeJson<RepairPinsResult>({
      bridgeUrl: deps.bridgeUrl,
      path: "/pins/repair",
      init: { method: "POST" },
      fallback: "Unable to trigger a repair cycle on the local desktop app.",
    });

    const nextHealth = await refreshHealth().catch(() => null);
    if (!nextHealth) {
      deps.setError(
        "Repair finished, but the bridge health could not be refreshed.",
      );
    }

    return payload;
  };
}

function createSyncPins(
  deps: LocalBridgeDeps,
  refreshHealth: () => Promise<BridgeHealth>,
) {
  return async () => {
    const payload = await requestBridgeJson<SyncPinsResult>({
      bridgeUrl: deps.bridgeUrl,
      path: "/sync/run",
      init: { method: "POST" },
      fallback: "Unable to trigger a sync cycle on the local desktop app.",
    });

    await refreshHealth().catch(() => null);
    deps.setError(null);
    return payload;
  };
}

function createVerifyPins(deps: LocalBridgeDeps) {
  return async (cids?: string[]) => {
    const payload = await requestBridgeJson<VerifyPinsResult>({
      bridgeUrl: deps.bridgeUrl,
      path: "/pins/verify",
      init: withJsonHeaders({ cids: cids ?? null }),
      fallback:
        "Unable to check the IPFS network for your pinned works. The desktop app may be offline.",
    });

    deps.setError(null);
    return payload;
  };
}

function createLinkLocalBridgeToRelay(
  deps: LocalBridgeDeps,
  refreshHealth: () => Promise<BridgeHealth>,
  fetchConfig: () => Promise<BridgeConfig>,
) {
  return async (label?: string | null, relayServerUrl?: string | null) => {
    const pairing = await deps.createRelayPairing(
      label ?? deps.config?.relay_device_name ?? null,
    );
    const resolvedRelayServerUrl = resolveLinkRelayServerUrl(
      relayServerUrl,
      deps.config,
    );

    const response = await fetch(
      `${trimTrailingSlash(deps.bridgeUrl)}/relay/link`,
      withJsonHeaders({
        relay_server_url: resolvedRelayServerUrl,
        pairing_code: pairing.pairingCode,
        device_name:
          label ?? deps.config?.relay_device_name ?? "Foundation desktop app",
      }),
    );

    if (!response.ok) {
      throw new Error(
        await parseBridgeError(
          response,
          "Unable to link the local desktop app to this archive site.",
        ),
      );
    }

    await Promise.all([refreshHealth(), fetchConfig()]);
    return deps.refreshRelayDevices();
  };
}

function createEnsureConnected(
  deps: LocalBridgeDeps,
  connect: () => Promise<BridgeSession>,
) {
  return async () => {
    if (deps.session && deps.reachable) {
      return deps.session;
    }
    return connect();
  };
}

function createShareWork(
  deps: LocalBridgeDeps,
  ensureConnected: () => Promise<BridgeSession>,
) {
  return async (work: DesktopShareableWork) => {
    try {
      const activeSession = await ensureConnected();
      const payload = await requestBridgeJson<ShareWorkResult>({
        bridgeUrl: deps.bridgeUrl,
        path: "/share/work",
        init: withJsonHeaders({
          session_secret: activeSession.session_secret,
          title: work.title,
          contract_address: work.contractAddress,
          token_id: work.tokenId,
          foundation_url: work.foundationUrl ?? null,
          metadata_cid: work.metadataCid ?? null,
          media_cid: work.mediaCid ?? null,
          artist_username: work.artistUsername ?? null,
        }),
        fallback: "Desktop app share failed.",
      });

      deps.setError(null);
      return payload;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to share this work with the desktop app.";
      deps.setError(message);
      throw new Error(message);
    }
  };
}

function resolveUploadFileName(file: File) {
  const relativePath = (file as File & { webkitRelativePath?: string })
    .webkitRelativePath;
  if (relativePath && relativePath.length > 0) {
    return relativePath;
  }
  return file.name;
}

function parseUploadError(raw: string, fallback: string) {
  if (!raw) return fallback;
  try {
    const payload = JSON.parse(raw) as { error?: string; message?: string };
    return payload.error ?? payload.message ?? fallback;
  } catch {
    return fallback;
  }
}

function createUploadFiles(
  deps: LocalBridgeDeps,
  ensureConnected: () => Promise<BridgeSession>,
) {
  return async ({ files, label, onProgress, signal }: UploadFilesInput) => {
    if (files.length === 0) {
      throw new Error("Select at least one file to upload.");
    }

    try {
      const activeSession = await ensureConnected();

      const formData = new FormData();
      formData.append("session_secret", activeSession.session_secret);
      if (label && label.trim().length > 0) {
        formData.append("label", label.trim());
      }
      for (const file of files) {
        formData.append("file", file, resolveUploadFileName(file));
      }

      const url = `${trimTrailingSlash(deps.bridgeUrl)}/ipfs/add`;

      const payload = await new Promise<UploadFilesResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);

        if (onProgress) {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              onProgress(event.loaded, event.total);
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText) as UploadFilesResult);
            } catch (parseError) {
              reject(
                parseError instanceof Error
                  ? parseError
                  : new Error("Desktop app returned invalid JSON."),
              );
            }
            return;
          }
          reject(
            new Error(
              parseUploadError(
                xhr.responseText,
                `Desktop app upload failed (HTTP ${xhr.status}).`,
              ),
            ),
          );
        };

        xhr.onerror = () => {
          reject(
            new Error(
              `Unable to reach the desktop app at ${deps.bridgeUrl} for upload.`,
            ),
          );
        };

        xhr.onabort = () => {
          reject(new Error("Upload canceled."));
        };

        if (signal) {
          if (signal.aborted) {
            xhr.abort();
            return;
          }
          signal.addEventListener("abort", () => xhr.abort(), { once: true });
        }

        xhr.send(formData);
      });

      deps.setError(null);
      return payload;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to upload files to the desktop app.";
      deps.setError(message);
      throw new Error(message);
    }
  };
}

export function createLocalBridgeActions(
  deps: LocalBridgeDeps,
): LocalBridgeActions {
  const refreshHealth = createRefreshHealth(deps);
  const connect = createConnect(deps);
  const disconnect = createDisconnect(deps);
  const fetchConfig = createFetchConfig(deps);
  const unlinkLocalRelay = createUnlinkLocalRelay(
    deps,
    refreshHealth,
    fetchConfig,
  );
  const listPins = createListPins(deps);
  const updateConfig = createUpdateConfig(deps, refreshHealth);
  const repairPins = createRepairPins(deps, refreshHealth);
  const syncPins = createSyncPins(deps, refreshHealth);
  const verifyPins = createVerifyPins(deps);
  const linkLocalBridgeToRelay = createLinkLocalBridgeToRelay(
    deps,
    refreshHealth,
    fetchConfig,
  );
  const ensureConnected = createEnsureConnected(deps, connect);
  const shareWork = createShareWork(deps, ensureConnected);
  const uploadFiles = createUploadFiles(deps, ensureConnected);

  return {
    refreshHealth,
    connect,
    disconnect,
    unlinkLocalRelay,
    listPins,
    fetchConfig,
    updateConfig,
    repairPins,
    syncPins,
    verifyPins,
    linkLocalBridgeToRelay,
    shareWork,
    uploadFiles,
    ensureConnected,
  };
}
