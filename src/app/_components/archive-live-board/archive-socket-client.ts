import { io, type Socket } from "socket.io-client";

import {
  resolveSocketIoTransportOptions,
  resolveSocketUrl,
} from "./socket-urls";

const RECONNECT_DELAY_MS = 3_000;
const RECONNECT_DELAY_MAX_MS = 30_000;
const CONNECT_TIMEOUT_MS = 20_000;
const RATE_LIMIT_COOLDOWN_MS = 120_000;
const WATCHDOG_INTERVAL_MS = 10_000;

type Listener = () => void;

let sharedSocket: Socket | null = null;
let subscribers = 0;
let visibilityHandler: (() => void) | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let rateLimitResumeAt = 0;
let rateLimitTimeout: ReturnType<typeof setTimeout> | null = null;

function clearRateLimitTimeout() {
  if (rateLimitTimeout) {
    clearTimeout(rateLimitTimeout);
    rateLimitTimeout = null;
  }
}

function pauseReconnects(socket: Socket) {
  const manager = socket.io;
  if (manager.reconnection()) {
    manager.reconnection(false);
  }
}

function resumeReconnects(socket: Socket) {
  const manager = socket.io;
  if (!manager.reconnection()) {
    manager.reconnection(true);
  }
  if (!socket.connected) {
    socket.connect();
  }
}

function armRateLimitCooldown(socket: Socket) {
  rateLimitResumeAt = Date.now() + RATE_LIMIT_COOLDOWN_MS;
  pauseReconnects(socket);
  socket.disconnect();

  clearRateLimitTimeout();
  rateLimitTimeout = setTimeout(() => {
    rateLimitResumeAt = 0;
    rateLimitTimeout = null;
    if (sharedSocket && !document.hidden) {
      resumeReconnects(sharedSocket);
    }
  }, RATE_LIMIT_COOLDOWN_MS);
}

function looksRateLimited(error: unknown): boolean {
  if (!error) return false;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /429|too many/i.test(message);
}

function ensureSocket(): Socket {
  if (sharedSocket) return sharedSocket;

  const socketUrl = resolveSocketUrl();
  const transportOptions = resolveSocketIoTransportOptions(socketUrl);

  const socket = io(socketUrl, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: RECONNECT_DELAY_MS,
    reconnectionDelayMax: RECONNECT_DELAY_MAX_MS,
    randomizationFactor: 0.7,
    timeout: CONNECT_TIMEOUT_MS,
    autoConnect: typeof document === "undefined" || !document.hidden,
    ...transportOptions,
  });

  socket.on("connect_error", (error) => {
    if (looksRateLimited(error)) {
      armRateLimitCooldown(socket);
    }
  });

  sharedSocket = socket;

  if (typeof document !== "undefined") {
    visibilityHandler = () => {
      if (!sharedSocket) return;
      if (document.hidden) {
        pauseReconnects(sharedSocket);
        sharedSocket.disconnect();
      } else if (Date.now() >= rateLimitResumeAt) {
        resumeReconnects(sharedSocket);
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);

    // Watchdog: socket.io's internal reconnection state machine can get
    // stuck after a burst of connect_error events during a deploy —
    // manager.reconnection() stays true but no dial actually happens.
    // Every 10s, if the tab is visible, not rate-limited, and we're not
    // connected, force a reconnect. Cheap and idempotent.
    watchdogTimer = setInterval(() => {
      if (!sharedSocket) return;
      if (document.hidden) return;
      if (Date.now() < rateLimitResumeAt) return;
      if (sharedSocket.connected) return;

      const manager = sharedSocket.io;
      if (!manager.reconnection()) {
        manager.reconnection(true);
      }
      sharedSocket.connect();
    }, WATCHDOG_INTERVAL_MS);
  }

  return socket;
}

export function acquireArchiveSocket(onReady?: Listener): {
  socket: Socket;
  release: () => void;
} {
  const socket = ensureSocket();
  subscribers += 1;

  if (onReady) onReady();

  return {
    socket,
    release: () => {
      subscribers = Math.max(0, subscribers - 1);
      if (subscribers === 0 && sharedSocket) {
        clearRateLimitTimeout();
        rateLimitResumeAt = 0;
        if (watchdogTimer) {
          clearInterval(watchdogTimer);
          watchdogTimer = null;
        }
        if (
          typeof document !== "undefined" &&
          visibilityHandler
        ) {
          document.removeEventListener("visibilitychange", visibilityHandler);
          visibilityHandler = null;
        }
        sharedSocket.removeAllListeners();
        sharedSocket.disconnect();
        sharedSocket = null;
      }
    },
  };
}
