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

import { resolveSocketUrl } from "~/app/_components/archive-live-board/socket-urls";
import { type ArchiveSocketEnvelope } from "~/lib/archive-live";
import { cn } from "~/lib/utils";

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
  const refreshTimeoutRef = useRef<number | null>(null);
  const lastRefreshAtRef = useRef(0);
  const scheduleRefresh = useEffectEvent(() => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current > 1200 && !refreshTimeoutRef.current) {
      lastRefreshAtRef.current = now;
      startRefresh(() => {
        router.refresh();
      });
      return;
    }

    if (refreshTimeoutRef.current) return;
    refreshTimeoutRef.current = window.setTimeout(() => {
      refreshTimeoutRef.current = null;
      lastRefreshAtRef.current = Date.now();
      startRefresh(() => {
        router.refresh();
      });
    }, 900);
  });
  const handleArchiveUpdate = useEffectEvent((envelope: ArchiveSocketEnvelope) => {
    if (!matchesProfileUpdate(envelope, { accountAddress, username })) return;
    scheduleRefresh();
  });

  useEffect(() => {
    const socket: Socket = io(resolveSocketUrl(), {
      reconnection: true,
      reconnectionDelay: 1000,
      timeout: 5000,
      upgrade: false,
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
      socket.disconnect();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.7rem] uppercase tracking-[0.16em]",
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
