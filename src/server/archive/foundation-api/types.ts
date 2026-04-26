import { type MediaKind } from "~/server/prisma-client";

export type WorkStorageProtocol =
  | "ipfs"
  | "arweave"
  | "centralized"
  | "inline"
  | "unknown";

export interface FoundationUserProfile {
  accountAddress: string;
  name: string | null;
  profileImageUrl: string | null;
  coverImageUrl: string | null;
  bio: string | null;
  username: string | null;
}

export interface FoundationLookupWork {
  artistName: string | null;
  artistProfileImageUrl: string | null;
  artistUsername: string | null;
  artistWallet: string | null;
  chainId: number;
  collectionName: string | null;
  collectionSlug: string | null;
  contractAddress: string;
  description: string | null;
  foundationContractType: string | null;
  foundationUrl: string | null;
  id: string;
  mediaKind: MediaKind;
  mediaUrl: string | null;
  metadataUrl: string | null;
  ownerName: string | null;
  ownerUsername: string | null;
  ownerWallet: string | null;
  previewUrl: string | null;
  sourceUrl: string | null;
  staticPreviewUrl: string | null;
  storageProtocol: WorkStorageProtocol;
  title: string;
  tokenId: string;
}

export interface FoundationDiscoveredContract {
  artistName: string | null;
  artistUsername: string | null;
  artistWallet: string | null;
  chainId: number;
  contractAddress: string;
  foundationContractType: string | null;
  label: string;
  slug: string | null;
}
