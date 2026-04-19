"use client";

import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import {
  resolveSocketIoTransportOptions,
  resolveSocketUrl,
} from "~/app/_components/archive-live-board/socket-urls";
import { type ArchiveSocketEnvelope } from "~/lib/archive-live";
import { cn } from "~/lib/utils";

const REFRESH_DEBOUNCE_MS = 200;
const PULSE_LINGER_MS = 5_000;

function matchesProfileUpdate(
  envelope: ArchiveSocketEnvelope,
  input: {
    accountAddress: string;
    username: string | null;
  },
) {
  const artwork = envelope.event.artwork;
  if (!artwork) return false;

  const walletMatch =
    artwork.artistWallet?.toLowerCase() === input.accountAddress.toLowerCase();
  const usernameMatch =
    Boolean(input.username) &&
    artwork.artistUsername?.toLowerCase() === input.username?.toLowerCase();

  return walletMatch || usernameMatch;
}

type LiveEventPulse = {
  id: string;
  summary: string;
  title: string | null;
  type: string;
};

export function ProfileLiveShell({
  accountAddress,
  username,
  children,
}: {
  accountAddress: string;
  username: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const [pulse, setPulse] = useState<LiveEventPulse | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);
  const pulseTimeoutRef = useRef<number | null>(null);

  const scheduleRefresh = useEffectEvent(() => {
    if (refreshTimeoutRef.current) return;
    refreshTimeoutRef.current = window.setTimeout(() => {
      refreshTimeoutRef.current = null;
      startRefresh(() => {
        router.refresh();
      });
    }, REFRESH_DEBOUNCE_MS);
  });

  const schedulePulseClear = useEffectEvent(() => {
    if (pulseTimeoutRef.current) {
      window.clearTimeout(pulseTimeoutRef.current);
    }
    pulseTimeoutRef.current = window.setTimeout(() => {
      pulseTimeoutRef.current = null;
      setPulse(null);
    }, PULSE_LINGER_MS);
  });

  const handleArchiveUpdate = useEffectEvent(
    (envelope: ArchiveSocketEnvelope) => {
      if (!matchesProfileUpdate(envelope, { accountAddress, username })) return;

      const event = envelope.event;
      setPulse({
        id: event.id,
        summary: event.summary,
        title: event.artwork?.title ?? null,
        type: event.type,
      });
      schedulePulseClear();
      scheduleRefresh();
    },
  );

  useEffect(() => {
    const socketUrl = resolveSocketUrl();
    const socket: Socket = io(socketUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      ...resolveSocketIoTransportOptions(socketUrl),
    });

    socket.on("connect", () => {
      setIsConnected(true);
    });
    socket.on("disconnect", () => {
      setIsConnected(false);
    });
    socket.on("connect_error", () => {
      setIsConnected(false);
    });
    socket.on("archive:update", handleArchiveUpdate);

    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      if (pulseTimeoutRef.current) {
        window.clearTimeout(pulseTimeoutRef.current);
        pulseTimeoutRef.current = null;
      }
      socket.disconnect();
    };
  }, []);

  const pulseTone = pulseToneFromEventType(pulse?.type);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {pulse ? (
          <span
            key={pulse.id}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.7rem] tracking-[0.14em] uppercase animate-pulse",
              pulseTone,
            )}
            title={pulse.summary}
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
            <span className="max-w-[18rem] truncate normal-case tracking-normal">
              {pulse.title ? `${pulse.title} · ${pulse.summary}` : pulse.summary}
            </span>
          </span>
        ) : null}
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.7rem] tracking-[0.16em] uppercase",
            isConnected
              ? "border-[var(--color-ok)]/30 bg-[var(--tint-ok)] text-[var(--color-ok)]"
              : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-muted)]",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isConnected ? "bg-current" : "bg-[var(--color-muted)]",
            )}
          />
          {isRefreshing
            ? "Refreshing profile"
            : isConnected
              ? "Live updates on"
              : "Live updates reconnecting"}
        </span>
      </div>
      {children}
    </div>
  );
}

function pulseToneFromEventType(type: string | undefined) {
  if (!type) return "border-[var(--color-line)] text-[var(--color-muted)]";
  const lower = type.toLowerCase();
  if (lower.includes("pin") || lower.includes("preserv") || lower.includes("backup")) {
    return "border-[var(--color-ok)]/30 bg-[var(--tint-ok)] text-[var(--color-ok)]";
  }
  if (lower.includes("fail") || lower.includes("error")) {
    return "border-[var(--color-warn)]/30 bg-[var(--tint-warn)] text-[var(--color-warn)]";
  }
  return "border-[var(--color-info)]/30 bg-[var(--tint-info)] text-[var(--color-info)]";
}
