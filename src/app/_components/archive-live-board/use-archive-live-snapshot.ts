import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

import type {
  ArchiveLiveEvent,
  ArchiveLiveSnapshot,
  ArchiveSocketEnvelope,
} from "~/lib/archive-live";
import { ARCHIVE_WORKER_FRESH_MS as WORKER_FRESH_MS } from "~/lib/archive-live";

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

const FALLBACK_RECOVERY_POLL_MS = 15_000;

function workerSeenRecently(lastSeenAt: string | null) {
  return Boolean(
    lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < WORKER_FRESH_MS,
  );
}

function shouldPollRecoveryRoute(input: {
  daemonReachable: boolean | null;
  isConnected: boolean;
  pendingJobs: number;
  runningJobs: number;
  workerLastSeenAt: string | null;
  workerStatus: string | null;
}) {
  if (input.isConnected || input.daemonReachable !== false) {
    return false;
  }

  const hasBacklog = input.pendingJobs > 0 || input.runningJobs > 0;
  if (!hasBacklog) {
    return false;
  }

  const workerIsRunning = input.workerStatus?.toLowerCase() === "running";
  return !workerSeenRecently(input.workerLastSeenAt) || !workerIsRunning;
}

function useRecoveryFallback(input: {
  daemonReachable: boolean | null;
  isConnected: boolean;
  pendingJobs: number;
  runningJobs: number;
  workerLastSeenAt: string | null;
  workerStatus: string | null;
  setSnapshot: (snapshot: ArchiveLiveSnapshot) => void;
  setLatestEvent: (event: ArchiveLiveEvent | null) => void;
}) {
  const {
    daemonReachable,
    isConnected,
    pendingJobs,
    runningJobs,
    workerLastSeenAt,
    workerStatus,
    setSnapshot,
    setLatestEvent,
  } = input;

  useEffect(() => {
    if (
      !shouldPollRecoveryRoute({
        daemonReachable,
        isConnected,
        pendingJobs,
        runningJobs,
        workerLastSeenAt,
        workerStatus,
      })
    ) {
      return;
    }

    let active = true;

    const refreshFromRecoveryRoute = async () => {
      try {
        const response = await fetch("/api/archive/live/recover", {
          method: "POST",
          cache: "no-store",
        });
        if (!response.ok || !active) return;

        const nextSnapshot = (await response.json()) as ArchiveLiveSnapshot;

        setSnapshot(nextSnapshot);
        setLatestEvent(nextSnapshot.recentEvents[0] ?? null);
      } catch {
        // The socket health probe already surfaces daemon outages. The fallback
        // route is best-effort and should fail quietly.
      }
    };

    void refreshFromRecoveryRoute();
    const recoveryInterval = window.setInterval(() => {
      void refreshFromRecoveryRoute();
    }, FALLBACK_RECOVERY_POLL_MS);

    return () => {
      active = false;
      window.clearInterval(recoveryInterval);
    };
  }, [
    daemonReachable,
    isConnected,
    pendingJobs,
    runningJobs,
    workerLastSeenAt,
    workerStatus,
    setLatestEvent,
    setSnapshot,
  ]);
}

export function useArchiveLiveSnapshot(initialSnapshot: ArchiveLiveSnapshot) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [isConnected, setIsConnected] = useState(false);
  const [daemonReachable, setDaemonReachable] = useState<boolean | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [latestEvent, setLatestEvent] = useState<ArchiveLiveEvent | null>(
    initialSnapshot.recentEvents[0] ?? null,
  );
  const pendingJobs = snapshot.stats.pendingJobs;
  const runningJobs = snapshot.stats.runningJobs;
  const workerLastSeenAt = snapshot.worker?.lastSeenAt ?? null;
  const workerStatus = snapshot.worker?.status ?? null;

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
      upgrade: false,
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
  useRecoveryFallback({
    daemonReachable,
    isConnected,
    pendingJobs,
    runningJobs,
    workerLastSeenAt,
    workerStatus,
    setSnapshot,
    setLatestEvent,
  });

  return {
    snapshot,
    setSnapshot,
    isConnected,
    daemonReachable,
    pulseId,
    latestEvent,
  };
}
