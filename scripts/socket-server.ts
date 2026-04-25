/* eslint-disable complexity, max-lines */

import "dotenv/config";

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { Server as SocketIOServer, type Socket } from "socket.io";
import { WebSocket, WebSocketServer, type RawData } from "ws";

import { env } from "~/env";
import { archivePaceConfigForContractsPerTick } from "~/lib/archive-pace";
import type { ArchiveLiveEvent } from "~/lib/archive-live";
import type { RelayPinInventoryItem } from "~/lib/desktop-relay";
import { getArchiveLiveSnapshot } from "~/server/archive/dashboard";
import { listenForArchiveEvents } from "~/server/archive/live-events";
import { getArchivePolicyState } from "~/server/archive/state";
import { runWorkerCycle } from "~/server/archive/worker";
import { db } from "~/server/db";
import {
  claimRelayJobsForDeviceId,
  getRelayDeviceByToken,
  listRelayDevices,
  reportRelayJobResult,
  requireRelayDeviceByToken,
  touchRelayDevice,
} from "~/server/relay/service";

type CachedRelayInventory = {
  generatedAt: string;
  items: RelayPinInventoryItem[];
};

type CachedRelayDeviceState = {
  generatedAt: string;
  health: unknown;
  config: unknown;
};

type OwnerRelayMessage =
  | {
      type: "owner.refresh";
    }
  | {
      type: "owner.requestInventory";
      deviceId: string;
    };

type DeviceRelayMessage =
  | {
      type: "device.inventory";
      items: RelayPinInventoryItem[];
    }
  | {
      type: "device.state";
      health: unknown;
      config: unknown;
    }
  | {
      type: "device.jobResult";
      jobId: string;
      status: "COMPLETED" | "FAILED";
      resultPayload?: string | null;
      errorMessage?: string | null;
    };

type DeviceSocketClient = {
  socket: WebSocket;
  ownerToken: string;
  deviceId: string;
  deviceLabel: string;
  deviceToken: string;
};

const ARCHIVE_EVENT_RETRY_MS = 5_000;
const ARCHIVE_SNAPSHOT_HEARTBEAT_MS = 15_000;

function safeSend(socket: WebSocket, payload: unknown) {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function checkExistingArchiveSocketServer(port: number) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return false;
    }

    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
    } | null;

    return body?.ok === true;
  } catch {
    return false;
  }
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
      continue;
    }

    if (chunk instanceof Buffer) {
      chunks.push(chunk);
      continue;
    }

    chunks.push(Buffer.from(chunk as Uint8Array));
  }

  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
}

function rawDataToString(data: RawData) {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }

  return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString(
    "utf8",
  );
}

function logSocketError(context: string, error: unknown) {
  console.error(`[socket] ${context}`, error);
}

async function main() {
  if (await checkExistingArchiveSocketServer(env.ARCHIVE_SOCKET_PORT)) {
    console.log(
      `[socket] archive live server already running on http://127.0.0.1:${env.ARCHIVE_SOCKET_PORT}`,
    );
    return;
  }

  const ownerSockets = new Map<string, Set<WebSocket>>();
  const deviceSockets = new Map<string, DeviceSocketClient>();
  const cachedInventory = new Map<string, CachedRelayInventory>();
  const cachedDeviceState = new Map<string, CachedRelayDeviceState>();
  let stopping = false;

  function writeJson(
    response: ServerResponse,
    statusCode: number,
    payload: Record<string, unknown>,
  ) {
    response.writeHead(statusCode, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
    });
    response.end(JSON.stringify(payload));
  }

  function broadcastToOwner(ownerToken: string, payload: unknown) {
    const sockets = ownerSockets.get(ownerToken);
    if (!sockets?.size) return;

    for (const socket of sockets) {
      safeSend(socket, payload);
    }
  }

  async function broadcastOwnerSnapshot(ownerToken: string) {
    const devices = await listRelayDevices(db, ownerToken);
    const liveDeviceIds = new Set(
      [...deviceSockets.values()]
        .filter((client) => client.ownerToken === ownerToken)
        .map((client) => client.deviceId),
    );

    broadcastToOwner(ownerToken, {
      type: "owner.snapshot",
      devices: devices.map((device) => ({
        ...device,
        connected:
          device.relayEnabled &&
          (device.connected || liveDeviceIds.has(device.id)),
      })),
    });

    for (const device of devices) {
      const inventory = cachedInventory.get(device.id);
      if (!inventory) continue;

      broadcastToOwner(ownerToken, {
        type: "owner.inventory",
        deviceId: device.id,
        generatedAt: inventory.generatedAt,
        items: inventory.items,
      });
    }

    for (const device of devices) {
      const state = cachedDeviceState.get(device.id);
      if (!state) continue;

      broadcastToOwner(ownerToken, {
        type: "owner.deviceState",
        deviceId: device.id,
        generatedAt: state.generatedAt,
        health: state.health,
        config: state.config,
      });
    }
  }

  async function dispatchPendingJobs(deviceId: string) {
    const deviceClient = deviceSockets.get(deviceId);
    if (!deviceClient) return;

    const claimed = await claimRelayJobsForDeviceId(db, {
      deviceId,
      maxJobs: 5,
    });

    for (const job of claimed.jobs) {
      safeSend(deviceClient.socket, {
        type: "relay.job",
        jobId: job.id,
        kind: job.kind,
        payload: job.payload,
        createdAt: job.createdAt.toISOString(),
      });

      broadcastToOwner(deviceClient.ownerToken, {
        type: "owner.jobUpdate",
        deviceId,
        jobId: job.id,
        status: "RUNNING",
        createdAt: job.createdAt.toISOString(),
      });
    }

    await broadcastOwnerSnapshot(deviceClient.ownerToken);
  }

  async function handleOwnerMessage(
    ownerToken: string,
    socket: WebSocket,
    message: string,
  ) {
    const payload = parseJson<OwnerRelayMessage>(message);
    if (!payload) {
      safeSend(socket, {
        type: "owner.error",
        message: "Invalid relay owner message.",
      });
      return;
    }

    if (payload.type === "owner.refresh") {
      await broadcastOwnerSnapshot(ownerToken);
      return;
    }

    const deviceClient = deviceSockets.get(payload.deviceId);
    if (deviceClient?.ownerToken !== ownerToken) {
      const inventory = cachedInventory.get(payload.deviceId);
      if (inventory) {
        safeSend(socket, {
          type: "owner.inventory",
          deviceId: payload.deviceId,
          generatedAt: inventory.generatedAt,
          items: inventory.items,
        });
        return;
      }

      // Polling-based desktop apps can be healthy without holding a live
      // relay WebSocket, so a missing inventory socket is not a connection
      // error. A future device inventory broadcast will fill this in.
      return;
    }

    safeSend(deviceClient.socket, {
      type: "relay.requestInventory",
    });
  }

  async function handleDeviceMessage(
    client: DeviceSocketClient,
    message: string,
  ) {
    const payload = parseJson<DeviceRelayMessage>(message);
    if (!payload) {
      return;
    }

    await touchRelayDevice(db, {
      deviceId: client.deviceId,
    });

    if (payload.type === "device.inventory") {
      const snapshot = {
        generatedAt: new Date().toISOString(),
        items: payload.items,
      } satisfies CachedRelayInventory;
      cachedInventory.set(client.deviceId, snapshot);
      broadcastToOwner(client.ownerToken, {
        type: "owner.inventory",
        deviceId: client.deviceId,
        generatedAt: snapshot.generatedAt,
        items: snapshot.items,
      });
      await broadcastOwnerSnapshot(client.ownerToken);
      return;
    }

    if (payload.type === "device.state") {
      const snapshot = {
        generatedAt: new Date().toISOString(),
        health: payload.health,
        config: payload.config,
      } satisfies CachedRelayDeviceState;
      cachedDeviceState.set(client.deviceId, snapshot);
      broadcastToOwner(client.ownerToken, {
        type: "owner.deviceState",
        deviceId: client.deviceId,
        generatedAt: snapshot.generatedAt,
        health: snapshot.health,
        config: snapshot.config,
      });
      await broadcastOwnerSnapshot(client.ownerToken);
      return;
    }

    await reportRelayJobResult(db, {
      deviceToken: client.deviceToken,
      jobId: payload.jobId,
      status: payload.status,
      resultPayload: payload.resultPayload ?? null,
      errorMessage: payload.errorMessage ?? null,
    });

    broadcastToOwner(client.ownerToken, {
      type: "owner.jobUpdate",
      deviceId: client.deviceId,
      jobId: payload.jobId,
      status: payload.status,
      finishedAt: new Date().toISOString(),
      errorMessage: payload.errorMessage ?? null,
    });

    await broadcastOwnerSnapshot(client.ownerToken);
    await dispatchPendingJobs(client.deviceId);
  }

  const httpServer = createServer((request, response) => {
    void (async () => {
      const requestUrl = new URL(
        request.url ?? "/",
        `http://${request.headers.host ?? `127.0.0.1:${env.ARCHIVE_SOCKET_PORT}`}`,
      );

      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type, authorization",
        });
        response.end();
        return;
      }

      if (requestUrl.pathname === "/health") {
        writeJson(response, 200, { ok: true });
        return;
      }

      if (
        request.method === "POST" &&
        requestUrl.pathname === "/relay/internal/dispatch"
      ) {
        const body = await readJsonBody(request).catch(() => null);
        const deviceId =
          typeof body?.deviceId === "string" ? body.deviceId : null;

        if (!deviceId) {
          writeJson(response, 400, { error: "deviceId is required." });
          return;
        }

        await dispatchPendingJobs(deviceId).catch(() => null);
        writeJson(response, 200, { ok: true });
        return;
      }

      if (
        request.method === "POST" &&
        requestUrl.pathname === "/relay/internal/disconnect"
      ) {
        const body = await readJsonBody(request).catch(() => null);
        const deviceId =
          typeof body?.deviceId === "string" ? body.deviceId : null;
        const reason =
          typeof body?.reason === "string" && body.reason.trim().length > 0
            ? body.reason
            : "Disconnected from the archive.";

        if (!deviceId) {
          writeJson(response, 400, { error: "deviceId is required." });
          return;
        }

        const client = deviceSockets.get(deviceId);
        if (client) {
          safeSend(client.socket, {
            type: "relay.forceDisconnect",
            reason,
          });
          client.socket.close(4001, reason);
          deviceSockets.delete(deviceId);
          await broadcastOwnerSnapshot(client.ownerToken);
        }

        writeJson(response, 200, { ok: true });
        return;
      }

      response.writeHead(404, {
        "content-type": "text/plain",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type, authorization",
      });
      response.end("Not found");
    })().catch((error) => {
      response.writeHead(500, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type, authorization",
      });
      response.end(
        JSON.stringify({
          error:
            error instanceof Error ? error.message : "Socket server error.",
        }),
      );
    });
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingInterval: 25_000,
    pingTimeout: 60_000,
    connectTimeout: 45_000,
  });

  const relayWss = new WebSocketServer({
    noServer: true,
    path: "/desktop-relay",
  });

  httpServer.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? `127.0.0.1:${env.ARCHIVE_SOCKET_PORT}`}`,
    );

    if (requestUrl.pathname !== "/desktop-relay") {
      return;
    }

    relayWss.handleUpgrade(request, socket, head, (ws) => {
      relayWss.emit("connection", ws, request);
    });
  });

  async function emitSnapshotToClient(socket: Socket) {
    try {
      const snapshot = await getArchiveLiveSnapshot(db);
      socket.emit("archive:snapshot", snapshot);
    } catch (error) {
      logSocketError(
        "Unable to load archive snapshot for a new client.",
        error,
      );
    }
  }

  async function broadcastArchiveUpdate(event: ArchiveLiveEvent) {
    try {
      const snapshot = await getArchiveLiveSnapshot(db);
      io.emit("archive:update", {
        event,
        snapshot,
      });
    } catch (error) {
      logSocketError("Unable to broadcast an archive update.", error);
    }
  }

  async function broadcastSnapshotHeartbeat() {
    if (io.engine.clientsCount === 0) return;
    try {
      const snapshot = await getArchiveLiveSnapshot(db);
      io.emit("archive:snapshot", snapshot);
    } catch (error) {
      logSocketError("Unable to broadcast snapshot heartbeat.", error);
    }
  }

  function startSnapshotHeartbeat() {
    const interval = setInterval(() => {
      void broadcastSnapshotHeartbeat();
    }, ARCHIVE_SNAPSHOT_HEARTBEAT_MS);

    return () => clearInterval(interval);
  }

  function startArchiveEventListener() {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let connecting = false;
    let stopListening: (() => Promise<void>) | null = null;

    const clearReconnectTimer = () => {
      if (!reconnectTimer) return;
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const scheduleReconnect = (reason: string, error?: Error) => {
      if (stopping || reconnectTimer || connecting) return;

      if (error) {
        logSocketError(reason, error);
      } else {
        console.warn(`[socket] ${reason}`);
      }

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, ARCHIVE_EVENT_RETRY_MS);
    };

    const connect = async () => {
      if (stopping || connecting) return;
      connecting = true;

      try {
        stopListening = await listenForArchiveEvents(
          (event) => {
            void broadcastArchiveUpdate(event);
          },
          {
            onDisconnect: (error) => {
              stopListening = null;
              scheduleReconnect(
                "Archive event listener lost its database connection; retrying.",
                error,
              );
            },
          },
        );
      } catch (error) {
        scheduleReconnect(
          "Archive event listener failed to start; retrying.",
          error instanceof Error ? error : new Error(String(error)),
        );
      } finally {
        connecting = false;
      }
    };

    void connect();

    return async () => {
      clearReconnectTimer();
      const currentStop = stopListening;
      stopListening = null;
      if (currentStop) {
        await currentStop().catch(() => undefined);
      }
    };
  }

  io.on("connection", (socket) => {
    void emitSnapshotToClient(socket);
  });

  relayWss.on("connection", (socket, request) => {
    void (async () => {
      const requestUrl = new URL(
        request.url ?? "/desktop-relay",
        `http://${request.headers.host ?? `127.0.0.1:${env.ARCHIVE_SOCKET_PORT}`}`,
      );
      const role = requestUrl.searchParams.get("role");

      if (role === "owner") {
        const ownerToken = requestUrl.searchParams.get("ownerToken")?.trim();
        if (!ownerToken || ownerToken.length < 16) {
          socket.close(4000, "ownerToken is required");
          return;
        }

        const sockets = ownerSockets.get(ownerToken) ?? new Set<WebSocket>();
        sockets.add(socket);
        ownerSockets.set(ownerToken, sockets);

        await broadcastOwnerSnapshot(ownerToken);

        socket.on("message", (buffer) => {
          const message = rawDataToString(buffer);
          void handleOwnerMessage(ownerToken, socket, message).catch(
            () => null,
          );
        });

        socket.on("close", () => {
          const current = ownerSockets.get(ownerToken);
          if (!current) return;
          current.delete(socket);
          if (current.size === 0) {
            ownerSockets.delete(ownerToken);
          }
        });

        return;
      }

      if (role === "device") {
        const deviceToken = requestUrl.searchParams.get("deviceToken")?.trim();
        if (!deviceToken || deviceToken.length < 16) {
          socket.close(4000, "deviceToken is required");
          return;
        }

        let device;
        try {
          device = await requireRelayDeviceByToken(db, deviceToken);
        } catch (error) {
          const existingDevice = await getRelayDeviceByToken(db, deviceToken);
          if (existingDevice && !existingDevice.relayEnabled) {
            safeSend(socket, {
              type: "relay.forceDisconnect",
              reason: "Disconnected from the archive site.",
            });
          }
          socket.close(
            4003,
            error instanceof Error
              ? error.message
              : "Desktop device authentication failed.",
          );
          return;
        }

        const client: DeviceSocketClient = {
          socket,
          ownerToken: device.ownerToken,
          deviceId: device.id,
          deviceLabel: device.deviceLabel,
          deviceToken,
        };

        deviceSockets.set(device.id, client);
        await touchRelayDevice(db, {
          deviceId: device.id,
        }).catch(() => null);

        safeSend(socket, {
          type: "relay.welcome",
          deviceId: device.id,
          deviceLabel: device.deviceLabel,
        });
        safeSend(socket, {
          type: "relay.requestInventory",
        });

        await broadcastOwnerSnapshot(device.ownerToken);
        await dispatchPendingJobs(device.id).catch(() => null);

        socket.on("message", (buffer) => {
          const message = rawDataToString(buffer);
          void handleDeviceMessage(client, message).catch(() => null);
        });

        socket.on("close", () => {
          const active = deviceSockets.get(device.id);
          if (active?.socket === socket) {
            deviceSockets.delete(device.id);
          }
          void broadcastOwnerSnapshot(device.ownerToken).catch(() => null);
        });

        return;
      }

      socket.close(4000, "Unsupported relay role");
    })().catch((error) => {
      console.error(error);
      socket.close(1011, "Relay connection failed.");
    });
  });

  const stopArchiveEventListener = startArchiveEventListener();
  const stopSnapshotHeartbeat = startSnapshotHeartbeat();

  const workerLoop = (async () => {
    for (;;) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- shutdown flips this from signal handlers outside the loop body.
      if (stopping) {
        return;
      }

      try {
        const pace = archivePaceConfigForContractsPerTick(
          (await getArchivePolicyState(db)).contractsPerTick,
        );
        const result = await runWorkerCycle(db, {
          workerKey: "socket-live-worker",
          label: "Archive socket worker",
          limit: pace.queueLimit,
          mode: "embedded",
        });

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- shutdown flips this from signal handlers outside the loop body.
        if (stopping) {
          return;
        }
        await sleep(result.hadActivity ? pace.busyDelayMs : pace.idleDelayMs);
      } catch {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- shutdown flips this from signal handlers outside the loop body.
        if (stopping) {
          return;
        }
        await sleep(15_000);
      }
    }
  })();

  await new Promise<void>((resolve, reject) => {
    const handleListenError = (error: NodeJS.ErrnoException) => {
      void (async () => {
        httpServer.off("error", handleListenError);

        if (
          error.code === "EADDRINUSE" &&
          (await checkExistingArchiveSocketServer(env.ARCHIVE_SOCKET_PORT))
        ) {
          console.log(
            `[socket] archive live server already running on http://127.0.0.1:${env.ARCHIVE_SOCKET_PORT}`,
          );
          resolve();
          return;
        }

        reject(error);
      })();
    };

    httpServer.once("error", handleListenError);
    httpServer.listen(env.ARCHIVE_SOCKET_PORT, () => {
      httpServer.off("error", handleListenError);
      console.log(
        `[socket] archive live server listening on http://127.0.0.1:${env.ARCHIVE_SOCKET_PORT}`,
      );
    });

    const shutdown = () => {
      void (async () => {
        stopping = true;
        stopSnapshotHeartbeat();
        await stopArchiveEventListener();
        await workerLoop.catch(() => null);
        await new Promise<void>((resolveIo) => {
          void io.close(() => resolveIo());
        });
        await new Promise<void>((resolveRelay) => {
          relayWss.close(() => resolveRelay());
        });
        httpServer.close(() => resolve());
      })();
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
