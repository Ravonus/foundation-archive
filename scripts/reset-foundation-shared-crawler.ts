import "dotenv/config";

import { seedKnownContracts } from "~/server/archive/jobs";
import {
  KNOWN_CONTRACTS,
  normalizeAddress,
} from "~/server/archive/jobs/shared";
import { setArchiveAutoCrawlerEnabled } from "~/server/archive/state";
import { db } from "~/server/db";

const SHARED_FND_CONTRACT = KNOWN_CONTRACTS.find(
  (contract) => contract.foundationContractType === "FND",
);

function usage() {
  return [
    "Usage: pnpm contracts:reset-shared-fnd [--dry-run] [--enable-auto] [--from-block <block>] [--block-window <blocks>]",
    "",
    "Resets only the shared Foundation FND ContractCrawlerState checkpoint.",
    "Archived artwork, IPFS roots, profile assets, and queue history are not deleted or rewritten.",
  ].join("\n");
}

function flagEnabled(name: string) {
  return process.argv.includes(name);
}

function argValue(name: string) {
  const equalsPrefix = `${name}=`;
  const equalsMatch = process.argv.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsMatch) return equalsMatch.slice(equalsPrefix.length);

  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;

  return process.argv[index + 1];
}

function numberArg(name: string, fallback: number) {
  const raw = argValue(name);
  if (raw === undefined) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return parsed;
}

function sharedContractConfig() {
  if (!SHARED_FND_CONTRACT) {
    throw new Error("Shared Foundation FND contract seed is missing.");
  }

  return {
    ...SHARED_FND_CONTRACT,
    address: normalizeAddress(SHARED_FND_CONTRACT.address),
    scanFromBlock: SHARED_FND_CONTRACT.seedScanFromBlock ?? 0,
    blockWindowSize: SHARED_FND_CONTRACT.seedBlockWindowSize ?? 50000,
  };
}

async function dryRun() {
  const config = sharedContractConfig();
  const contract = await db.contractRegistry.findUnique({
    where: {
      chainId_address: {
        chainId: config.chainId,
        address: config.address,
      },
    },
    include: {
      crawler: true,
    },
  });

  const artworkCount = await db.artwork.count({
    where: {
      chainId: config.chainId,
      contractAddress: config.address,
    },
  });

  return {
    dryRun: true,
    contractAddress: config.address,
    chainId: config.chainId,
    preservedArtworkCount: artworkCount,
    existingCrawler: contract?.crawler ?? null,
  };
}

async function resetCrawler(input: {
  enableAuto: boolean;
  scanFromBlock: number;
  blockWindowSize: number;
}) {
  const config = sharedContractConfig();
  const seededContracts = await seedKnownContracts(db);
  const contract = seededContracts.find(
    (entry) =>
      entry.chainId === config.chainId && entry.address === config.address,
  );

  if (!contract) {
    throw new Error(
      `Failed to seed shared Foundation FND contract ${config.address}.`,
    );
  }

  const artworkCount = await db.artwork.count({
    where: {
      chainId: contract.chainId,
      contractAddress: contract.address,
    },
  });

  const crawler = await db.contractCrawlerState.upsert({
    where: {
      contractId: contract.id,
    },
    create: {
      contractId: contract.id,
      autoEnabled: true,
      scanMode: "blocks",
      scanFromBlock: input.scanFromBlock,
      scanToBlock: null,
      nextFromBlock: input.scanFromBlock,
      lastScannedBlock: null,
      blockWindowSize: input.blockWindowSize,
      completed: false,
      totalDiscoveredCount: 0,
      lastDiscoveredCount: 0,
      lastRunStartedAt: null,
      lastRunFinishedAt: null,
      lastError: null,
    },
    update: {
      autoEnabled: true,
      scanMode: "blocks",
      scanFromBlock: input.scanFromBlock,
      scanToBlock: null,
      nextFromBlock: input.scanFromBlock,
      lastScannedBlock: null,
      blockWindowSize: input.blockWindowSize,
      completed: false,
      totalDiscoveredCount: 0,
      lastDiscoveredCount: 0,
      lastRunStartedAt: null,
      lastRunFinishedAt: null,
      lastError: null,
    },
  });

  const policy = input.enableAuto
    ? await setArchiveAutoCrawlerEnabled(db, true)
    : await db.archivePolicyState.findUnique({
        where: { id: "global" },
      });

  return {
    dryRun: false,
    contractAddress: contract.address,
    chainId: contract.chainId,
    scanMode: crawler.scanMode,
    scanFromBlock: crawler.scanFromBlock,
    nextFromBlock: crawler.nextFromBlock,
    blockWindowSize: crawler.blockWindowSize,
    completed: crawler.completed,
    autoEnabled: crawler.autoEnabled,
    globalAutoCrawlerEnabled: policy?.autoCrawlerEnabled ?? null,
    preservedArtworkCount: artworkCount,
  };
}

async function main() {
  if (flagEnabled("--help") || flagEnabled("-h")) {
    console.log(usage());
    return;
  }

  const config = sharedContractConfig();
  const dryRunEnabled = flagEnabled("--dry-run");
  const scanFromBlock = numberArg("--from-block", config.scanFromBlock);
  const blockWindowSize = numberArg("--block-window", config.blockWindowSize);

  const result = dryRunEnabled
    ? {
        ...(await dryRun()),
        plannedReset: {
          scanMode: "blocks",
          scanFromBlock,
          nextFromBlock: scanFromBlock,
          blockWindowSize,
          completed: false,
        },
      }
    : await resetCrawler({
        enableAuto: flagEnabled("--enable-auto"),
        scanFromBlock,
        blockWindowSize,
      });

  console.log(JSON.stringify(result, null, 2));
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
