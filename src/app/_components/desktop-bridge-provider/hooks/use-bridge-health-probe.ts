"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requestBridgeJson } from "../lib/bridge-api";
import { bridgeConfigFromHealth } from "../lib/derive-config";
import type {
  BridgeConfig,
  BridgeHealth,
  BridgeSession,
  BridgeStatus,
} from "../types";

type HealthProbeSetters = {
  setHealth: (health: BridgeHealth | null) => void;
  setConfig: (config: BridgeConfig | null) => void;
  setReachable: (reachable: boolean) => void;
  setStatus: (status: BridgeStatus) => void;
};

export type BridgeNetworkStatus = {
  attempts: number;
  nextRetryAt: number | null;
  lastError: string | null;
  retrying: boolean;
};

const INITIAL_NETWORK_STATUS: BridgeNetworkStatus = {
  attempts: 0,
  nextRetryAt: null,
  lastError: null,
  retrying: false,
};

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const HEALTHY_POLL_MS = 20_000;

function nextBackoff(current: number) {
  return Math.min(Math.max(current * 2, INITIAL_BACKOFF_MS), MAX_BACKOFF_MS);
}

export function useBridgeHealthProbe(
  bridgeUrl: string,
  session: BridgeSession | null,
  setters: HealthProbeSetters,
) {
  const { setHealth, setConfig, setReachable, setStatus } = setters;

  const [networkStatus, setNetworkStatus] = useState<BridgeNetworkStatus>(
    INITIAL_NETWORK_STATUS,
  );
  const [retryTick, setRetryTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearScheduled = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    // Indirection through a function the narrower can't trace, so checks
    // after `await` aren't proven tautologically false.
    const controller = new AbortController();
    const isCancelled = () => controller.signal.aborted;
    let currentAttempt = 0;
    let currentBackoff = INITIAL_BACKOFF_MS;

    const schedule = (delay: number, fn: () => Promise<void>) => {
      timerRef.current = setTimeout(() => {
        void fn();
      }, delay);
    };

    const runProbe = async () => {
      if (isCancelled()) return;
      currentAttempt += 1;
      setNetworkStatus({
        attempts: currentAttempt,
        nextRetryAt: null,
        lastError: null,
        retrying: true,
      });
      setStatus("checking");

      try {
        const payload = await requestBridgeJson<BridgeHealth>({
          bridgeUrl,
          path: "/health",
          init: { method: "GET" },
          fallback: `Unable to reach the desktop app at ${bridgeUrl}.`,
        });
        if (isCancelled()) return;

        setHealth(payload);
        setConfig(bridgeConfigFromHealth(payload));
        setReachable(true);
        setStatus(session ? "connected" : "disconnected");
        setNetworkStatus({
          attempts: 0,
          nextRetryAt: null,
          lastError: null,
          retrying: false,
        });
        currentBackoff = INITIAL_BACKOFF_MS;

        // Keep probing on a slower cadence once healthy so we catch disconnects.
        schedule(HEALTHY_POLL_MS, runProbe);
      } catch (error) {
        if (isCancelled()) return;

        setHealth(null);
        setConfig(null);
        setReachable(false);
        setStatus("disconnected");

        const message =
          error instanceof Error
            ? error.message
            : `Unable to reach the desktop app at ${bridgeUrl}.`;
        const delay = currentBackoff;
        currentBackoff = nextBackoff(currentBackoff);

        setNetworkStatus({
          attempts: currentAttempt,
          nextRetryAt: Date.now() + delay,
          lastError: message,
          retrying: false,
        });

        schedule(delay, runProbe);
      }
    };

    void runProbe();

    return () => {
      controller.abort();
      clearScheduled();
    };
    // Setters are stable via useState; we re-run the probe loop when the bridge
    // URL, session, or an explicit retry trigger changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeUrl, session, retryTick]);

  const retryNow = useCallback(() => {
    setRetryTick((tick) => tick + 1);
  }, []);

  return { networkStatus, retryNow };
}
