import {
  BackupStatus,
  ContractKind,
  PinProvider,
  type PrismaClient,
  QueueJobKind,
  QueueJobStatus,
  type RootKind,
} from "~/server/prisma-client";
import { env } from "~/env";
import { slugify } from "~/lib/utils";
import { toLiveArtworkCard } from "~/server/archive/dashboard";
import { firstIpfsReference, parseIpfsReference } from "~/server/archive/ipfs";
import { getAddress } from "viem";

export type DatabaseClient = PrismaClient;

export const PUBLIC_QUEUE_PRIORITY = 20;
export const FOUNDATION_URL_PRIORITY = 10;
export const CONTRACT_TOKEN_PRIORITY = 9;
export const BACKUP_PRIORITY = 8;
export const CONTRACT_SCAN_PRIORITY = 5;
export const FAILED_ROOT_RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export function archivePinningEnabled() {
  return Boolean(env.KUBO_API_URL);
}

export type KnownContractSeed = {
  chainId: number;
  address: string;
  label: string;
  contractKind: ContractKind;
  foundationContractType: string | null;
  isFoundationNative: boolean;
  notes: string;
  seedCrawler: boolean;
  seedScanFromBlock?: number;
  seedBlockWindowSize?: number;
};

export const KNOWN_CONTRACTS: KnownContractSeed[] = [
  {
    chainId: 1,
    address: "0x3b3ee1931dc30c1957379fac9aba94d1c48a5405",
    label: "Ethereum Mainnet · Foundation NFT (FND)",
    contractKind: ContractKind.FOUNDATION_GENESIS,
    foundationContractType: "FND",
    isFoundationNative: true,
    notes:
      "Shared Foundation ERC-721 for legacy 1/1 mints on Ethereum mainnet. Good starting point for historical 1/1 scans.",
    seedCrawler: true,
    seedScanFromBlock: 11694715,
    seedBlockWindowSize: 50000,
  },
  {
    chainId: 1,
    address: "0xcda72070e455bb31c7690a170224ce43623d0b6f",
    label: "Ethereum Mainnet · Foundation NFT Market",
    contractKind: ContractKind.IMPORTED,
    foundationContractType: null,
    isFoundationNative: true,
    notes:
      "Foundation's reserve-auction market on Ethereum mainnet. Platform anchor — not a token contract.",
    seedCrawler: false,
  },
  {
    chainId: 1,
    address: "0x53f451165ba6fdbe39a134673d13948261b2334a",
    label: "Ethereum Mainnet · Foundation NFT Drop Market",
    contractKind: ContractKind.IMPORTED,
    foundationContractType: null,
    isFoundationNative: true,
    notes:
      "Foundation's drop mint contract on Ethereum mainnet. Platform anchor — not a token contract.",
    seedCrawler: false,
  },
  {
    chainId: 1,
    address: "0x612e2daddc89d91409e40f946f9f7cfe422e777e",
    label: "Ethereum Mainnet · Foundation NFT Collection Factory V2",
    contractKind: ContractKind.IMPORTED,
    foundationContractType: null,
    isFoundationNative: true,
    notes:
      "Foundation's per-creator collection factory on Ethereum mainnet. Deploys ERC-1167 proxies for new drops.",
    seedCrawler: false,
  },
  {
    chainId: 8453,
    address: "0x7b503e206db34148ad77e00afe214034edf9e3ff",
    label: "Base · Foundation NFT Market",
    contractKind: ContractKind.IMPORTED,
    foundationContractType: null,
    isFoundationNative: true,
    notes:
      "Foundation's reserve-auction market on Base (chain 8453). Platform anchor — not a token contract.",
    seedCrawler: false,
  },
  {
    chainId: 8453,
    address: "0x62037b26fff91929655aa3a060f327b47d1e2b3e",
    label: "Base · Foundation NFT Drop Market",
    contractKind: ContractKind.IMPORTED,
    foundationContractType: null,
    isFoundationNative: true,
    notes:
      "Foundation's drop mint contract on Base (chain 8453). Platform anchor — not a token contract.",
    seedCrawler: false,
  },
  {
    chainId: 8453,
    address: "0xf1814213a5ef856aaa1fdb0f7f375569168d8e73",
    label: "Base · Foundation NFT Collection Factory V2",
    contractKind: ContractKind.IMPORTED,
    foundationContractType: null,
    isFoundationNative: true,
    notes:
      "Foundation's per-creator collection factory on Base (chain 8453). Deploys ERC-1167 proxies for new drops.",
    seedCrawler: false,
  },
];

export function normalizeAddress(address: string) {
  return getAddress(address).toLowerCase();
}

export function contractKindFromFoundationType(
  input: string | null | undefined,
) {
  const value = (input ?? "").toUpperCase();

  if (value === "FND") return ContractKind.FOUNDATION_GENESIS;
  if (
    value === "FND_COLLECTION" ||
    value === "LIMITED_EDITION" ||
    value === "FND_BATCH_MINT_REVEAL"
  ) {
    return ContractKind.FOUNDATION_COLLECTION;
  }
  if (value) return ContractKind.IMPORTED;

  return ContractKind.UNKNOWN;
}

export function artworkSlug(
  title: string,
  contractAddress: string,
  tokenId: string,
) {
  const stem = slugify(title) || "untitled";
  return `${stem}-${contractAddress.slice(2, 8)}-${tokenId}`;
}

export function searchTextForArtwork(input: {
  title: string;
  artistName?: string | null;
  artistUsername?: string | null;
  collectionName?: string | null;
  contractAddress: string;
  tokenId: string;
}) {
  return [
    input.title,
    input.artistName,
    input.artistUsername,
    input.collectionName,
    input.contractAddress,
    input.tokenId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function shouldBypassSmartBudget(priority: number) {
  return priority >= PUBLIC_QUEUE_PRIORITY;
}

export function selectArchivableIpfsUrl(
  kind: RootKind,
  urls: Array<string | null | undefined>,
) {
  return firstIpfsReference(kind, urls)?.originalUrl ?? null;
}

export async function loadArtworkLiveCard(
  client: DatabaseClient,
  artworkId: string,
) {
  const artwork = await client.artwork.findUnique({
    where: { id: artworkId },
    select: {
      id: true,
      slug: true,
      title: true,
      artistName: true,
      artistUsername: true,
      artistWallet: true,
      mediaKind: true,
      sourceUrl: true,
      staticPreviewUrl: true,
      previewUrl: true,
      foundationUrl: true,
      contractAddress: true,
      tokenId: true,
      mediaStatus: true,
      metadataRoot: {
        select: {
          cid: true,
        },
      },
      mediaRoot: {
        select: {
          cid: true,
          relativePath: true,
          gatewayUrl: true,
        },
      },
    },
  });

  return toLiveArtworkCard(artwork);
}

export function deriveArtworkStatusFromRoot(
  root: {
    backupStatus: BackupStatus;
    pinStatus: BackupStatus;
  } | null,
) {
  if (!root) return BackupStatus.SKIPPED;
  if (root.pinStatus === BackupStatus.PINNED) return BackupStatus.PINNED;
  if (root.backupStatus === BackupStatus.DOWNLOADED) {
    return BackupStatus.DOWNLOADED;
  }
  if (
    root.backupStatus === BackupStatus.FAILED ||
    root.pinStatus === BackupStatus.FAILED
  ) {
    return BackupStatus.FAILED;
  }
  if (
    root.backupStatus === BackupStatus.SKIPPED &&
    root.pinStatus === BackupStatus.SKIPPED
  ) {
    return BackupStatus.SKIPPED;
  }
  return BackupStatus.PENDING;
}

export function artworkNeedsBackup(input: {
  metadataRoot: {
    backupStatus: BackupStatus;
    pinStatus: BackupStatus;
  } | null;
  mediaRoot: {
    backupStatus: BackupStatus;
    pinStatus: BackupStatus;
  } | null;
}) {
  const needsRootBackup = (
    root: {
      backupStatus: BackupStatus;
      pinStatus: BackupStatus;
    } | null,
  ) => {
    if (!root) return false;
    if (root.pinStatus === BackupStatus.PINNED) return false;
    if (root.backupStatus === BackupStatus.DOWNLOADED) {
      return archivePinningEnabled();
    }
    return true;
  };

  return (
    needsRootBackup(input.metadataRoot) || needsRootBackup(input.mediaRoot)
  );
}

export async function dropRootlessArtworkIfPresent(
  client: DatabaseClient,
  input: {
    chainId: number;
    contractAddress: string;
    tokenId: string;
  },
) {
  const rootlessArtworks = await client.artwork.findMany({
    where: {
      chainId: input.chainId,
      contractAddress: input.contractAddress,
      tokenId: input.tokenId,
      metadataRootId: null,
      mediaRootId: null,
    },
    select: {
      id: true,
    },
  });

  if (rootlessArtworks.length === 0) {
    return;
  }

  await client.queueJob.deleteMany({
    where: {
      kind: QueueJobKind.BACKUP_ARTWORK,
      status: QueueJobStatus.PENDING,
      dedupeKey: {
        in: rootlessArtworks.map((artwork) => artwork.id),
      },
    },
  });

  await client.artwork.deleteMany({
    where: {
      id: {
        in: rootlessArtworks.map((artwork) => artwork.id),
      },
    },
  });
}

export async function syncArtworkStatuses(
  client: DatabaseClient,
  artworkId: string,
) {
  const artwork = await client.artwork.findUnique({
    where: { id: artworkId },
    include: {
      metadataRoot: true,
      mediaRoot: true,
    },
  });

  if (!artwork) return null;

  return client.artwork.update({
    where: { id: artworkId },
    data: {
      metadataStatus: deriveArtworkStatusFromRoot(artwork.metadataRoot),
      mediaStatus: deriveArtworkStatusFromRoot(artwork.mediaRoot),
    },
  });
}

function artworkHasSatisfiedRoots(artwork: {
  metadataRoot: { backupStatus: BackupStatus; pinStatus: BackupStatus } | null;
  mediaRoot: { backupStatus: BackupStatus; pinStatus: BackupStatus } | null;
}) {
  const metadataStatus = deriveArtworkStatusFromRoot(artwork.metadataRoot);
  const mediaStatus = deriveArtworkStatusFromRoot(artwork.mediaRoot);
  const downloadedCountsAsSatisfied = !archivePinningEnabled();

  const metadataSatisfied =
    metadataStatus === BackupStatus.PINNED ||
    metadataStatus === BackupStatus.SKIPPED ||
    (downloadedCountsAsSatisfied && metadataStatus === BackupStatus.DOWNLOADED);
  const mediaSatisfied =
    mediaStatus === BackupStatus.PINNED ||
    mediaStatus === BackupStatus.SKIPPED ||
    (downloadedCountsAsSatisfied && mediaStatus === BackupStatus.DOWNLOADED);

  return {
    metadataStatus,
    mediaStatus,
    satisfied: metadataSatisfied && mediaSatisfied,
  };
}

export async function syncArtworksForRoot(
  client: DatabaseClient,
  rootId: string,
) {
  const artworks = await client.artwork.findMany({
    where: {
      OR: [{ metadataRootId: rootId }, { mediaRootId: rootId }],
    },
    include: {
      metadataRoot: true,
      mediaRoot: true,
    },
  });

  if (artworks.length === 0) {
    return [];
  }

  const satisfiedArtworkIds: string[] = [];

  for (const artwork of artworks) {
    const { metadataStatus, mediaStatus, satisfied } =
      artworkHasSatisfiedRoots(artwork);

    await client.artwork.update({
      where: { id: artwork.id },
      data: {
        metadataStatus,
        mediaStatus,
      },
    });

    if (satisfied) {
      satisfiedArtworkIds.push(artwork.id);
    }
  }

  if (satisfiedArtworkIds.length > 0) {
    await client.queueJob.deleteMany({
      where: {
        kind: QueueJobKind.BACKUP_ARTWORK,
        status: QueueJobStatus.PENDING,
        dedupeKey: {
          in: satisfiedArtworkIds,
        },
      },
    });
  }

  return satisfiedArtworkIds;
}

export function isPinned(status: BackupStatus) {
  return status === BackupStatus.PINNED;
}

export function isArchived(status: BackupStatus) {
  return status === BackupStatus.DOWNLOADED || status === BackupStatus.PINNED;
}

export async function upsertIpfsRoot(
  client: DatabaseClient,
  url: string | null | undefined,
  kind: RootKind,
) {
  if (!url) return null;

  const parsed = parseIpfsReference(url, kind);
  if (!parsed) return null;

  return client.ipfsRoot.upsert({
    where: {
      cid: parsed.cid,
    },
    create: {
      cid: parsed.cid,
      cidVersion: parsed.cidVersion,
      kind,
      originalUrl: parsed.originalUrl,
      gatewayUrl: parsed.gatewayUrl,
      relativePath: parsed.relativePath,
      fileName: parsed.fileName,
    },
    update: {
      kind,
      originalUrl: parsed.originalUrl,
      gatewayUrl: parsed.gatewayUrl,
      relativePath: parsed.relativePath,
      fileName: parsed.fileName,
    },
  });
}

export async function recordBackupRun(
  client: DatabaseClient,
  input: {
    artworkId: string;
    rootId: string;
    action: string;
    status: BackupStatus;
    provider?: PinProvider;
    notes?: string | null;
    responsePayload?: string | null;
    errorMessage?: string | null;
    startedAt?: Date;
    finishedAt?: Date;
  },
) {
  return client.backupRun.create({
    data: {
      artworkId: input.artworkId,
      rootId: input.rootId,
      action: input.action,
      status: input.status,
      provider: input.provider ?? PinProvider.NONE,
      notes: input.notes ?? null,
      responsePayload: input.responsePayload ?? null,
      errorMessage: input.errorMessage ?? null,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
    },
  });
}
