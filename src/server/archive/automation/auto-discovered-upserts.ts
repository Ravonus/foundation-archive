import { type FoundationDiscoveredContract } from "~/server/archive/foundation-api";
import { seedKnownContracts } from "~/server/archive/jobs";
import { KNOWN_CONTRACTS } from "~/server/archive/jobs/shared";

import {
  contractKindFromFoundationType,
  type DatabaseClient,
  type DiscoverySource,
  normalizeAddress,
} from "./types";

const CRAWLER_ELIGIBLE_SEED_CONFIG = new Map(
  KNOWN_CONTRACTS.filter((entry) => entry.seedCrawler).map((entry) => [
    `${entry.chainId}:${normalizeAddress(entry.address)}`,
    {
      blockWindowSize: entry.seedBlockWindowSize ?? 50000,
      scanFromBlock: entry.seedScanFromBlock ?? 0,
    },
  ]),
);

export async function ensureApiCrawlerForContract(
  client: DatabaseClient,
  input: {
    contractId: string;
  },
) {
  const existing = await client.contractCrawlerState.findUnique({
    where: { contractId: input.contractId },
    select: {
      scanMode: true,
    },
  });
  const switchingModes = existing?.scanMode !== "api";

  return client.contractCrawlerState.upsert({
    where: { contractId: input.contractId },
    create: {
      contractId: input.contractId,
      autoEnabled: true,
      scanMode: "api",
      scanFromBlock: 0,
      nextFromBlock: 0,
      blockWindowSize: 0,
      completed: false,
    },
    update: {
      autoEnabled: true,
      scanMode: "api",
      blockWindowSize: 0,
      ...(switchingModes
        ? {
            scanFromBlock: 0,
            nextFromBlock: 0,
            lastScannedBlock: null,
            completed: false,
            totalDiscoveredCount: 0,
            lastDiscoveredCount: 0,
            lastError: null,
          }
        : {}),
    },
  });
}

export async function ensureBlockCrawlerForContract(
  client: DatabaseClient,
  input: {
    contractId: string;
    scanFromBlock?: number;
    blockWindowSize?: number;
  },
) {
  const scanFromBlock = input.scanFromBlock ?? 0;
  const blockWindowSize = input.blockWindowSize ?? 50000;
  const existing = await client.contractCrawlerState.findUnique({
    where: { contractId: input.contractId },
    select: {
      scanMode: true,
    },
  });
  const switchingModes = existing?.scanMode !== "blocks";

  return client.contractCrawlerState.upsert({
    where: { contractId: input.contractId },
    create: {
      contractId: input.contractId,
      autoEnabled: true,
      scanMode: "blocks",
      scanFromBlock,
      nextFromBlock: scanFromBlock,
      blockWindowSize,
      completed: false,
    },
    update: {
      autoEnabled: true,
      scanMode: "blocks",
      blockWindowSize,
      ...(switchingModes
        ? {
            scanFromBlock,
            scanToBlock: null,
            nextFromBlock: scanFromBlock,
            lastScannedBlock: null,
            completed: false,
            totalDiscoveredCount: 0,
            lastDiscoveredCount: 0,
            lastRunStartedAt: null,
            lastRunFinishedAt: null,
            lastError: null,
          }
        : {}),
    },
  });
}

function buildUpsertNotes(source: DiscoverySource, query: string | null) {
  return source === "collections" && query
    ? `Auto-discovered from Foundation collections search "${query}".`
    : `Auto-discovered from Foundation ${source}.`;
}

export async function upsertAutoDiscoveredContract({
  client,
  input,
  source,
  query,
}: {
  client: DatabaseClient;
  input: FoundationDiscoveredContract;
  source: DiscoverySource;
  query: string | null;
}) {
  const address = normalizeAddress(input.contractAddress);
  const existing = await client.contractRegistry.findUnique({
    where: {
      chainId_address: {
        chainId: input.chainId,
        address,
      },
    },
  });

  const notes = buildUpsertNotes(source, query);

  const contract = await client.contractRegistry.upsert({
    where: {
      chainId_address: {
        chainId: input.chainId,
        address,
      },
    },
    create: {
      chainId: input.chainId,
      address,
      label: input.label,
      slug: input.slug ?? null,
      contractKind: contractKindFromFoundationType(
        input.foundationContractType,
      ),
      foundationContractType: input.foundationContractType,
      isFoundationNative: true,
      notes,
    },
    update: {
      label: input.label,
      slug: input.slug ?? undefined,
      contractKind: contractKindFromFoundationType(
        input.foundationContractType,
      ),
      foundationContractType: input.foundationContractType ?? undefined,
      isFoundationNative: true,
      notes,
    },
  });

  await ensureApiCrawlerForContract(client, {
    contractId: contract.id,
  });

  return {
    contract,
    created: !existing,
  };
}

export async function ensureAutoCrawlerContracts(client: DatabaseClient) {
  const seededContracts = await seedKnownContracts(client);

  for (const contract of seededContracts) {
    const key = `${contract.chainId}:${contract.address}`;
    const seedConfig = CRAWLER_ELIGIBLE_SEED_CONFIG.get(key);
    if (!seedConfig) continue;
    await ensureBlockCrawlerForContract(client, {
      contractId: contract.id,
      ...seedConfig,
    });
  }

  return seededContracts;
}
