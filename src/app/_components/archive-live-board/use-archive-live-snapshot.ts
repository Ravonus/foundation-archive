import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { io, type Socket } from "socket.io-client";

import type {
  ArchiveLiveEvent,
  ArchiveLiveSnapshot,
  ArchiveSocketEnvelope,
} from "~/lib/archive-live";
import { ARCHIVE_WORKER_FRESH_MS as WORKER_FRESH_MS } from "~/lib/archive-live";

import {
  resolveSocketHealthUrl,
  resolveSocketIoTransportOptions,
  resolveSocketUrl,
} from "./socket-urls";

const FALLBACK_RECOVERY_POLL_MS = 15_000;
const LIVE_EVENT_SURFACE_MS = 6_500;
const LIVE_EVENT_PULSE_MS = 2_400;
const MAX_SURFACED_EVENTS = 14;
const MAX_STAGED_EVENTS = 18;
const HEALTH_OFFLINE_GRACE_MS = 20_000;
const SOCKET_CONNECT_TIMEOUT_MS = 20_000;
const SOCKET_RECONNECT_DELAY_MS = 1_000;
const SOCKET_RECONNECT_DELAY_MAX_MS = 10_000;

function mergeVisibleEvents(
  current: Array<ArchiveLiveEvent>,
  nextEvents: Array<ArchiveLiveEvent>,
) {
  const merged = [...nextEvents, ...current];
  const deduped: Array<ArchiveLiveEvent> = [];
  const seen = new Set<string>();

  for (const event of merged) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    deduped.push(event);

    if (deduped.length >= MAX_SURFACED_EVENTS) {
      break;
    }
  }

  return deduped;
}

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
  syncVisibleEvents: (events: Array<ArchiveLiveEvent>) => void;
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
    syncVisibleEvents,
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
        syncVisibleEvents(nextSnapshot.recentEvents);
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
    syncVisibleEvents,
  ]);
}

function useStagedArchiveEvents(initialSnapshot: ArchiveLiveSnapshot) {
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [latestEvent, setLatestEvent] = useState<ArchiveLiveEvent | null>(
    initialSnapshot.recentEvents[0] ?? null,
  );
  const [visibleEvents, setVisibleEvents] = useState(
    initialSnapshot.recentEvents,
  );
  const [stagedEvents, setStagedEvents] = useState<Array<ArchiveLiveEvent>>([]);
  const latestEventIdRef = useRef<string | null>(
    initialSnapshot.recentEvents[0]?.id ?? null,
  );

  const syncVisibleEvents = useCallback((events: Array<ArchiveLiveEvent>) => {
    setVisibleEvents((current) => mergeVisibleEvents(current, events));
  }, []);

  useEffect(() => {
    latestEventIdRef.current = latestEvent?.id ?? null;
  }, [latestEvent]);

  const stageEvent = useCallback((event: ArchiveLiveEvent | null) => {
    if (!event) return;

    setStagedEvents((current) => {
      if (
        latestEventIdRef.current === event.id ||
        current.some((queuedEvent) => queuedEvent.id === event.id)
      ) {
        return current;
      }

      const next = [...current, event];
      return next.slice(-MAX_STAGED_EVENTS);
    });
  }, []);
  const surfaceNextEvent = useEffectEvent(() => {
    setStagedEvents((current) => {
      const nextEvent = current[0];
      if (!nextEvent) return current;

      setLatestEvent(nextEvent);
      setPulseId(nextEvent.id);
      setVisibleEvents((visible) => mergeVisibleEvents(visible, [nextEvent]));
      return current.slice(1);
    });
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      surfaceNextEvent();
    }, LIVE_EVENT_SURFACE_MS);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!pulseId) return;

    const timeout = window.setTimeout(() => {
      setPulseId((current) => (current === pulseId ? null : current));
    }, LIVE_EVENT_PULSE_MS);

    return () => window.clearTimeout(timeout);
  }, [pulseId]);

  return {
    pulseId,
    latestEvent,
    setLatestEvent,
    visibleEvents,
    queuedUpdateCount: stagedEvents.length,
    stageEvent,
    syncVisibleEvents,
  };
}

function useArchiveLiveSocketConnection(input: {
  setIsConnected: (value: boolean) => void;
  setDaemonReachable: (value: boolean | null) => void;
  setSnapshot: (snapshot: ArchiveLiveSnapshot) => void;
  syncVisibleEvents: (events: Array<ArchiveLiveEvent>) => void;
  stageEvent: (event: ArchiveLiveEvent | null) => void;
}) {
  const {
    setIsConnected,
    setDaemonReachable,
    setSnapshot,
    syncVisibleEvents,
    stageEvent,
  } = input;
  const handleArchiveSnapshot = useEffectEvent(
    (nextSnapshot: ArchiveLiveSnapshot) => {
      setSnapshot(nextSnapshot);
      syncVisibleEvents(nextSnapshot.recentEvents);
    },
  );
  const handleArchiveUpdate = useEffectEvent(
    (envelope: ArchiveSocketEnvelope) => {
      setSnapshot(envelope.snapshot);
      stageEvent(envelope.event);
    },
  );

  useEffect(() => {
    const socketUrl = resolveSocketUrl();
    const socketTransportOptions = resolveSocketIoTransportOptions(socketUrl);
    const healthUrl = resolveSocketHealthUrl();
    let active = true;
    let lastHealthyAt = 0;

    const setReachability = (reachable: boolean) => {
      if (!active) return;

      if (reachable) {
        lastHealthyAt = Date.now();
        setDaemonReachable(true);
        return;
      }

      const withinGraceWindow =
        lastHealthyAt > 0 &&
        Date.now() - lastHealthyAt < HEALTH_OFFLINE_GRACE_MS;
      setDaemonReachable(withinGraceWindow ? true : false);
    };

    const checkHealth = async () => {
      if (!healthUrl) return;

      try {
        const response = await fetch(healthUrl, { cache: "no-store" });
        setReachability(response.ok);
      } catch {
        setReachability(false);
      }
    };

    void checkHealth();
    const healthInterval = window.setInterval(() => {
      void checkHealth();
    }, 10_000);

    const socket: Socket = io(socketUrl, {
      reconnection: true,
      reconnectionDelay: SOCKET_RECONNECT_DELAY_MS,
      reconnectionDelayMax: SOCKET_RECONNECT_DELAY_MAX_MS,
      timeout: SOCKET_CONNECT_TIMEOUT_MS,
      ...socketTransportOptions,
    });

    socket.on("connect", () => {
      setIsConnected(true);
      setReachability(true);
    });
    socket.on("disconnect", () => {
      setIsConnected(false);
    });
    socket.on("connect_error", () => {
      setIsConnected(false);
      void checkHealth();
    });
    socket.on("archive:snapshot", handleArchiveSnapshot);
    socket.on("archive:update", handleArchiveUpdate);

    return () => {
      active = false;
      window.clearInterval(healthInterval);
      socket.disconnect();
    };
  }, [
    stageEvent,
    setDaemonReachable,
    setIsConnected,
    setSnapshot,
    syncVisibleEvents,
  ]);
}

export function useArchiveLiveSnapshot(initialSnapshot: ArchiveLiveSnapshot) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [isConnected, setIsConnected] = useState(false);
  const [daemonReachable, setDaemonReachable] = useState<boolean | null>(null);
  const pendingJobs = snapshot.stats.pendingJobs;
  const runningJobs = snapshot.stats.runningJobs;
  const workerLastSeenAt = snapshot.worker?.lastSeenAt ?? null;
  const workerStatus = snapshot.worker?.status ?? null;
  const {
    pulseId,
    latestEvent,
    setLatestEvent,
    visibleEvents,
    queuedUpdateCount,
    stageEvent,
    syncVisibleEvents,
  } = useStagedArchiveEvents(initialSnapshot);

  useArchiveLiveSocketConnection({
    setIsConnected,
    setDaemonReachable,
    setSnapshot,
    syncVisibleEvents,
    stageEvent,
  });

  useRecoveryFallback({
    daemonReachable,
    isConnected,
    pendingJobs,
    runningJobs,
    workerLastSeenAt,
    workerStatus,
    setSnapshot,
    syncVisibleEvents,
    setLatestEvent,
  });

  return {
    snapshot,
    setSnapshot,
    isConnected,
    daemonReachable,
    pulseId,
    latestEvent,
    visibleEvents,
    queuedUpdateCount,
  };
}
