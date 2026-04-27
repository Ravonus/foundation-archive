import { BackupStatus, RootKind } from "~/server/prisma-client";
import { emitArchiveEvent } from "~/server/archive/live-events";
import {
  buildFoundationMintUrl,
  tryFetchFoundationMintByUrl,
} from "~/server/archive/foundation";
import { foundationLiveLookupsEnabled } from "~/server/archive/foundation-live";
import { fetchTokenMetadata } from "~/server/archive/metadata";
import {
  artworkSlug,
  BACKUP_PRIORITY,
  type DatabaseClient,
  dropRootlessArtworkIfPresent,
  loadArtworkLiveCard,
  normalizeAddress,
  searchTextForArtwork,
  selectArchivableIpfsUrl,
  upsertIpfsRoot,
} from "./shared";
import { queueArtworkBackup } from "./queue";
import { upsertContractEntry } from "./contract-upserts";
import {
  resolveTokenCreatorFromContract,
  resolveTokenUriFromContract,
} from "./ethereum-rpc";
import { ingestFoundationMintUrl } from "./ingest-foundation";

type FoundationMintMaybe = Awaited<
  ReturnType<typeof tryFetchFoundationMintByUrl>
>;
type TokenMetadata = Awaited<ReturnType<typeof fetchTokenMetadata>>;

export type ContractTokenInput = {
  chainId?: number;
  contractAddress: string;
  tokenId: string;
  backupPriority?: number;
};

type ContractTokenContext = {
  chainId: number;
  contractAddress: string;
  tokenId: string;
  foundationUrl: string | null;
  tokenUri: string;
  metadata: TokenMetadata;
  foundationToken: FoundationMintMaybe;
  contractCreatorWallet: string | null;
};

type ContractTokenRoots = {
  metadataUrl: string | null;
  sourceUrl: string | null;
  metadataRoot: Awaited<ReturnType<typeof upsertIpfsRoot>>;
  mediaRoot: Awaited<ReturnType<typeof upsertIpfsRoot>>;
};

async function fetchContractTokenContext(
  input: ContractTokenInput,
): Promise<ContractTokenContext> {
  const chainId = input.chainId ?? 1;
  const contractAddress = normalizeAddress(input.contractAddress);
  const foundationUrl = buildFoundationMintUrl(
    contractAddress,
    input.tokenId,
    chainId,
  );
  const [tokenUri, contractCreatorWallet] = await Promise.all([
    resolveTokenUriFromContract({
      chainId,
      contractAddress,
      tokenId: input.tokenId,
    }),
    resolveTokenCreatorFromContract({
      chainId,
      contractAddress,
      tokenId: input.tokenId,
    }),
  ]);
  const metadata = await fetchTokenMetadata(tokenUri);
  const foundationToken = foundationUrl
    ? await tryFetchFoundationMintByUrl(foundationUrl)
    : null;

  return {
    chainId,
    contractAddress,
    tokenId: input.tokenId,
    foundationUrl,
    tokenUri,
    metadata,
    foundationToken,
    contractCreatorWallet,
  };
}

async function upsertContractForToken(
  client: DatabaseClient,
  context: ContractTokenContext,
) {
  return upsertContractEntry(client, {
    chainId: context.chainId,
    address: context.contractAddress,
    label:
      context.foundationToken?.collectionName ??
      context.foundationToken?.title ??
      context.metadata.title ??
      `Contract ${context.contractAddress.slice(0, 10)}`,
    foundationContractType:
      context.foundationToken?.foundationContractType ?? null,
    isFoundationNative: Boolean(
      context.foundationToken?.foundationContractType?.startsWith("FND"),
    ),
  });
}

async function resolveContractTokenRoots(
  client: DatabaseClient,
  context: ContractTokenContext,
): Promise<ContractTokenRoots> {
  const metadataRoot = await upsertIpfsRoot(
    client,
    selectArchivableIpfsUrl(RootKind.METADATA, [
      context.tokenUri,
      context.foundationToken?.metadataUrl,
    ]),
    RootKind.METADATA,
  );
  const sourceUrl = selectArchivableIpfsUrl(RootKind.MEDIA, [
    context.foundationToken?.sourceUrl,
    context.foundationToken?.mediaUrl,
    context.metadata.mediaUrl,
  ]);
  const mediaRoot = await upsertIpfsRoot(client, sourceUrl, RootKind.MEDIA);
  const metadataUrl = metadataRoot?.originalUrl ?? null;

  return { metadataUrl, sourceUrl, metadataRoot, mediaRoot };
}

async function emitContractTokenSkipped(args: {
  client: DatabaseClient;
  context: ContractTokenContext;
}) {
  const { client, context } = args;
  await dropRootlessArtworkIfPresent(client, {
    chainId: context.chainId,
    contractAddress: context.contractAddress,
    tokenId: context.tokenId,
  });

  await emitArchiveEvent(client, {
    type: "artwork.skipped-non-ipfs",
    summary: `Skipped ${context.foundationToken?.title ?? context.metadata.title ?? `Token ${context.tokenId}`}: no IPFS metadata or media root was found.`,
    contractAddress: context.contractAddress,
    data: {
      chainId: context.chainId,
      foundationUrl: context.foundationUrl,
      tokenId: context.tokenId,
    },
  });
}

function contractTokenTitle(context: ContractTokenContext) {
  return (
    context.foundationToken?.title ??
    context.metadata.title ??
    `Token ${context.tokenId}`
  );
}

function contractTokenIndexedFrom(context: ContractTokenContext) {
  return context.foundationToken
    ? "contract-rpc+foundation-page"
    : "contract-rpc";
}

function resolvedArtistWallet(context: ContractTokenContext) {
  return (
    context.foundationToken?.artistWallet?.toLowerCase() ??
    context.contractCreatorWallet
  );
}

function buildArtistAttribution(context: ContractTokenContext) {
  return {
    artistName: context.foundationToken?.artistName ?? null,
    artistUsername: context.foundationToken?.artistUsername ?? null,
    artistWallet: resolvedArtistWallet(context),
  };
}

function buildOwnerAttribution(ft: FoundationMintMaybe) {
  return {
    ownerName: ft?.ownerName ?? null,
    ownerUsername: ft?.ownerUsername ?? null,
    ownerWallet: ft?.ownerWallet?.toLowerCase() ?? null,
  };
}

function buildCollectionAttribution(ft: FoundationMintMaybe) {
  return {
    collectionName: ft?.collectionName ?? null,
    collectionSlug: ft?.collectionSlug ?? null,
    foundationContractType: ft?.foundationContractType ?? null,
  };
}

function buildMediaAttribution(context: ContractTokenContext) {
  const { foundationToken: ft, metadata } = context;
  return {
    description: ft?.description ?? metadata.description,
    mediaKind: ft?.mediaKind ?? metadata.mediaKind,
    previewUrl: ft?.previewUrl ?? metadata.previewUrl,
    staticPreviewUrl: ft?.staticPreviewUrl ?? metadata.previewUrl,
  };
}

function buildContractTokenAttribution(context: ContractTokenContext) {
  return {
    ...buildMediaAttribution(context),
    ...buildArtistAttribution(context),
    ...buildOwnerAttribution(context.foundationToken),
    ...buildCollectionAttribution(context.foundationToken),
  };
}

type AttributionFields = ReturnType<typeof buildContractTokenAttribution>;

function buildContractTokenSearchText(
  context: ContractTokenContext,
  attribution: AttributionFields,
  title: string,
) {
  return searchTextForArtwork({
    title,
    artistName: attribution.artistName,
    artistUsername: attribution.artistUsername,
    collectionName: attribution.collectionName,
    contractAddress: context.contractAddress,
    tokenId: context.tokenId,
  });
}

function rootStatus(root: Awaited<ReturnType<typeof upsertIpfsRoot>>) {
  return root ? BackupStatus.PENDING : BackupStatus.SKIPPED;
}

type FieldBuildArgs = {
  context: ContractTokenContext;
  roots: ContractTokenRoots;
  title: string;
  indexedFrom: string;
  contractId: string;
};

function buildContractTokenCreateFields(args: FieldBuildArgs) {
  const { context, roots, title, indexedFrom, contractId } = args;
  const attribution = buildContractTokenAttribution(context);

  return {
    slug: artworkSlug(title, context.contractAddress, context.tokenId),
    foundationUrl: context.foundationUrl,
    title,
    ...attribution,
    tokenStandard: "ERC-721",
    metadataUrl: roots.metadataUrl,
    sourceUrl: roots.sourceUrl,
    metadataStatus: rootStatus(roots.metadataRoot),
    mediaStatus: rootStatus(roots.mediaRoot),
    indexedFrom,
    searchText: buildContractTokenSearchText(context, attribution, title),
    contractId,
    metadataRootId: roots.metadataRoot?.id,
    mediaRootId: roots.mediaRoot?.id,
    lastIndexedAt: new Date(),
  };
}

// Update prefers `undefined` over `null` so that Prisma leaves existing
// columns untouched when the Foundation payload is temporarily missing.
function buildArtistUpdateAttribution(context: ContractTokenContext) {
  return {
    artistName: context.foundationToken?.artistName ?? undefined,
    artistUsername: context.foundationToken?.artistUsername ?? undefined,
    artistWallet: resolvedArtistWallet(context) ?? undefined,
  };
}

function buildOwnerUpdateAttribution(ft: FoundationMintMaybe) {
  return {
    ownerName: ft?.ownerName ?? undefined,
    ownerUsername: ft?.ownerUsername ?? undefined,
    ownerWallet: ft?.ownerWallet?.toLowerCase() ?? undefined,
  };
}

function buildCollectionUpdateAttribution(ft: FoundationMintMaybe) {
  return {
    collectionName: ft?.collectionName ?? undefined,
    collectionSlug: ft?.collectionSlug ?? undefined,
    foundationContractType: ft?.foundationContractType ?? undefined,
  };
}

function buildContractTokenUpdateAttribution(context: ContractTokenContext) {
  return {
    ...buildMediaAttribution(context),
    ...buildArtistUpdateAttribution(context),
    ...buildOwnerUpdateAttribution(context.foundationToken),
    ...buildCollectionUpdateAttribution(context.foundationToken),
  };
}

function buildContractTokenUpdateFields(args: FieldBuildArgs) {
  const { context, roots, title, indexedFrom, contractId } = args;
  const attribution = buildContractTokenAttribution(context);
  const updateAttribution = buildContractTokenUpdateAttribution(context);

  return {
    foundationUrl: context.foundationUrl,
    title,
    ...updateAttribution,
    tokenStandard: "ERC-721",
    metadataUrl: roots.metadataUrl,
    sourceUrl: roots.sourceUrl,
    metadataStatus: rootStatus(roots.metadataRoot),
    mediaStatus: rootStatus(roots.mediaRoot),
    indexedFrom,
    searchText: buildContractTokenSearchText(context, attribution, title),
    contractId,
    metadataRootId: roots.metadataRoot?.id,
    mediaRootId: roots.mediaRoot?.id,
    lastIndexedAt: new Date(),
  };
}

async function persistContractTokenArtwork(args: {
  client: DatabaseClient;
  context: ContractTokenContext;
  roots: ContractTokenRoots;
  contractId: string;
}) {
  const { client, context, roots, contractId } = args;
  const title = contractTokenTitle(context);
  const indexedFrom = contractTokenIndexedFrom(context);

  return client.artwork.upsert({
    where: {
      chainId_contractAddress_tokenId: {
        chainId: context.chainId,
        contractAddress: context.contractAddress,
        tokenId: context.tokenId,
      },
    },
    create: {
      chainId: context.chainId,
      contractAddress: context.contractAddress,
      tokenId: context.tokenId,
      ...buildContractTokenCreateFields({
        context,
        roots,
        title,
        indexedFrom,
        contractId,
      }),
    },
    update: buildContractTokenUpdateFields({
      context,
      roots,
      title,
      indexedFrom,
      contractId,
    }),
  });
}

async function performContractTokenIngest(args: {
  client: DatabaseClient;
  input: ContractTokenInput;
}) {
  const { client, input } = args;
  const context = await fetchContractTokenContext(input);
  const contract = await upsertContractForToken(client, context);
  const roots = await resolveContractTokenRoots(client, context);

  if (!roots.metadataRoot && !roots.mediaRoot) {
    await emitContractTokenSkipped({ client, context });
    return null;
  }

  const artwork = await persistContractTokenArtwork({
    client,
    context,
    roots,
    contractId: contract.id,
  });

  await emitArchiveEvent(client, {
    type: "artwork.ingested",
    summary: `Indexed ${artwork.title} from contract scan.`,
    artwork: await loadArtworkLiveCard(client, artwork.id),
    contractAddress: context.contractAddress,
    data: {
      indexedFrom: contractTokenIndexedFrom(context),
      foundationUrl: context.foundationUrl,
    },
  });

  await queueArtworkBackup({
    client,
    artworkId: artwork.id,
    priority: input.backupPriority ?? BACKUP_PRIORITY,
  });

  return artwork;
}

export async function ingestContractToken(
  client: DatabaseClient,
  input: ContractTokenInput,
) {
  try {
    return await performContractTokenIngest({ client, input });
  } catch (error) {
    if (error instanceof Error) {
      if (!foundationLiveLookupsEnabled()) {
        throw error;
      }

      const contractAddress = normalizeAddress(input.contractAddress);
      const foundationUrl = buildFoundationMintUrl(
        contractAddress,
        input.tokenId,
        input.chainId ?? 1,
      );
      if (!foundationUrl) {
        throw error;
      }
      return ingestFoundationMintUrl(
        client,
        foundationUrl,
        input.backupPriority ?? BACKUP_PRIORITY,
      );
    }
    throw error;
  }
}
