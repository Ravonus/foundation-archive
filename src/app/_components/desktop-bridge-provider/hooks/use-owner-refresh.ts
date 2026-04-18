"use client";

import { useEffect, useEffectEvent } from "react";

import type { RelayOwnerDevice } from "../types";

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
  }, [ownerToken]);
}
