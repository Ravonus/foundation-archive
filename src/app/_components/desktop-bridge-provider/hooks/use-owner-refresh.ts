"use client";

import { useEffect } from "react";

import type { RelayOwnerDevice } from "../types";

export function useOwnerRefresh(
  ownerToken: string | null,
  refreshRelayDevices: () => Promise<RelayOwnerDevice[]>,
) {
  useEffect(() => {
    if (!ownerToken) return;

    void refreshRelayDevices().catch(() => undefined);
    // refreshRelayDevices depends on ownerToken state, which is the reason for this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerToken]);
}
