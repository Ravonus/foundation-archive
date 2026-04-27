import {
  type ContractKind,
  QueueJobKind,
  RootKind,
} from "~/server/prisma-client";
import { slugify } from "~/lib/utils";
import { syncArtworkRootCidIndex } from "~/server/archive/cid-index";
import { emitArchiveEvent } from "~/server/archive/live-events";
import { type FoundationLookupWork } from "~/server/archive/foundation-api";
import { contractScanInputSchema } from "~/server/archive/schemas";
import {
  artworkNeedsBackup,
  artworkSlug,
  BACKUP_PRIORITY,
  contractKindFromFoundationType,
  CONTRACT_SCAN_PRIORITY,
  type DatabaseClient,
  deriveArtworkStatusFromRoot,
  dropRootlessArtworkIfPresent,
  KNOWN_CONTRACTS,
  loadArtworkLiveCard,
  normalizeAddress,
  searchTextForArtwork,
  selectArchivableIpfsUrl,
  upsertIpfsRoot,
} from "./shared";
import { queueArtworkBackup, queueJob } from "./queue";

type UpsertContractInput = {
  chainId?: number;
  address: string;
  label?: string | null;
  foundationContractType?: string | null;
  contractKind?: ContractKind;
  notes?: string | null;
  isFoundationNative?: boolean;
};

function buildContractKind(input: UpsertContractInput) {
  return (
    input.contractKind ??
    contractKindFromFoundationType(input.foundationContractType)
  );
}

export async function upsertContractEntry(
  client: DatabaseClient,
  input: UpsertContractInput,
) {
  const address = normalizeAddress(input.address);
  const contractKind = buildContractKind(input);
  const chainId = input.chainId ?? 1;

  return client.contractRegistry.upsert({
    where: {
      chainId_address: {
        chainId,
        address,
      },
    },
    create: {
      chainId,
      address,
      label: input.label ?? `Contract ${address.slice(0, 10)}`,
      slug: slugify(input.label ?? address),
      contractKind,
      foundationContractType: input.foundationContractType ?? null,
      notes: input.notes ?? null,
      isFoundationNative: input.isFoundationNative ?? false,
    },
    update: {
      label: input.label ?? undefined,
      slug: input.label ? slugify(input.label) : undefined,
      contractKind,
      foundationContractType: input.foundationContractType ?? undefined,
      notes: input.notes ?? undefined,
      isFoundationNative: input.isFoundationNative ?? undefined,
    },
  });
}

type DiscoveryInput = {
  backupPriority?: number;
  indexedFrom?: string;
  queueImmediately?: boolean;
};

function discoveryIndexedFrom(input: DiscoveryInput | undefined) {
  return input?.indexedFrom ?? "foundation-discovery";
}

function buildDiscoveryArtworkFields(args: {
  work: FoundationLookupWork;
  contractAddress: string;
  metadataUrl: string | null;
  sourceUrl: string | null;
  metadataStatus: ReturnType<typeof deriveArtworkStatusFromRoot>;
  mediaStatus: ReturnType<typeof deriveArtworkStatusFromRoot>;
  indexedFrom: string;
  contractId: string;
  metadataRootId: string | undefined;
  mediaRootId: string | undefined;
}) {
  const { work, contractAddress } = args;
  return {
    foundationUrl: work.foundationUrl,
    title: work.title,
    description: work.description,
    artistName: work.artistName,
    artistUsername: work.artistUsername,
    artistWallet: work.artistWallet?.toLowerCase() ?? null,
    ownerName: work.ownerName,
    ownerUsername: work.ownerUsername,
    ownerWallet: work.ownerWallet?.toLowerCase() ?? null,
    collectionName: work.collectionName,
    collectionSlug: work.collectionSlug,
    tokenStandard: "ERC-721",
    foundationContractType: work.foundationContractType,
    mediaKind: work.mediaKind,
    metadataUrl: args.metadataUrl,
    sourceUrl: args.sourceUrl,
    previewUrl: work.previewUrl,
    staticPreviewUrl: work.staticPreviewUrl,
    metadataStatus: args.metadataStatus,
    mediaStatus: args.mediaStatus,
    indexedFrom: args.indexedFrom,
    searchText: searchTextForArtwork({
      title: work.title,
      artistName: work.artistName,
      artistUsername: work.artistUsername,
      collectionName: work.collectionName,
      contractAddress,
      tokenId: work.tokenId,
    }),
    contractId: args.contractId,
    metadataRootId: args.metadataRootId,
    mediaRootId: args.mediaRootId,
    lastIndexedAt: new Date(),
  };
}

type DiscoveryRoots = {
  metadataUrl: string | null;
  sourceUrl: string | null;
  metadataRoot: Awaited<ReturnType<typeof upsertIpfsRoot>>;
  mediaRoot: Awaited<ReturnType<typeof upsertIpfsRoot>>;
};

async function resolveDiscoveryRoots(
  client: DatabaseClient,
  work: FoundationLookupWork,
): Promise<DiscoveryRoots> {
  const metadataUrl = selectArchivableIpfsUrl(RootKind.METADATA, [
    work.metadataUrl,
  ]);
  const sourceUrl = selectArchivableIpfsUrl(RootKind.MEDIA, [
    work.sourceUrl,
    work.mediaUrl,
  ]);
  const metadataRoot = await upsertIpfsRoot(
    client,
    metadataUrl,
    RootKind.METADATA,
  );
  const mediaRoot = await upsertIpfsRoot(client, sourceUrl, RootKind.MEDIA);

  return { metadataUrl, sourceUrl, metadataRoot, mediaRoot };
}

type ExistingArtworkRef = {
  id: string;
  metadataRootId: string | null;
  mediaRootId: string | null;
} | null;

function hasNewlyTrackedRoots(
  existing: ExistingArtworkRef,
  roots: Pick<DiscoveryRoots, "metadataRoot" | "mediaRoot">,
) {
  return (
    !existing ||
    (!existing.metadataRootId && Boolean(roots.metadataRoot)) ||
    (!existing.mediaRootId && Boolean(roots.mediaRoot))
  );
}

async function persistDiscoveryArtwork(args: {
  client: DatabaseClient;
  work: FoundationLookupWork;
  contractAddress: string;
  contractId: string;
  roots: DiscoveryRoots;
  input: DiscoveryInput | undefined;
}) {
  const { client, work, contractAddress, contractId, roots, input } = args;
  const fields = buildDiscoveryArtworkFields({
    work,
    contractAddress,
    metadataUrl: roots.metadataUrl,
    sourceUrl: roots.sourceUrl,
    metadataStatus: deriveArtworkStatusFromRoot(roots.metadataRoot),
    mediaStatus: deriveArtworkStatusFromRoot(roots.mediaRoot),
    indexedFrom: discoveryIndexedFrom(input),
    contractId,
    metadataRootId: roots.metadataRoot?.id,
    mediaRootId: roots.mediaRoot?.id,
  });

  return client.artwork.upsert({
    where: {
      chainId_contractAddress_tokenId: {
        chainId: work.chainId,
        contractAddress,
        tokenId: work.tokenId,
      },
    },
    create: {
      chainId: work.chainId,
      contractAddress,
      tokenId: work.tokenId,
      slug: artworkSlug(work.title, contractAddress, work.tokenId),
      ...fields,
    },
    update: fields,
  });
}

export async function upsertDiscoveredFoundationWork(
  client: DatabaseClient,
  work: FoundationLookupWork,
  input?: DiscoveryInput,
) {
  const contractAddress = normalizeAddress(work.contractAddress);
  const roots = await resolveDiscoveryRoots(client, work);

  if (!roots.metadataUrl && !roots.sourceUrl) {
    await dropRootlessArtworkIfPresent(client, {
      chainId: work.chainId,
      contractAddress,
      tokenId: work.tokenId,
    });

    return null;
  }

  const existing = await client.artwork.findUnique({
    where: {
      chainId_contractAddress_tokenId: {
        chainId: work.chainId,
        contractAddress,
        tokenId: work.tokenId,
      },
    },
    select: {
      id: true,
      metadataRootId: true,
      mediaRootId: true,
    },
  });

  const contract = await upsertContractEntry(client, {
    chainId: work.chainId,
    address: contractAddress,
    label: work.collectionName ?? work.title,
    foundationContractType: work.foundationContractType,
    isFoundationNative: Boolean(work.foundationContractType?.startsWith("FND")),
  });

  const artwork = await persistDiscoveryArtwork({
    client,
    work,
    contractAddress,
    contractId: contract.id,
    roots,
    input,
  });
  await syncArtworkRootCidIndex(client, artwork.id);

  if (hasNewlyTrackedRoots(existing, roots)) {
    await emitArchiveEvent(client, {
      type: "artwork.ingested",
      summary: `Indexed ${artwork.title} from Foundation discovery.`,
      artwork: await loadArtworkLiveCard(client, artwork.id),
      contractAddress,
      data: {
        indexedFrom: discoveryIndexedFrom(input),
        foundationUrl: work.foundationUrl,
      },
    });
  }

  if (
    artworkNeedsBackup({
      metadataRoot: roots.metadataRoot,
      mediaRoot: roots.mediaRoot,
    }) &&
    input?.queueImmediately !== false
  ) {
    await queueArtworkBackup({
      client,
      artworkId: artwork.id,
      priority: input?.backupPriority ?? BACKUP_PRIORITY,
    });
  }

  return artwork;
}

export async function persistDiscoveredFoundationWorks(
  client: DatabaseClient,
  works: FoundationLookupWork[],
  input?: DiscoveryInput,
) {
  let trackedCount = 0;
  let createdCount = 0;

  for (const work of works) {
    const existing = await client.artwork.findUnique({
      where: {
        chainId_contractAddress_tokenId: {
          chainId: work.chainId,
          contractAddress: normalizeAddress(work.contractAddress),
          tokenId: work.tokenId,
        },
      },
      select: {
        id: true,
      },
    });

    const artwork = await upsertDiscoveredFoundationWork(client, work, input);
    if (!artwork) continue;

    trackedCount += 1;
    if (!existing) {
      createdCount += 1;
    }
  }

  return {
    trackedCount,
    createdCount,
  };
}

export async function seedKnownContracts(client: DatabaseClient) {
  const results = [];

  for (const contract of KNOWN_CONTRACTS) {
    const {
      seedCrawler: _seedCrawler,
      seedScanFromBlock: _seedScanFromBlock,
      seedBlockWindowSize: _seedBlockWindowSize,
      ...upsertInput
    } = contract;
    results.push(await upsertContractEntry(client, upsertInput));
  }

  return results;
}

function scanNotes(input: {
  fromBlock?: number;
  startTokenId?: number;
  endTokenId?: number;
}) {
  if (typeof input.fromBlock === "number") {
    return `Scan requested from block ${input.fromBlock}`;
  }
  if (input.startTokenId !== undefined && input.endTokenId !== undefined) {
    return `Token range requested: ${input.startTokenId}-${input.endTokenId}`;
  }
  return null;
}

export async function enqueueContractScan(
  client: DatabaseClient,
  rawInput: unknown,
) {
  const input = contractScanInputSchema.parse(rawInput);
  const normalizedAddress = normalizeAddress(input.contractAddress);

  await upsertContractEntry(client, {
    chainId: input.chainId,
    address: normalizedAddress,
    label: input.label ?? null,
    foundationContractType: input.foundationContractType ?? null,
    notes: scanNotes(input),
  });

  return queueJob(client, {
    kind: QueueJobKind.SCAN_CONTRACT_TOKENS,
    payload: {
      ...input,
      contractAddress: normalizedAddress,
    },
    dedupeKey: `${input.chainId}:${normalizedAddress}:${input.fromBlock ?? "range"}:${input.startTokenId ?? "na"}:${input.endTokenId ?? "na"}`,
    priority: CONTRACT_SCAN_PRIORITY,
  });
}
