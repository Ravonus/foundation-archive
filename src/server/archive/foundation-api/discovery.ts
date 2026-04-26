import {
  tryFetchFoundationMintByUrl,
  tryFetchFoundationProfileByUsername,
} from "~/server/archive/foundation";
import { foundationLiveLookupsEnabled } from "~/server/archive/foundation-live";
import { foundationMintUrlSchema } from "~/server/archive/schemas";

import { isFoundationWorkIpfsArchivable, workKey } from "./client";
import { toLookupWorkFromMintPage } from "./mappers";
import {
  fetchFoundationUserByUsername,
  fetchFoundationWorksByCreator,
  searchFoundationUsers,
  searchFoundationWorks,
} from "./queries";
import {
  type FoundationLookupWork,
  type FoundationUserProfile,
} from "./types";

interface DiscoveryResult {
  profiles: FoundationUserProfile[];
  works: FoundationLookupWork[];
}

function emptyDiscoveryResult(): DiscoveryResult {
  return {
    profiles: [],
    works: [],
  };
}

async function resolveDirectMintWork(
  normalizedQuery: string,
): Promise<FoundationLookupWork | null> {
  if (!foundationMintUrlSchema.safeParse(normalizedQuery).success) {
    return null;
  }
  const directMint = await tryFetchFoundationMintByUrl(normalizedQuery);
  if (!directMint || !isFoundationWorkIpfsArchivable(directMint)) {
    return null;
  }
  return toLookupWorkFromMintPage(directMint);
}

function profilesIncludeArtistOfWork(
  profiles: FoundationUserProfile[],
  work: FoundationLookupWork,
): boolean {
  const walletLower = work.artistWallet?.toLowerCase() ?? "";
  const usernameLower = work.artistUsername?.toLowerCase();
  return profiles.some(
    (profile) =>
      profile.accountAddress.toLowerCase() === walletLower ||
      profile.username?.toLowerCase() === usernameLower,
  );
}

async function lookupArtistProfile(
  username: string,
): Promise<FoundationUserProfile | null> {
  const fromApi = await fetchFoundationUserByUsername(username).catch(() => null);
  if (fromApi) return fromApi;
  const scraped = await tryFetchFoundationProfileByUsername(username).catch(
    () => null,
  );
  if (!scraped) return null;
  return {
    accountAddress: scraped.accountAddress,
    name: scraped.name,
    profileImageUrl: scraped.profileImageUrl,
    coverImageUrl: scraped.coverImageUrl,
    bio: scraped.bio,
    username: scraped.username,
  };
}

async function prependDirectMintArtistProfile(
  profiles: FoundationUserProfile[],
  directMintWork: FoundationLookupWork,
): Promise<FoundationUserProfile[]> {
  if (!directMintWork.artistUsername) return profiles;
  if (profilesIncludeArtistOfWork(profiles, directMintWork)) return profiles;

  const directProfile = await lookupArtistProfile(directMintWork.artistUsername);
  if (!directProfile) return profiles;

  return [
    {
      accountAddress: directProfile.accountAddress,
      name: directProfile.name ?? directMintWork.artistName,
      profileImageUrl: directProfile.profileImageUrl ?? null,
      coverImageUrl: directProfile.coverImageUrl ?? null,
      bio: directProfile.bio ?? null,
      username: directProfile.username ?? directMintWork.artistUsername,
    },
    ...profiles,
  ];
}

async function fallbackProfileByUsername(
  normalizedQuery: string,
): Promise<FoundationUserProfile | null> {
  return await fetchFoundationUserByUsername(normalizedQuery).catch(() => null);
}

async function scrapedProfileByUsername(
  normalizedQuery: string,
): Promise<FoundationUserProfile | null> {
  const scraped = await tryFetchFoundationProfileByUsername(normalizedQuery);
  if (!scraped) return null;
  return {
    accountAddress: scraped.accountAddress,
    name: scraped.name,
    profileImageUrl: scraped.profileImageUrl,
    coverImageUrl: scraped.coverImageUrl,
    bio: scraped.bio,
    username: scraped.username,
  };
}

async function resolveInitialProfiles(
  normalizedQuery: string,
  directMintWork: FoundationLookupWork | null,
): Promise<FoundationUserProfile[]> {
  let profiles = await searchFoundationUsers(normalizedQuery, 4);
  if (directMintWork) {
    profiles = await prependDirectMintArtistProfile(profiles, directMintWork);
  }
  if (profiles.length === 0) {
    const fallback = await fallbackProfileByUsername(normalizedQuery);
    if (fallback) profiles = [fallback];
  }
  if (profiles.length === 0) {
    const scraped = await scrapedProfileByUsername(normalizedQuery);
    if (scraped) profiles = [scraped];
  }
  return profiles;
}

function ensureDirectMintArtistProfile(
  profiles: FoundationUserProfile[],
  directMintWork: FoundationLookupWork | null,
): FoundationUserProfile[] {
  if (!directMintWork?.artistWallet) return profiles;
  const walletLower = directMintWork.artistWallet.toLowerCase();
  const alreadyPresent = profiles.some(
    (profile) => profile.accountAddress.toLowerCase() === walletLower,
  );
  if (alreadyPresent) return profiles;
  return [
    {
      accountAddress: directMintWork.artistWallet,
      name: directMintWork.artistName,
      profileImageUrl: null,
      coverImageUrl: null,
      bio: null,
      username: directMintWork.artistUsername,
    },
    ...profiles,
  ];
}

async function collectCreatorWorks(
  profiles: FoundationUserProfile[],
): Promise<FoundationLookupWork[][]> {
  const creatorProfiles =
    profiles.length === 1 ? profiles.slice(0, 1) : profiles.slice(0, 3);
  const perCreator = profiles.length === 1 ? 32 : 12;
  return await Promise.all(
    creatorProfiles.map((profile) =>
      fetchFoundationWorksByCreator(profile.accountAddress, perCreator).catch(
        () => [],
      ),
    ),
  );
}

function addWorksToMap(
  worksByKey: Map<string, FoundationLookupWork>,
  works: FoundationLookupWork[],
) {
  for (const work of works) {
    worksByKey.set(workKey(work.contractAddress, work.tokenId), work);
  }
}

export async function discoverFoundationWorks(
  query: string,
): Promise<DiscoveryResult> {
  if (!foundationLiveLookupsEnabled()) return emptyDiscoveryResult();

  const normalizedQuery = query.trim();
  if (!normalizedQuery) return emptyDiscoveryResult();

  const directMintWork = await resolveDirectMintWork(normalizedQuery);
  let profiles = await resolveInitialProfiles(normalizedQuery, directMintWork);

  const worksByKey = new Map<string, FoundationLookupWork>();
  if (directMintWork) {
    worksByKey.set(
      workKey(directMintWork.contractAddress, directMintWork.tokenId),
      directMintWork,
    );
  }

  profiles = ensureDirectMintArtistProfile(profiles, directMintWork);

  const creatorWorkSets = await collectCreatorWorks(profiles);
  for (const works of creatorWorkSets) {
    addWorksToMap(worksByKey, works);
  }

  const searchMatches = await searchFoundationWorks(normalizedQuery, 16).catch(
    () => [],
  );
  addWorksToMap(worksByKey, searchMatches);

  return {
    profiles,
    works: Array.from(worksByKey.values()),
  };
}
