import { type ArtworkGridItem } from "~/app/_components/artwork-grid";
import { type ProfileArchiveItem } from "~/app/_components/profile/profile-archive-cards";
import { buildFoundationProfileUrl } from "~/server/archive/foundation";
import {
  type FoundationLookupWork,
  type FoundationUserProfile,
} from "~/server/archive/foundation-api";
import {
  buildArchivePublicPath,
  parseIpfsReference,
} from "~/server/archive/ipfs";
import { RootKind } from "~/server/prisma-client";

import {
  artworkKey,
  hasCapturedServerRoot,
  isPinnedStatus,
  type ArchivedArtworkRow,
} from "./_types";

function isArchivedMediaDownloaded(status: string) {
  return status === "DOWNLOADED" || status === "PINNED";
}

function browserSafeIpfsUrl(url: string | null | undefined) {
  if (!url) return null;
  const parsed = parseIpfsReference(url, RootKind.MEDIA);
  if (!parsed) return url;
  return buildArchivePublicPath(parsed.cid, parsed.relativePath);
}

function resolveArchiveMediaUrl(artwork: ArchivedArtworkRow) {
  if (!artwork.mediaRoot) return null;
  if (!isArchivedMediaDownloaded(artwork.mediaStatus)) {
    return artwork.mediaRoot.gatewayUrl;
  }
  return buildArchivePublicPath(
    artwork.mediaRoot.cid,
    artwork.mediaRoot.relativePath,
  );
}

function resolveArchivedPosterUrl(
  artwork: ArchivedArtworkRow,
  archiveMediaUrl: string | null,
) {
  const base = browserSafeIpfsUrl(
    artwork.staticPreviewUrl ?? artwork.previewUrl,
  );
  if (base) return base;
  if (artwork.mediaKind !== "IMAGE") return null;
  return archiveMediaUrl ?? browserSafeIpfsUrl(artwork.sourceUrl);
}

function resolveArchivedMediaUrl(
  artwork: ArchivedArtworkRow,
  archiveMediaUrl: string | null,
) {
  if (archiveMediaUrl) return archiveMediaUrl;
  if (artwork.mediaKind === "IMAGE") {
    return browserSafeIpfsUrl(artwork.sourceUrl ?? artwork.previewUrl);
  }
  return browserSafeIpfsUrl(artwork.sourceUrl ?? artwork.previewUrl);
}

export function toArchivedGridItem(
  artwork: ArchivedArtworkRow,
): ArtworkGridItem {
  const archiveMediaUrl = resolveArchiveMediaUrl(artwork);

  return {
    id: artwork.id,
    slug: artwork.slug,
    chainId: artwork.chainId,
    title: artwork.title,
    artistName: artwork.artistName,
    artistUsername: artwork.artistUsername,
    artistWallet: artwork.artistWallet,
    collectionName: artwork.collectionName,
    tokenId: artwork.tokenId,
    contractAddress: artwork.contractAddress,
    foundationContractType: artwork.foundationContractType,
    mediaKind: artwork.mediaKind,
    metadataStatus: artwork.metadataStatus,
    mediaStatus: artwork.mediaStatus,
    posterUrl: resolveArchivedPosterUrl(artwork, archiveMediaUrl),
    mediaUrl: resolveArchivedMediaUrl(artwork, archiveMediaUrl),
    foundationUrl: artwork.foundationUrl,
    archiveMediaUrl,
    publicGatewayUrl: artwork.mediaRoot?.gatewayUrl ?? null,
    metadataCid: artwork.metadataRoot?.cid ?? null,
    mediaCid: artwork.mediaRoot?.cid ?? null,
    metadataUrl: artwork.metadataUrl,
    sourceUrl: artwork.sourceUrl,
    lookupSource: "ARCHIVED",
    storageProtocol: "ipfs",
  } satisfies ArtworkGridItem;
}

// Foundation returns truncated `data:image/gif;base64` strings for inline
// works — with no actual payload. Treat those as unusable so we fall through
// to a real URL (their imgix CDN) instead of rendering a blank tile.
function isUsableUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^data:[^;,]*(;[^,]*)?$/i.test(trimmed)) return false; // data: with no payload
  return true;
}

function pickFirstUsable(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    if (isUsableUrl(candidate)) return candidate;
  }
  return null;
}

function resolveDiscoveredPosterUrl(work: FoundationLookupWork) {
  const base = pickFirstUsable(work.staticPreviewUrl, work.previewUrl);
  if (base) return browserSafeIpfsUrl(base);
  if (work.mediaKind !== "IMAGE") return null;
  return browserSafeIpfsUrl(pickFirstUsable(work.sourceUrl, work.mediaUrl));
}

function resolveDiscoveredMediaUrl(work: FoundationLookupWork) {
  if (work.mediaKind === "IMAGE") {
    return browserSafeIpfsUrl(
      pickFirstUsable(work.sourceUrl, work.mediaUrl, work.previewUrl),
    );
  }
  return browserSafeIpfsUrl(
    pickFirstUsable(work.mediaUrl, work.sourceUrl, work.previewUrl),
  );
}

export function toDiscoveredGridItem(
  work: FoundationLookupWork,
): ArtworkGridItem {
  return {
    id: `live:${artworkKey(work.contractAddress, work.tokenId)}`,
    slug: null,
    chainId: work.chainId,
    title: work.title,
    artistName: work.artistName,
    artistUsername: work.artistUsername,
    artistWallet: work.artistWallet,
    collectionName: work.collectionName,
    tokenId: work.tokenId,
    contractAddress: work.contractAddress,
    foundationContractType: work.foundationContractType,
    mediaKind: work.mediaKind,
    metadataStatus: "NOT_ARCHIVED",
    mediaStatus: "NOT_ARCHIVED",
    posterUrl: resolveDiscoveredPosterUrl(work),
    mediaUrl: resolveDiscoveredMediaUrl(work),
    foundationUrl: work.foundationUrl,
    archiveMediaUrl: null,
    publicGatewayUrl: null,
    metadataCid: null,
    mediaCid: null,
    metadataUrl: work.metadataUrl,
    sourceUrl: work.sourceUrl,
    lookupSource: "FOUNDATION_LIVE",
    storageProtocol: work.storageProtocol,
  } satisfies ArtworkGridItem;
}

function profileMatchesWork(
  profile: FoundationUserProfile,
  work: FoundationLookupWork,
  accountAddress: string,
) {
  if (work.artistWallet === accountAddress) return true;
  if (!profile.username) return false;
  return work.artistUsername?.toLowerCase() === profile.username.toLowerCase();
}

function collectArchivedForProfile(
  worksForProfile: FoundationLookupWork[],
  archivedByKey: Map<string, ArchivedArtworkRow>,
) {
  const archivedWorks = worksForProfile
    .map((work) =>
      archivedByKey.get(artworkKey(work.contractAddress, work.tokenId)),
    )
    .filter((artwork): artwork is ArchivedArtworkRow => Boolean(artwork));
  const archivedWithRoots = archivedWorks.filter((artwork) =>
    hasCapturedServerRoot(artwork),
  );
  const pinnedWorks = archivedWithRoots.filter(
    (artwork) =>
      isPinnedStatus(artwork.metadataStatus) &&
      (!artwork.mediaRoot || isPinnedStatus(artwork.mediaStatus)),
  );
  return { archivedWithRoots, pinnedWorks };
}

function toPinnedWork(artwork: ArchivedArtworkRow) {
  return {
    id: artwork.id,
    title: artwork.title,
    slug: artwork.slug,
    archiveUrl: artwork.mediaRoot
      ? buildArchivePublicPath(
          artwork.mediaRoot.cid,
          artwork.mediaRoot.relativePath,
        )
      : null,
    publicGatewayUrl: artwork.mediaRoot?.gatewayUrl ?? null,
  };
}

function profileFoundationUrl(profile: FoundationUserProfile): string | null {
  if (profile.username) return buildFoundationProfileUrl(profile.username);
  return null;
}

function buildProfileItem(
  profile: FoundationUserProfile,
  works: FoundationLookupWork[],
  archivedByKey: Map<string, ArchivedArtworkRow>,
): ProfileArchiveItem {
  const accountAddress = profile.accountAddress.toLowerCase();
  const worksForProfile = works.filter((work) =>
    profileMatchesWork(profile, work, accountAddress),
  );
  const archivableWorks = worksForProfile.filter(
    (work) => work.storageProtocol === "ipfs",
  );
  const offChainCount = worksForProfile.length - archivableWorks.length;
  const { archivedWithRoots, pinnedWorks } = collectArchivedForProfile(
    archivableWorks,
    archivedByKey,
  );

  return {
    accountAddress,
    foundationUrl: profileFoundationUrl(profile),
    name: profile.name,
    profileImageUrl: profile.profileImageUrl,
    username: profile.username,
    discoveredCount: archivableWorks.length,
    archivedCount: archivedWithRoots.length,
    pinnedCount: pinnedWorks.length,
    offChainCount,
    pinnedWorks: pinnedWorks.slice(0, 3).map(toPinnedWork),
  } satisfies ProfileArchiveItem;
}

export function buildProfileArchiveItems(
  profiles: FoundationUserProfile[],
  works: FoundationLookupWork[],
  archivedByKey: Map<string, ArchivedArtworkRow>,
): ProfileArchiveItem[] {
  return profiles.map((profile) =>
    buildProfileItem(profile, works, archivedByKey),
  );
}
