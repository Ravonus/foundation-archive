"use client";

import { useEffect, useEffectEvent } from "react";

import type { VerifyPinsResult } from "../types";

const INITIAL_KICK_MS = 2_000;
const REPEAT_EVERY_MS = 5 * 60 * 1_000;

// Runs a periodic pin-reachability check while the bridge is reachable so the
// UI can display which saved works are actually advertised on the IPFS network.
export function usePinVerificationLoop(
  reachable: boolean,
  verifyPins: () => Promise<VerifyPinsResult>,
) {
  const runVerification = useEffectEvent(() => {
    void verifyPins().catch(() => null);
  });

  useEffect(() => {
    if (!reachable) return;

    const firstTimer = window.setTimeout(runVerification, INITIAL_KICK_MS);
    const interval = window.setInterval(runVerification, REPEAT_EVERY_MS);

    return () => {
      window.clearTimeout(firstTimer);
      window.clearInterval(interval);
    };
  }, [reachable]);
}
