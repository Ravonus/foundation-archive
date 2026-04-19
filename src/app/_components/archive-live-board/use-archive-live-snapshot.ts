import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import type {
  ArchiveLiveEvent,
  ArchiveLiveSnapshot,
  ArchiveSocketEnvelope,
} from "~/lib/archive-live";
import { ARCHIVE_WORKER_FRESH_MS as WORKER_FRESH_MS } from "~/lib/archive-live";

import { acquireArchiveSocket } from "./archive-socket-client";

const FALLBACK_RECOVERY_POLL_MS = 30_000;
const LIVE_EVENT_SURFACE_MS = 6_500;
const LIVE_EVENT_PULSE_MS = 2_400;
const MAX_SURFACED_EVENTS = 14;
const MAX_STAGED_EVENTS = 18;

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
  isConnected: boolean;
  pendingJobs: number;
  runningJobs: number;
  workerLastSeenAt: string | null;
  workerStatus: string | null;
}) {
  if (input.isConnected) {
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
      if (document.hidden) return;
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
        // Best-effort fallback; ignore transient errors.
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
    const { socket, release } = acquireArchiveSocket();

    const onConnect = () => {
      setIsConnected(true);
      setDaemonReachable(true);
    };
    const onDisconnect = () => setIsConnected(false);
    const onConnectError = () => {
      setIsConnected(false);
      setDaemonReachable(false);
    };
    const onSnapshot = (next: ArchiveLiveSnapshot) => {
      handleArchiveSnapshot(next);
    };
    const onUpdate = (envelope: ArchiveSocketEnvelope) => {
      handleArchiveUpdate(envelope);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("archive:snapshot", onSnapshot);
    socket.on("archive:update", onUpdate);

    if (socket.connected) queueMicrotask(onConnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("archive:snapshot", onSnapshot);
      socket.off("archive:update", onUpdate);
      release();
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
