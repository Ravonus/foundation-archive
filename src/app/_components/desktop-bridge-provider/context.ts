"use client";

import { createContext, useContext } from "react";

import type { DesktopBridgeContextValue } from "./types";

export const DesktopBridgeContext =
  createContext<DesktopBridgeContextValue | null>(null);

export function useDesktopBridge() {
  const context = useContext(DesktopBridgeContext);

  if (!context) {
    throw new Error(
      "useDesktopBridge must be used within DesktopBridgeProvider.",
    );
  }

  return context;
}
