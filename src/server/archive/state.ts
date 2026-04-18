import { env } from "~/env";
import {
  ARCHIVE_PACE_CONFIG,
  type ArchivePace,
} from "~/lib/archive-pace";
import type { PrismaClient } from "~/server/prisma-client";

type DatabaseClient = PrismaClient;

function coerceBoolean(value: boolean | string) {
  if (typeof value === "boolean") return value;
  return value === "true";
}

function coerceNumber(value: number | string) {
  if (typeof value === "number") return value;
  return Number(value);
}

export async function getArchivePolicyState(client: DatabaseClient) {
  return client.archivePolicyState.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      autoCrawlerEnabled: coerceBoolean(env.AUTO_CRAWLER_ENABLED),
      smartPinStartBytes: coerceNumber(env.SMART_PIN_START_BYTES),
      smartPinMaxBytes: coerceNumber(env.SMART_PIN_START_BYTES),
      smartPinCeilingBytes: coerceNumber(env.SMART_PIN_CEILING_BYTES),
      smartPinGrowthFactor: coerceNumber(env.SMART_PIN_GROWTH_FACTOR),
      smartPinDeferMs: coerceNumber(env.SMART_PIN_DEFER_MS),
      blockWindowSize: coerceNumber(env.AUTO_SCAN_BLOCK_WINDOW),
      contractsPerTick: coerceNumber(env.AUTO_SCAN_CONTRACTS_PER_TICK),
      discoverySource: "editions",
      discoveryPage: 0,
      discoveryQueryIndex: 0,
      discoveryPerPage: 24,
      totalDiscoveredContracts: 0,
    },
    update: {},
  });
}

export async function setArchiveAutoCrawlerEnabled(
  client: DatabaseClient,
  enabled: boolean,
) {
  await getArchivePolicyState(client);

  return client.archivePolicyState.update({
    where: { id: "global" },
    data: {
      autoCrawlerEnabled: enabled,
    },
  });
}

export async function setArchivePace(
  client: DatabaseClient,
  pace: ArchivePace,
) {
  await getArchivePolicyState(client);

  return client.archivePolicyState.update({
    where: { id: "global" },
    data: {
      contractsPerTick: ARCHIVE_PACE_CONFIG[pace].contractsPerTick,
    },
  });
}
