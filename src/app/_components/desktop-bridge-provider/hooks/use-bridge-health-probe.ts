"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

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

function isLoopbackHost(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function clearScheduledTimer(
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
) {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

function scheduleProbe(
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
  delay: number,
  fn: () => Promise<void>,
) {
  timerRef.current = setTimeout(() => {
    void fn();
  }, delay);
}

function setBridgeDisconnected(setters: HealthProbeSetters) {
  setters.setHealth(null);
  setters.setConfig(null);
  setters.setReachable(false);
  setters.setStatus("disconnected");
}

function setBridgeConnected(input: {
  setters: HealthProbeSetters;
  payload: BridgeHealth;
  session: BridgeSession | null;
}) {
  const { setters, payload, session } = input;

  setters.setHealth(payload);
  setters.setConfig(bridgeConfigFromHealth(payload));
  setters.setReachable(true);
  setters.setStatus(session ? "connected" : "disconnected");
}

function shouldProbeBridge(
  bridgeUrl: string,
) {
  if (typeof window === "undefined") return true;

  try {
    const bridgeHostname = new URL(bridgeUrl).hostname;
    if (!isLoopbackHost(bridgeHostname)) {
      return true;
    }

    if (isLoopbackHost(window.location.hostname)) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

function useBridgeProbeLoop(input: {
  bridgeUrl: string;
  probeEnabled: boolean;
  retryTick: number;
  session: BridgeSession | null;
  setters: HealthProbeSetters;
  setNetworkStatus: Dispatch<SetStateAction<BridgeNetworkStatus>>;
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}) {
  const {
    bridgeUrl,
    probeEnabled,
    retryTick,
    session,
    setters,
    setNetworkStatus,
    timerRef,
  } = input;
  const { setHealth, setConfig, setReachable, setStatus } = setters;

  useEffect(() => {
    const bridgeSetters = { setHealth, setConfig, setReachable, setStatus };

    if (!probeEnabled) {
      clearScheduledTimer(timerRef);
      setBridgeDisconnected(bridgeSetters);
      return () => clearScheduledTimer(timerRef);
    }

    // Indirection through a function the narrower can't trace, so checks
    // after `await` aren't proven tautologically false.
    const controller = new AbortController();
    const isCancelled = () => controller.signal.aborted;
    let currentAttempt = 0;
    let currentBackoff = INITIAL_BACKOFF_MS;

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

        setBridgeConnected({ setters: bridgeSetters, payload, session });
        setNetworkStatus(INITIAL_NETWORK_STATUS);
        currentBackoff = INITIAL_BACKOFF_MS;

        // Keep probing on a slower cadence once healthy so we catch disconnects.
        scheduleProbe(timerRef, HEALTHY_POLL_MS, runProbe);
      } catch (error) {
        if (isCancelled()) return;

        setBridgeDisconnected(bridgeSetters);

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

        scheduleProbe(timerRef, delay, runProbe);
      }
    };

    void runProbe();

    return () => {
      controller.abort();
      clearScheduledTimer(timerRef);
    };
  }, [
    bridgeUrl,
    probeEnabled,
    retryTick,
    session,
    setConfig,
    setHealth,
    setNetworkStatus,
    setReachable,
    setStatus,
    timerRef,
  ]);
}

export function useBridgeHealthProbe(
  bridgeUrl: string,
  session: BridgeSession | null,
  setters: HealthProbeSetters,
) {
  const [networkStatus, setNetworkStatus] = useState<BridgeNetworkStatus>(
    INITIAL_NETWORK_STATUS,
  );
  const [retryTick, setRetryTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeEnabled = shouldProbeBridge(bridgeUrl);

  useBridgeProbeLoop({
    bridgeUrl,
    probeEnabled,
    retryTick,
    session,
    setters,
    setNetworkStatus,
    timerRef,
  });

  const retryNow = useCallback(() => {
    setRetryTick((tick) => tick + 1);
  }, []);

  return {
    probeEnabled,
    networkStatus: probeEnabled ? networkStatus : INITIAL_NETWORK_STATUS,
    retryNow,
  };
}
