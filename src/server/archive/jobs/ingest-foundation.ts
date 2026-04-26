import {
  BackupStatus,
  RootKind,
} from "~/server/prisma-client";
import { emitArchiveEvent } from "~/server/archive/live-events";
import { fetchFoundationMintByUrl } from "~/server/archive/foundation";
import { assertFoundationLiveLookupsEnabled } from "~/server/archive/foundation-live";
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

type FoundationMint = Awaited<ReturnType<typeof fetchFoundationMintByUrl>>;

function buildFoundationArtworkFields(args: {
  token: FoundationMint;
  contractAddress: string;
  metadataUrl: string | null;
  sourceUrl: string | null;
  metadataRootId: string | undefined;
  mediaRootId: string | undefined;
  metadataStatus: BackupStatus;
  mediaStatus: BackupStatus;
  contractId: string;
}) {
  const { token, contractAddress } = args;
  return {
    foundationUrl: token.foundationUrl,
    title: token.title,
    description: token.description,
    artistName: token.artistName,
    artistUsername: token.artistUsername,
    artistWallet: token.artistWallet?.toLowerCase() ?? null,
    ownerName: token.ownerName,
    ownerUsername: token.ownerUsername,
    ownerWallet: token.ownerWallet?.toLowerCase() ?? null,
    collectionName: token.collectionName,
    collectionSlug: token.collectionSlug,
    tokenStandard: "ERC-721",
    foundationContractType: token.foundationContractType,
    mediaKind: token.mediaKind,
    metadataUrl: args.metadataUrl,
    sourceUrl: args.sourceUrl,
    previewUrl: token.previewUrl,
    staticPreviewUrl: token.staticPreviewUrl,
    metadataStatus: args.metadataStatus,
    mediaStatus: args.mediaStatus,
    indexedFrom: "foundation-page",
    searchText: searchTextForArtwork({
      title: token.title,
      artistName: token.artistName,
      artistUsername: token.artistUsername,
      collectionName: token.collectionName,
      contractAddress,
      tokenId: token.tokenId,
    }),
    contractId: args.contractId,
    metadataRootId: args.metadataRootId,
    mediaRootId: args.mediaRootId,
    lastIndexedAt: new Date(),
  };
}

async function emitFoundationSkipped(args: {
  client: DatabaseClient;
  token: FoundationMint;
  contractAddress: string;
}) {
  await dropRootlessArtworkIfPresent(args.client, {
    chainId: args.token.chainId,
    contractAddress: args.contractAddress,
    tokenId: args.token.tokenId,
  });

  await emitArchiveEvent(args.client, {
    type: "artwork.skipped-non-ipfs",
    summary: `Skipped ${args.token.title}: Foundation did not expose an IPFS metadata or media root.`,
    contractAddress: args.contractAddress,
    data: {
      foundationUrl: args.token.foundationUrl,
      tokenId: args.token.tokenId,
      chainId: args.token.chainId,
    },
  });
}

export async function ingestFoundationMintUrl(
  client: DatabaseClient,
  url: string,
  backupPriority = BACKUP_PRIORITY,
) {
  assertFoundationLiveLookupsEnabled("Foundation mint ingest");

  const token = await fetchFoundationMintByUrl(url);
  const contractAddress = normalizeAddress(token.contractAddress);
  const metadataUrl = selectArchivableIpfsUrl(RootKind.METADATA, [
    token.metadataUrl,
  ]);
  const sourceUrl = selectArchivableIpfsUrl(RootKind.MEDIA, [
    token.sourceUrl,
    token.mediaUrl,
  ]);

  if (!metadataUrl && !sourceUrl) {
    await emitFoundationSkipped({ client, token, contractAddress });
    return null;
  }

  const contract = await upsertContractEntry(client, {
    chainId: token.chainId,
    address: contractAddress,
    label: token.collectionName ?? token.title,
    foundationContractType: token.foundationContractType,
    isFoundationNative: Boolean(token.foundationContractType?.startsWith("FND")),
  });

  const metadataRoot = await upsertIpfsRoot(
    client,
    metadataUrl,
    RootKind.METADATA,
  );
  const mediaRoot = await upsertIpfsRoot(client, sourceUrl, RootKind.MEDIA);

  const fields = buildFoundationArtworkFields({
    token,
    contractAddress,
    metadataUrl,
    sourceUrl,
    metadataRootId: metadataRoot?.id,
    mediaRootId: mediaRoot?.id,
    metadataStatus: metadataRoot ? BackupStatus.PENDING : BackupStatus.SKIPPED,
    mediaStatus: mediaRoot ? BackupStatus.PENDING : BackupStatus.SKIPPED,
    contractId: contract.id,
  });

  const artwork = await client.artwork.upsert({
    where: {
      chainId_contractAddress_tokenId: {
        chainId: token.chainId,
        contractAddress,
        tokenId: token.tokenId,
      },
    },
    create: {
      chainId: token.chainId,
      contractAddress,
      tokenId: token.tokenId,
      slug: artworkSlug(token.title, contractAddress, token.tokenId),
      ...fields,
    },
    update: fields,
  });

  await emitArchiveEvent(client, {
    type: "artwork.ingested",
    summary: `Indexed ${artwork.title} from Foundation.`,
    artwork: await loadArtworkLiveCard(client, artwork.id),
    contractAddress,
    data: {
      indexedFrom: "foundation-page",
      foundationUrl: token.foundationUrl,
    },
  });

  await queueArtworkBackup({
    client,
    artworkId: artwork.id,
    priority: backupPriority,
  });

  return artwork;
}
