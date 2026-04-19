"use client";

import { useState } from "react";

import type {
  BridgePinsResponse,
  RelayPairing,
} from "~/app/_components/desktop-bridge-provider";

import { EMPTY_DRAFT } from "./desktop-console-shared";
import type { ConfigDraft } from "../types";

export type DeepLinkStatus =
  | "idle"
  | "preparing"
  | "ready"
  | "opening"
  | "waiting"
  | "error";

export function useDesktopConsoleRawState() {
  const [localInventory, setLocalInventory] =
    useState<BridgePinsResponse | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pairing, setPairing] = useState<RelayPairing | null>(null);
  const [deepLinkStatus, setDeepLinkStatus] = useState<DeepLinkStatus>("idle");
  const [lastLocalRefreshAt, setLastLocalRefreshAt] = useState<string | null>(
    null,
  );
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [configDraft, setConfigDraft] = useState<ConfigDraft>(EMPTY_DRAFT);

  return {
    localInventory,
    setLocalInventory,
    feedback,
    setFeedback,
    pairing,
    setPairing,
    deepLinkStatus,
    setDeepLinkStatus,
    lastLocalRefreshAt,
    setLastLocalRefreshAt,
    selectedDeviceId,
    setSelectedDeviceId,
    configDraft,
    setConfigDraft,
  };
}
