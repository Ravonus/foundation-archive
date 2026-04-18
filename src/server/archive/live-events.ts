import { Pool, type Notification } from "pg";

import type { ArchiveLiveArtworkCard, ArchiveLiveEvent } from "~/lib/archive-live";
import { env } from "~/env";
import type { PrismaClient } from "~/server/prisma-client";

const ARCHIVE_EVENT_CHANNEL = "archive_events";

type DatabaseClient = PrismaClient;

type ArchiveEventPayload = {
  artwork?: ArchiveLiveArtworkCard | null;
  contractAddress?: string | null;
  cid?: string | null;
  data?: Record<string, unknown>;
  sizeBytes?: number | null;
};

type ListenForArchiveEventsOptions = {
  onDisconnect?: (error?: Error) => void;
};

const globalForArchiveEvents = globalThis as typeof globalThis & {
  archiveEventPool?: Pool;
};

function getEventPool() {
  globalForArchiveEvents.archiveEventPool ??= new Pool({
    connectionString: env.DATABASE_URL,
  });

  return globalForArchiveEvents.archiveEventPool;
}

function parseArchiveEventPayload(
  payload: string,
): ArchiveEventPayload {
  try {
    return JSON.parse(payload) as ArchiveEventPayload;
  } catch {
    return {};
  }
}

export function hydrateArchiveEvent(record: {
  id: string;
  type: string;
  summary: string;
  payload: string;
  createdAt: Date;
}): ArchiveLiveEvent {
  const payload = parseArchiveEventPayload(record.payload);

  return {
    id: record.id,
    type: record.type,
    summary: record.summary,
    createdAt: record.createdAt.toISOString(),
    artwork: payload.artwork ?? null,
    contractAddress: payload.contractAddress ?? null,
    cid: payload.cid ?? null,
    sizeBytes: payload.sizeBytes ?? null,
    data: payload.data ?? {},
  };
}

export async function createArchiveEvent(
  client: DatabaseClient,
  input: {
    type: string;
    summary: string;
    artwork?: ArchiveLiveArtworkCard | null;
    contractAddress?: string | null;
    cid?: string | null;
    sizeBytes?: number | null;
    data?: Record<string, unknown>;
  },
) {
  const record = await client.archiveEvent.create({
    data: {
      type: input.type,
      summary: input.summary,
      payload: JSON.stringify({
        artwork: input.artwork ?? null,
        contractAddress: input.contractAddress ?? null,
        cid: input.cid ?? null,
        sizeBytes: input.sizeBytes ?? null,
        data: input.data ?? {},
      }),
    },
  });

  return hydrateArchiveEvent(record);
}

export async function publishArchiveEvent(event: ArchiveLiveEvent) {
  const pool = getEventPool();
  await pool.query("select pg_notify($1, $2)", [
    ARCHIVE_EVENT_CHANNEL,
    JSON.stringify(event),
  ]);
}

export async function emitArchiveEvent(
  client: DatabaseClient,
  input: Parameters<typeof createArchiveEvent>[1],
) {
  const event = await createArchiveEvent(client, input);
  await publishArchiveEvent(event);
  return event;
}

export async function readRecentArchiveEvents(
  client: DatabaseClient,
  limit = 18,
) {
  const records = await client.archiveEvent.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  return records.map((record) => hydrateArchiveEvent(record));
}

export async function listenForArchiveEvents(
  onEvent: (event: ArchiveLiveEvent) => void,
  options: ListenForArchiveEventsOptions = {},
) {
  const pool = getEventPool();
  const client = await pool.connect();
  let released = false;
  let disconnectNotified = false;

  const release = async () => {
    if (released) return;
    released = true;
    client.off("notification", handler);
    client.off("error", handleError);
    client.off("end", handleEnd);

    try {
      await client.query(`UNLISTEN ${ARCHIVE_EVENT_CHANNEL}`);
    } catch {
      // Ignore cleanup failures if the DB connection is already gone.
    }

    client.release();
  };

  const notifyDisconnect = (error?: Error) => {
    if (disconnectNotified) return;
    disconnectNotified = true;

    void release()
      .catch(() => undefined)
      .finally(() => {
        options.onDisconnect?.(error);
      });
  };

  await client.query(`LISTEN ${ARCHIVE_EVENT_CHANNEL}`);

  const handler = (notification: Notification) => {
    if (notification.channel !== ARCHIVE_EVENT_CHANNEL || !notification.payload) {
      return;
    }

    try {
      onEvent(JSON.parse(notification.payload) as ArchiveLiveEvent);
    } catch {
      // Ignore malformed events; the DB record is still the durable source.
    }
  };
  const handleError = (error: Error) => {
    notifyDisconnect(error);
  };
  const handleEnd = () => {
    notifyDisconnect();
  };

  client.on("notification", handler);
  client.on("error", handleError);
  client.on("end", handleEnd);

  return async () => {
    await release();
  };
}
