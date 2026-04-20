import { type z } from "zod";

import { type MediaKind } from "~/server/prisma-client";
import {
  buildFoundationMintUrl,
  inferFoundationMediaKind,
  rewriteFoundationAssetUrl,
} from "~/server/archive/foundation";
import { detectWorkStorageProtocol } from "./client";
import {
  type foundationCollectionDiscoverySchema,
  type foundationCollectionSchema,
  type foundationMediaSchema,
  type foundationUserSchema,
  type foundationWorkSchema,
} from "./schemas";
import {
  type FoundationDiscoveredContract,
  type FoundationLookupWork,
  type FoundationUserProfile,
} from "./types";

type FoundationUser = z.infer<typeof foundationUserSchema>;
type FoundationCollection = z.infer<typeof foundationCollectionSchema>;
type FoundationCollectionDiscovery = z.infer<
  typeof foundationCollectionDiscoverySchema
>;
type FoundationMedia = z.infer<typeof foundationMediaSchema>;
type FoundationWork = z.infer<typeof foundationWorkSchema>;

interface MediaSlots {
  mediaKind: MediaKind;
  mediaUrl: string | null;
  sourceUrl: string | null;
  previewUrl: string | null;
  staticPreviewUrl: string | null;
}

interface OwnerSlots {
  ownerName: string | null;
  ownerUsername: string | null;
  ownerWallet: string | null;
}

interface ArtistSlots {
  artistName: string | null;
  artistUsername: string | null;
  artistWallet: string;
}

interface CollectionSlots {
  collectionName: string | null;
  collectionSlug: string | null;
  foundationContractType: string | null;
}

export function mapFoundationUser(user: FoundationUser): FoundationUserProfile {
  return {
    accountAddress: user.accountAddress,
    name: user.name ?? null,
    profileImageUrl: rewriteFoundationAssetUrl(user.profileImageUrl),
    coverImageUrl: rewriteFoundationAssetUrl(user.coverImageUrl),
    bio: user.bio ?? null,
    username: user.username ?? null,
  };
}

function mapFoundationMedia(
  media: FoundationMedia,
  directSourceUrl: string | null,
): MediaSlots {
  const mediaUrl = media?.url ?? null;
  const mediaKind = inferFoundationMediaKind({
    mediaType: media?.__typename,
    sourceUrl: directSourceUrl,
    mediaUrl,
  });
  const previewUrl =
    media?.previewUrl ?? (mediaKind === "IMAGE" ? directSourceUrl : null);
  const staticPreviewUrl =
    media?.videoStaticUrl ?? media?.modelStaticUrl ?? previewUrl;

  return {
    mediaKind,
    mediaUrl,
    sourceUrl: directSourceUrl,
    previewUrl,
    staticPreviewUrl,
  };
}

function resolveDirectSourceUrl(work: FoundationWork): string | null {
  return work.sourceUrl ?? work.media?.sourceUrl ?? work.media?.url ?? null;
}

function mapFoundationArtist(creator: FoundationUser): ArtistSlots {
  return {
    artistName: creator.name ?? null,
    artistUsername: creator.username ?? null,
    artistWallet: creator.accountAddress.toLowerCase(),
  };
}

function mapFoundationOwner(owner: FoundationUser | null | undefined): OwnerSlots {
  return {
    ownerName: owner?.name ?? null,
    ownerUsername: owner?.username ?? null,
    // Zod schema marks accountAddress as required string, but the Foundation GraphQL API may omit it at runtime for partially indexed owners.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    ownerWallet: owner?.accountAddress?.toLowerCase() ?? null,
  };
}

function mapFoundationCollection(
  collection: FoundationCollection,
): CollectionSlots {
  return {
    collectionName: collection.name ?? null,
    collectionSlug: collection.slug ?? null,
    foundationContractType: collection.contractType ?? null,
  };
}

function mapFoundationMintEvent(
  work: Pick<FoundationWork, "contractAddress" | "tokenId" | "chainId">,
): string {
  return buildFoundationMintUrl(
    work.contractAddress,
    work.tokenId,
    work.chainId,
  );
}

export function mapFoundationWork(work: FoundationWork): FoundationLookupWork {
  const directSourceUrl = resolveDirectSourceUrl(work);
  const media = mapFoundationMedia(work.media, directSourceUrl);
  const artist = mapFoundationArtist(work.creator);
  const owner = mapFoundationOwner(work.owner);
  const collection = mapFoundationCollection(work.collection);
  const storageProtocol = detectWorkStorageProtocol({
    metadataUrl: work.metadataUrl ?? null,
    sourceUrl: media.sourceUrl,
    mediaUrl: media.mediaUrl,
  });

  return {
    ...artist,
    ...owner,
    ...collection,
    chainId: work.chainId,
    contractAddress: work.contractAddress.toLowerCase(),
    description: work.description ?? null,
    foundationUrl: mapFoundationMintEvent(work),
    id: work.id,
    mediaKind: media.mediaKind,
    storageProtocol,
    mediaUrl: media.mediaUrl,
    metadataUrl: work.metadataUrl ?? null,
    previewUrl: media.previewUrl,
    sourceUrl: media.sourceUrl,
    staticPreviewUrl: media.staticPreviewUrl,
    title: work.name ?? `Token ${work.tokenId}`,
    tokenId: work.tokenId.toString(),
  };
}

export interface FoundationMintPageLike {
  foundationUrl: string;
  chainId: number;
  contractAddress: string;
  tokenId: string;
  title: string;
  description: string | null;
  metadataUrl: string | null;
  sourceUrl: string | null;
  mediaUrl: string | null;
  previewUrl: string | null;
  staticPreviewUrl: string | null;
  collectionName: string | null;
  collectionSlug: string | null;
  foundationContractType: string | null;
  artistName: string | null;
  artistUsername: string | null;
  artistWallet: string | null;
  ownerName: string | null;
  ownerUsername: string | null;
  ownerWallet: string | null;
  mediaKind: MediaKind;
}

export function toLookupWorkFromMintPage(
  mint: FoundationMintPageLike,
): FoundationLookupWork {
  return {
    ...mint,
    contractAddress: mint.contractAddress.toLowerCase(),
    artistWallet: mint.artistWallet?.toLowerCase() ?? null,
    ownerWallet: mint.ownerWallet?.toLowerCase() ?? null,
    id: `mint:${mint.chainId}:${mint.contractAddress.toLowerCase()}:${mint.tokenId}`,
    storageProtocol: detectWorkStorageProtocol({
      metadataUrl: mint.metadataUrl,
      sourceUrl: mint.sourceUrl,
      mediaUrl: mint.mediaUrl,
    }),
  };
}

function resolveDiscoveredContractLabel(
  contract: FoundationCollectionDiscovery,
  contractAddress: string,
): string {
  return contract.name ?? contract.slug ?? `Contract ${contractAddress.slice(0, 10)}`;
}

function mapDiscoveredContractCreator(
  creator: FoundationUser | null | undefined,
): Pick<FoundationDiscoveredContract, "artistName" | "artistUsername" | "artistWallet"> {
  return {
    artistName: creator?.name ?? null,
    artistUsername: creator?.username ?? null,
    // Zod schema marks accountAddress as required string, but the Foundation GraphQL API may omit it at runtime for partially indexed creators.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    artistWallet: creator?.accountAddress?.toLowerCase() ?? null,
  };
}

export function mapFoundationDiscoveredContract(
  contract: FoundationCollectionDiscovery,
): FoundationDiscoveredContract | null {
  if (!contract.contractAddress || !contract.chainId) {
    return null;
  }

  return {
    ...mapDiscoveredContractCreator(contract.creator),
    chainId: contract.chainId,
    contractAddress: contract.contractAddress.toLowerCase(),
    foundationContractType: contract.contractType ?? null,
    label: resolveDiscoveredContractLabel(contract, contract.contractAddress),
    slug: contract.slug ?? null,
  };
}
