"use client";

import { useEffect, useRef } from "react";

import type { VerifyPinsResult } from "../types";

const INITIAL_KICK_MS = 2_000;
const REPEAT_EVERY_MS = 5 * 60 * 1_000;

// Runs a periodic pin-reachability check while the bridge is reachable so the
// UI can display which saved works are actually advertised on the IPFS network.
// Refs capture the latest closure so the loop doesn't reset when `verifyPins`
// identity changes on every render.
export function usePinVerificationLoop(
  reachable: boolean,
  verifyPins: () => Promise<VerifyPinsResult>,
) {
  const latestVerify = useRef(verifyPins);
  latestVerify.current = verifyPins;

  useEffect(() => {
    if (!reachable) return;

    let cancelled = false;

    const runOnce = () => {
      if (cancelled) return;
      void latestVerify.current().catch(() => null);
    };

    const firstTimer = window.setTimeout(runOnce, INITIAL_KICK_MS);
    const interval = window.setInterval(runOnce, REPEAT_EVERY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(firstTimer);
      window.clearInterval(interval);
    };
  }, [reachable]);
}
