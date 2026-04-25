"use client";

import { useEffect, type MutableRefObject } from "react";

import type {
  RelayOwnerClientMessage,
  RelayOwnerWireMessage,
} from "~/lib/desktop-relay";
import { resolveArchiveRelayWebSocketUrl } from "~/lib/desktop-relay";

import {
  isTerminalJobStatus,
  publishJobUpdate,
} from "../lib/job-subscriptions";
import { normalizeBridgeConfig, normalizeBridgeHealth } from "../lib/wire";
import type {
  RelayDeviceStateSnapshot,
  RelayInventorySnapshot,
  RelayOwnerDevice,
} from "../types";

type SocketSetters = {
  setRelaySocketConnected: (connected: boolean) => void;
  setRelayDevices: (devices: RelayOwnerDevice[]) => void;
  setRelayInventories: (
    updater: (
      current: Record<string, RelayInventorySnapshot>,
    ) => Record<string, RelayInventorySnapshot>,
  ) => void;
  setRelayDeviceStates: (
    updater: (
      current: Record<string, RelayDeviceStateSnapshot>,
    ) => Record<string, RelayDeviceStateSnapshot>,
  ) => void;
  setError: (message: string | null) => void;
};

function handleRelayMessage(
  payload: RelayOwnerWireMessage,
  setters: SocketSetters,
) {
  if (payload.type === "owner.snapshot") {
    const devices = payload.devices as RelayOwnerDevice[];
    setters.setRelayDevices(devices);
    setters.setError(null);
    const deviceIds = new Set(devices.map((device) => device.id));
    setters.setRelayInventories((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([deviceId]) => deviceIds.has(deviceId)),
      ),
    );
    setters.setRelayDeviceStates((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([deviceId]) => deviceIds.has(deviceId)),
      ),
    );
    for (const device of devices) {
      for (const job of device.recentJobs) {
        if (isTerminalJobStatus(job.status)) {
          publishJobUpdate({
            jobId: job.id,
            status: job.status,
            errorMessage: job.errorMessage,
            finishedAt: job.finishedAt,
          });
        }
      }
    }
    return;
  }

  if (payload.type === "owner.jobUpdate") {
    publishJobUpdate({
      jobId: payload.jobId,
      status: payload.status,
      errorMessage: payload.errorMessage ?? null,
      finishedAt: payload.finishedAt ?? null,
    });
    return;
  }

  if (payload.type === "owner.inventory") {
    setters.setError(null);
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

  if (payload.type === "owner.deviceState") {
    setters.setError(null);
    setters.setRelayDeviceStates((current) => ({
      ...current,
      [payload.deviceId]: {
        deviceId: payload.deviceId,
        generatedAt: payload.generatedAt,
        health: normalizeBridgeHealth(payload.health),
        config: normalizeBridgeConfig(payload.config),
      },
    }));
    return;
  }

  setters.setError(payload.message);
}

export function useRelaySocket(
  ownerToken: string | null,
  relaySocketRef: MutableRefObject<WebSocket | null>,
  setters: SocketSetters,
) {
  const {
    setRelaySocketConnected,
    setRelayDevices,
    setRelayInventories,
    setRelayDeviceStates,
    setError,
  } = setters;

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
        setRelaySocketConnected(true);
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
        handleRelayMessage(payload, {
          setRelaySocketConnected,
          setRelayDevices,
          setRelayInventories,
          setRelayDeviceStates,
          setError,
        });
      });

      socket.addEventListener("close", () => {
        if (relaySocketRef.current === socket) {
          relaySocketRef.current = null;
        }
        setRelaySocketConnected(false);

        if (!cancelled) {
          retryHandle = window.setTimeout(connectRelaySocket, 1500);
        }
      });

      socket.addEventListener("error", () => {
        setRelaySocketConnected(false);
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
  }, [
    ownerToken,
    relaySocketRef,
    setError,
    setRelayDevices,
    setRelayDeviceStates,
    setRelayInventories,
    setRelaySocketConnected,
  ]);
}
