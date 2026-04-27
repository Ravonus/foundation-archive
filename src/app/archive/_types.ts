export type ArchivePageProps = {
  searchParams: Promise<{
    q?: string;
    cursor?: string;
    sort?: string;
    status?: string;
    media?: string;
  }>;
};

export type ArchivedArtworkRow = {
  id: string;
  chainId: number;
  slug: string;
  title: string;
  artistName: string | null;
  artistUsername: string | null;
  artistWallet: string | null;
  collectionName: string | null;
  tokenId: string;
  contractAddress: string;
  foundationContractType: string | null;
  mediaKind: string;
  metadataUrl: string | null;
  metadataStatus: string;
  mediaStatus: string;
  sourceUrl: string | null;
  previewUrl: string | null;
  staticPreviewUrl: string | null;
  foundationUrl: string | null;
  updatedAt: Date;
  metadataRoot: {
    cid: string;
    relativePath: string | null;
    gatewayUrl: string | null;
  } | null;
  mediaRoot: {
    cid: string;
    relativePath: string | null;
    gatewayUrl: string | null;
  } | null;
};

export type ArchiveProfileMatch = {
  accountAddress: string;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  savedCount: number;
  matchingCount: number;
  sampleTitles: string[];
};

export type ArchiveCidOverlapGroup = {
  cid: string;
  artworkCount: number;
  contractCount: number;
  artistCount: number;
  rootKinds: string[];
  sourceTypes: string[];
  artworks: Array<{
    id: string;
    slug: string;
    title: string;
    artistName: string | null;
    artistUsername: string | null;
    artistWallet: string | null;
    chainId: number;
    contractAddress: string;
    tokenId: string;
    metadataCid: string | null;
    mediaCid: string | null;
  }>;
};

export type ArchiveCursorPayload =
  | {
      sort: "newest" | "oldest";
      id: string;
      updatedAt: string;
    }
  | {
      sort: "title";
      id: string;
      title: string;
    };

export const ARCHIVE_PAGE_SIZE = 24;

export function artworkKey(contractAddress: string, tokenId: string) {
  return `${contractAddress.toLowerCase()}:${tokenId}`;
}

export function isPinnedStatus(status: string) {
  return status === "PINNED";
}

export function hasCapturedServerRoot(artwork: {
  metadataRoot: { cid: string } | null;
  mediaRoot: { cid: string } | null;
}) {
  return Boolean(artwork.metadataRoot?.cid ?? artwork.mediaRoot?.cid);
}
