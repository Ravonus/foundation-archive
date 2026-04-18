"use client";

import { useEffect } from "react";

import { safeParseSession } from "../lib/bridge-api";
import {
  BRIDGE_SESSION_KEY,
  BRIDGE_URL_KEY,
  RELAY_OWNER_KEY,
} from "../constants";
import type { BridgeSession } from "../types";

type Setters = {
  setBridgeUrlState: (url: string) => void;
  setSession: (session: BridgeSession) => void;
  setOwnerToken: (token: string) => void;
};

function generateOwnerToken() {
  // `window.crypto` is typed non-nullable but is genuinely undefined in insecure contexts / legacy browsers, so the optional chain is a real runtime guard.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useInitialStorage({
  setBridgeUrlState,
  setSession,
  setOwnerToken,
}: Setters) {
  useEffect(() => {
    const savedBridgeUrl = window.localStorage.getItem(BRIDGE_URL_KEY);
    const savedSession = safeParseSession(
      window.localStorage.getItem(BRIDGE_SESSION_KEY),
    );
    const savedOwnerToken = window.localStorage.getItem(RELAY_OWNER_KEY);

    if (savedBridgeUrl?.trim()) {
      setBridgeUrlState(savedBridgeUrl);
    }

    if (savedSession) {
      setSession(savedSession);
    }

    if (savedOwnerToken?.trim()) {
      setOwnerToken(savedOwnerToken);
    } else {
      const nextOwnerToken = generateOwnerToken();
      window.localStorage.setItem(RELAY_OWNER_KEY, nextOwnerToken);
      setOwnerToken(nextOwnerToken);
    }
  }, [setBridgeUrlState, setOwnerToken, setSession]);
}
