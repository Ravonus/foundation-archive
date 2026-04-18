"use client";

import { useEffect, type MutableRefObject } from "react";

import type {
  RelayOwnerClientMessage,
  RelayOwnerWireMessage,
} from "~/lib/desktop-relay";
import { resolveArchiveRelayWebSocketUrl } from "~/lib/desktop-relay";

import type { RelayInventorySnapshot, RelayOwnerDevice } from "../types";

type SocketSetters = {
  setRelaySocketConnected: (connected: boolean) => void;
  setRelayDevices: (devices: RelayOwnerDevice[]) => void;
  setRelayInventories: (
    updater: (
      current: Record<string, RelayInventorySnapshot>,
    ) => Record<string, RelayInventorySnapshot>,
  ) => void;
  setError: (message: string) => void;
};

function handleRelayMessage(
  payload: RelayOwnerWireMessage,
  setters: SocketSetters,
) {
  if (payload.type === "owner.snapshot") {
    setters.setRelayDevices(payload.devices as RelayOwnerDevice[]);
    return;
  }

  if (payload.type === "owner.inventory") {
    setters.setRelayInventories((current) => ({
      ...current,
      [payload.deviceId]: {
        deviceId: payload.deviceId,
        generatedAt: payload.generatedAt,
        items: payload.items,
      },
    }));
    return;
  }

  if (payload.type === "owner.error") {
    setters.setError(payload.message);
  }
}

export function useRelaySocket(
  ownerToken: string | null,
  relaySocketRef: MutableRefObject<WebSocket | null>,
  setters: SocketSetters,
) {
  useEffect(() => {
    if (!ownerToken) return;

    let cancelled = false;
    let retryHandle: number | null = null;

    const connectRelaySocket = () => {
      if (cancelled) return;

      const socket = new window.WebSocket(
        resolveArchiveRelayWebSocketUrl(ownerToken),
      );
      relaySocketRef.current = socket;

      socket.addEventListener("open", () => {
        setters.setRelaySocketConnected(true);
        socket.send(
          JSON.stringify({
            type: "owner.refresh",
          } satisfies RelayOwnerClientMessage),
        );
      });

      socket.addEventListener("message", (event) => {
        const payload = JSON.parse(
          event.data as string,
        ) as RelayOwnerWireMessage;
        handleRelayMessage(payload, setters);
      });

      socket.addEventListener("close", () => {
        if (relaySocketRef.current === socket) {
          relaySocketRef.current = null;
        }
        setters.setRelaySocketConnected(false);

        if (!cancelled) {
          retryHandle = window.setTimeout(connectRelaySocket, 1500);
        }
      });

      socket.addEventListener("error", () => {
        setters.setRelaySocketConnected(false);
      });
    };

    connectRelaySocket();

    return () => {
      cancelled = true;
      if (retryHandle) {
        window.clearTimeout(retryHandle);
      }
      relaySocketRef.current?.close();
      relaySocketRef.current = null;
    };
    // Setters are stable via useState; retry loop only needs to restart on token change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerToken]);
}
