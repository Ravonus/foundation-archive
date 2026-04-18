import type { SocketBadge } from "./types";

const LIVE_BADGE: SocketBadge = {
  label: "Live",
  className: "bg-[var(--tint-ok)] text-[var(--color-ok)]",
  dotClass: "bg-[var(--color-ok)]",
  pulse: true,
};

const RECONNECTING_BADGE: SocketBadge = {
  label: "Reconnecting",
  className: "bg-[var(--tint-warn)] text-[var(--color-warn)]",
  dotClass: "bg-[var(--color-warn)]",
  pulse: true,
};

const OFFLINE_BADGE: SocketBadge = {
  label: "Offline",
  className: "bg-[var(--tint-err)] text-[var(--color-err)]",
  dotClass: "bg-[var(--color-err)]",
  pulse: false,
};

const CHECKING_BADGE: SocketBadge = {
  label: "Checking",
  className: "bg-[var(--tint-info)] text-[var(--color-info)]",
  dotClass: "bg-[var(--color-info)]",
  pulse: false,
};

export function resolveSocketBadge(
  isConnected: boolean,
  daemonReachable: boolean | null,
): SocketBadge {
  if (isConnected) return LIVE_BADGE;
  if (daemonReachable === true) return RECONNECTING_BADGE;
  if (daemonReachable === false) return OFFLINE_BADGE;
  return CHECKING_BADGE;
}
