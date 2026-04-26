import { randomUUID } from "node:crypto";

import type { RelayPinInventoryItem } from "~/lib/desktop-relay";
import { Prisma, type PrismaClient } from "~/server/prisma-client";

type DbClient = PrismaClient;

type PinSyncRow = {
  id: string;
  cid: string;
  sourceKind: string | null;
  title: string | null;
};

export type RelayGatewayCandidate = {
  pinId: string;
  deviceId: string;
  hostname: string;
};

const BULK_INSERT_CHUNK_SIZE = 500;
const MAX_CANDIDATE_POOL = 24;
const MAX_GATEWAY_ATTEMPTS = 6;
const ROUTE_DEVICE_LIVE_WINDOW_MS = 2 * 60 * 1000;
const ROUTE_PIN_FRESH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 2 * 60 * 1000;

function normalizedCidsForItem(item: RelayPinInventoryItem) {
  return Array.from(
    new Set(
      [item.cid, item.mediaCid, item.metadataCid, ...item.relatedCids]
        .map((cid) => cid?.trim() ?? "")
        .filter(Boolean),
    ),
  );
}

function pinSyncRows(items: RelayPinInventoryItem[]) {
  const rows = new Map<string, PinSyncRow>();

  for (const item of items) {
    if (!item.pinned) continue;

    for (const cid of normalizedCidsForItem(item)) {
      if (rows.has(cid)) continue;
      rows.set(cid, {
        id: randomUUID(),
        cid,
        sourceKind: item.sourceKind,
        title: item.title ?? item.label,
      });
    }
  }

  return [...rows.values()];
}

function chunked<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function syncRelayDevicePinInventory(
  db: DbClient,
  input: {
    ownerToken: string;
    deviceId: string;
    items: RelayPinInventoryItem[];
  },
) {
  const rows = pinSyncRows(input.items);
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      DROP TABLE IF EXISTS "relay_device_pin_sync"
    `;
    await tx.$executeRaw`
      CREATE TEMP TABLE "relay_device_pin_sync" (
        "id" text NOT NULL,
        "cid" text PRIMARY KEY,
        "sourceKind" text,
        "title" text
      ) ON COMMIT DROP
    `;

    for (const chunk of chunked(rows, BULK_INSERT_CHUNK_SIZE)) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "relay_device_pin_sync" ("id", "cid", "sourceKind", "title")
        VALUES ${Prisma.join(
          chunk.map(
            (row) =>
              Prisma.sql`(${row.id}, ${row.cid}, ${row.sourceKind}, ${row.title})`,
          ),
        )}
        ON CONFLICT ("cid") DO NOTHING
      `);
    }

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "RelayDevicePin" (
        "id",
        "ownerToken",
        "deviceId",
        "cid",
        "pinned",
        "sourceKind",
        "title",
        "lastSeenAt",
        "createdAt",
        "updatedAt"
      )
      SELECT
        "id",
        ${input.ownerToken},
        ${input.deviceId},
        "cid",
        true,
        "sourceKind",
        "title",
        ${now},
        ${now},
        ${now}
      FROM "relay_device_pin_sync"
      ON CONFLICT ("deviceId", "cid") DO UPDATE SET
        "ownerToken" = EXCLUDED."ownerToken",
        "pinned" = true,
        "sourceKind" = COALESCE(EXCLUDED."sourceKind", "RelayDevicePin"."sourceKind"),
        "title" = COALESCE(EXCLUDED."title", "RelayDevicePin"."title"),
        "lastSeenAt" = EXCLUDED."lastSeenAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `);

    await tx.$executeRaw(Prisma.sql`
      UPDATE "RelayDevicePin"
      SET
        "pinned" = false,
        "updatedAt" = ${now}
      WHERE
        "deviceId" = ${input.deviceId}
        AND "pinned" = true
        AND NOT EXISTS (
          SELECT 1
          FROM "relay_device_pin_sync"
          WHERE "relay_device_pin_sync"."cid" = "RelayDevicePin"."cid"
        )
    `);
  });

  return {
    synced: rows.length,
  };
}

function routeScore(input: {
  nowMs: number;
  pinSeenAt: Date;
  deviceSeenAt: Date;
  lastSuccessAt: Date | null;
  failCount: number;
}) {
  const deviceFreshness =
    1 -
    Math.min(
      input.nowMs - input.deviceSeenAt.getTime(),
      ROUTE_DEVICE_LIVE_WINDOW_MS,
    ) /
      ROUTE_DEVICE_LIVE_WINDOW_MS;
  const pinFreshness =
    1 -
    Math.min(
      input.nowMs - input.pinSeenAt.getTime(),
      ROUTE_PIN_FRESH_WINDOW_MS,
    ) /
      ROUTE_PIN_FRESH_WINDOW_MS;
  const successBonus = input.lastSuccessAt ? 0.3 : 0;

  return (
    deviceFreshness * 5 +
    pinFreshness * 2 +
    successBonus -
    input.failCount * 1.5 +
    Math.random()
  );
}

export async function findRelayGatewayCandidates(
  db: DbClient,
  cid: string,
): Promise<RelayGatewayCandidate[]> {
  const now = new Date();
  const nowMs = now.getTime();
  const liveAfter = new Date(nowMs - ROUTE_DEVICE_LIVE_WINDOW_MS);
  const freshAfter = new Date(nowMs - ROUTE_PIN_FRESH_WINDOW_MS);
  const failedBefore = new Date(nowMs - FAILURE_COOLDOWN_MS);

  const pins = await db.relayDevicePin.findMany({
    where: {
      cid,
      pinned: true,
      lastSeenAt: {
        gte: freshAfter,
      },
      OR: [{ lastFailedAt: null }, { lastFailedAt: { lt: failedBefore } }],
      device: {
        relayEnabled: true,
        tunnelEnabled: true,
        tunnelHostname: {
          not: null,
        },
        lastSeenAt: {
          gte: liveAfter,
        },
      },
    },
    orderBy: [
      { failCount: "asc" },
      { lastSuccessAt: "desc" },
      { lastSeenAt: "desc" },
    ],
    take: MAX_CANDIDATE_POOL,
    select: {
      id: true,
      deviceId: true,
      failCount: true,
      lastSeenAt: true,
      lastSuccessAt: true,
      device: {
        select: {
          tunnelHostname: true,
          lastSeenAt: true,
        },
      },
    },
  });

  return pins
    .flatMap((pin) => {
      if (!pin.device.tunnelHostname || !pin.device.lastSeenAt) return [];
      return [
        {
          pinId: pin.id,
          deviceId: pin.deviceId,
          hostname: pin.device.tunnelHostname,
          score: routeScore({
            nowMs,
            pinSeenAt: pin.lastSeenAt,
            deviceSeenAt: pin.device.lastSeenAt,
            lastSuccessAt: pin.lastSuccessAt,
            failCount: pin.failCount,
          }),
        },
      ];
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_GATEWAY_ATTEMPTS)
    .map(({ score: _score, ...candidate }) => candidate);
}

export async function recordRelayGatewaySuccess(db: DbClient, pinId: string) {
  await db.relayDevicePin.update({
    where: { id: pinId },
    data: {
      failCount: 0,
      lastSuccessAt: new Date(),
    },
  });
}

export async function recordRelayGatewayFailure(db: DbClient, pinId: string) {
  await db.relayDevicePin.update({
    where: { id: pinId },
    data: {
      failCount: {
        increment: 1,
      },
      lastFailedAt: new Date(),
    },
  });
}

function safeHostname(hostname: string) {
  return /^[a-z0-9.-]+$/i.test(hostname) ? hostname : null;
}

export function buildRelayGatewayUrl(
  candidate: RelayGatewayCandidate,
  cid: string,
  segments: readonly string[],
) {
  const hostname = safeHostname(candidate.hostname);
  if (!hostname) return null;

  const suffix = segments
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const encodedCid = encodeURIComponent(cid);
  return `https://${hostname}/ipfs/${encodedCid}${suffix ? `/${suffix}` : ""}`;
}
