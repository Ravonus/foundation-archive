"use client";

import { useEffect, useEffectEvent } from "react";

import type {
  BridgeConfig,
  BridgePinsResponse,
  DesktopBridgeContextValue,
} from "~/app/_components/desktop-bridge-provider/types";

import { draftFromConfig, errorMessage } from "./desktop-console-shared";
import type { ConfigDraft } from "../types";

type BridgeLoadApi = Pick<
  DesktopBridgeContextValue,
  | "bridgeUrl"
  | "reachable"
  | "refreshHealth"
  | "fetchConfig"
  | "listPins"
  | "refreshRelayDevices"
>;

type LoadArgs = {
  bridge: BridgeLoadApi;
  setConfigDraft: (draft: ConfigDraft) => void;
  setLocalInventory: (payload: BridgePinsResponse) => void;
  setLastLocalRefreshAt: (value: string) => void;
};

async function loadBridgeData({
  bridge,
  setConfigDraft,
  setLocalInventory,
  setLastLocalRefreshAt,
}: LoadArgs) {
  const [healthPayload, configPayload, pinsPayload] = await Promise.all([
    bridge.refreshHealth(),
    bridge.fetchConfig(),
    bridge.listPins(),
  ]);
  await bridge.refreshRelayDevices().catch(() => []);
  setConfigDraft(draftFromConfig(configPayload));
  setLocalInventory(pinsPayload);
  setLastLocalRefreshAt(healthPayload.now);
}

type InitialLoadArgs = {
  bridge: BridgeLoadApi;
  setLocalInventory: (payload: BridgePinsResponse | null) => void;
  setConfigDraft: (draft: ConfigDraft) => void;
  setLastLocalRefreshAt: (value: string | null) => void;
  setFeedback: (value: string | null) => void;
};

export function useDesktopConsoleInitialLoad({
  bridge,
  setLocalInventory,
  setConfigDraft,
  setLastLocalRefreshAt,
  setFeedback,
}: InitialLoadArgs) {
  const { bridgeUrl, reachable } = bridge;
  const runLoad = useEffectEvent(() => {
    let cancelled = false;

    void loadBridgeData({
      bridge,
      setConfigDraft: (draft) => {
        if (!cancelled) setConfigDraft(draft);
      },
      setLocalInventory: (payload) => {
        if (!cancelled) setLocalInventory(payload);
      },
      setLastLocalRefreshAt: (value) => {
        if (!cancelled) setLastLocalRefreshAt(value);
      },
    }).catch((caughtError: unknown) => {
      if (cancelled) return;
      setFeedback(
        errorMessage(caughtError, "Unable to refresh the desktop app."),
      );
    });

    return () => {
      cancelled = true;
    };
  });

  useEffect(() => {
    if (!reachable) {
      setLocalInventory(null);
      return;
    }

    return runLoad();
  }, [bridgeUrl, reachable, setLocalInventory]);
}

export function useDesktopConsoleConfigDraftSync(
  config: BridgeConfig | null,
  setConfigDraft: (draft: ConfigDraft) => void,
) {
  useEffect(() => {
    if (!config) return;
    setConfigDraft(draftFromConfig(config));
  }, [config, setConfigDraft]);
}
