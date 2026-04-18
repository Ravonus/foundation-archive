import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

import type {
  ArchiveLiveEvent,
  ArchiveLiveSnapshot,
  ArchiveSocketEnvelope,
} from "~/lib/archive-live";

import { resolveSocketHealthUrl, resolveSocketUrl } from "./socket-urls";

interface ArchiveSocketHandlers {
  setIsConnected: (value: boolean) => void;
  setDaemonReachable: (value: boolean | null) => void;
  setSnapshot: (snapshot: ArchiveLiveSnapshot) => void;
  setPulseId: (id: string | null) => void;
  setLatestEvent: (event: ArchiveLiveEvent | null) => void;
  checkHealth: () => void;
}

function bindSocketHandlers(socket: Socket, handlers: ArchiveSocketHandlers) {
  socket.on("connect", () => {
    handlers.setIsConnected(true);
    handlers.setDaemonReachable(true);
  });
  socket.on("disconnect", () => handlers.setIsConnected(false));
  socket.on("connect_error", () => {
    handlers.setIsConnected(false);
    handlers.checkHealth();
  });
  socket.on("archive:snapshot", (nextSnapshot: ArchiveLiveSnapshot) => {
    handlers.setSnapshot(nextSnapshot);
  });
  socket.on("archive:update", (envelope: ArchiveSocketEnvelope) => {
    handlers.setSnapshot(envelope.snapshot);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    handlers.setPulseId(envelope.event?.id ?? null);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    handlers.setLatestEvent(envelope.event ?? null);
  });
}

export function useArchiveLiveSnapshot(initialSnapshot: ArchiveLiveSnapshot) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [isConnected, setIsConnected] = useState(false);
  const [daemonReachable, setDaemonReachable] = useState<boolean | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [latestEvent, setLatestEvent] = useState<ArchiveLiveEvent | null>(
    initialSnapshot.recentEvents[0] ?? null,
  );

  useEffect(() => {
    const socketUrl = resolveSocketUrl();
    const healthUrl = resolveSocketHealthUrl();
    let active = true;

    const checkHealth = async () => {
      if (!healthUrl) return;

      try {
        const response = await fetch(healthUrl, { cache: "no-store" });
        if (!active) return;
        setDaemonReachable(response.ok);
      } catch {
        if (!active) return;
        setDaemonReachable(false);
      }
    };

    void checkHealth();
    const healthInterval = window.setInterval(() => {
      void checkHealth();
    }, 10_000);

    const socket: Socket = io(socketUrl, {
      reconnection: true,
      reconnectionDelay: 1_000,
      timeout: 5_000,
    });

    bindSocketHandlers(socket, {
      setIsConnected,
      setDaemonReachable,
      setSnapshot,
      setPulseId,
      setLatestEvent,
      checkHealth: () => void checkHealth(),
    });

    return () => {
      active = false;
      window.clearInterval(healthInterval);
      socket.disconnect();
    };
  }, []);

  return {
    snapshot,
    setSnapshot,
    isConnected,
    daemonReachable,
    pulseId,
    latestEvent,
  };
}
