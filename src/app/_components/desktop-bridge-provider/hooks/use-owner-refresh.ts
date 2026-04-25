"use client";

import { useEffect, useEffectEvent } from "react";

import type { RelayOwnerDevice } from "../types";

const OWNER_REFRESH_INTERVAL_MS = 15_000;

export function useOwnerRefresh(
  ownerToken: string | null,
  refreshRelayDevices: () => Promise<RelayOwnerDevice[]>,
) {
  const refreshDevices = useEffectEvent(() => {
    void refreshRelayDevices().catch(() => undefined);
  });

  useEffect(() => {
    if (!ownerToken) return;
    refreshDevices();

    const refreshInterval = window.setInterval(
      refreshDevices,
      OWNER_REFRESH_INTERVAL_MS,
    );

    return () => window.clearInterval(refreshInterval);
  }, [ownerToken]);
}
