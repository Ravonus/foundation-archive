import { getAddress } from "viem";

import {
  fetchFoundationGraphql,
  filterIpfsWorks,
  normalizeUsername,
  workKey,
} from "./client";
import {
  mapFoundationDiscoveredContract,
  mapFoundationUser,
  mapFoundationWork,
} from "./mappers";
import {
  DROP_COLLECTIONS_QUERY,
  EDITION_COLLECTIONS_QUERY,
  NFTS_BY_COLLECTION_QUERY,
  NFTS_BY_CREATOR_QUERY,
  SEARCH_COLLECTIONS_QUERY,
  SEARCH_NFTS_QUERY,
  SEARCH_USERS_QUERY,
  USER_BY_USERNAME_QUERY,
  foundationCollectionSearchSchema,
  foundationDropCollectionsSchema,
  foundationEditionCollectionsSchema,
  foundationNftsByCreatorSchema,
  foundationNftsSearchSchema,
  foundationUserByUsernameSchema,
  foundationUserSearchSchema,
} from "./schemas";
import {
  type FoundationDiscoveredContract,
  type FoundationLookupWork,
} from "./types";

export async function searchFoundationUsers(query: string, perPage = 5) {
  if (!query.trim()) return [];

  const data = foundationUserSearchSchema.parse(
    await fetchFoundationGraphql(SEARCH_USERS_QUERY, {
      query,
      page: 0,
      perPage,
    }),
  );

  return data.usersSearchDb.items.map((user) => mapFoundationUser(user));
}

export async function fetchFoundationUserByUsername(username: string) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;

  const data = foundationUserByUsernameSchema.parse(
    await fetchFoundationGraphql(USER_BY_USERNAME_QUERY, {
      username: normalized,
    }),
  );

  return data.userByUsername ? mapFoundationUser(data.userByUsername) : null;
}

export async function fetchFoundationWorksByCreator(
  accountAddress: string,
  perPage = 24,
  page = 0,
) {
  const creator = getAddress(accountAddress);
  const data = foundationNftsByCreatorSchema.parse(
    await fetchFoundationGraphql(NFTS_BY_CREATOR_QUERY, {
      by: {
        creator,
      },
      page,
      perPage,
    }),
  );

  return filterIpfsWorks(data.nfts.items.map((work) => mapFoundationWork(work)));
}

export async function fetchFoundationWorksByCreatorPage(
  accountAddress: string,
  page = 0,
  perPage = 24,
) {
  const creator = getAddress(accountAddress);
  const data = foundationNftsByCreatorSchema.parse(
    await fetchFoundationGraphql(NFTS_BY_CREATOR_QUERY, {
      by: {
        creator,
      },
      page,
      perPage,
    }),
  );

  return {
    items: filterIpfsWorks(data.nfts.items.map((work) => mapFoundationWork(work))),
    page: data.nfts.page,
    totalItems: data.nfts.totalItems,
    rawItemCount: data.nfts.items.length,
  };
}

interface CreatorPaginationState {
  itemsLength: number;
  perPage: number;
  page: number;
  totalItems: number;
}

function shouldStopCreatorPagination(state: CreatorPaginationState): boolean {
  const fetchedItems = (state.page + 1) * state.perPage;
  return state.itemsLength < state.perPage || fetchedItems >= state.totalItems;
}

export async function fetchAllFoundationWorksByCreator(
  accountAddress: string,
  perPage = 24,
  maxPages = 12,
) {
  const creator = getAddress(accountAddress);
  const worksByKey = new Map<string, FoundationLookupWork>();

  for (let page = 0; page < maxPages; page += 1) {
    const data = foundationNftsByCreatorSchema.parse(
      await fetchFoundationGraphql(NFTS_BY_CREATOR_QUERY, {
        by: {
          creator,
        },
        page,
        perPage,
      }),
    );

    for (const work of filterIpfsWorks(
      data.nfts.items.map((item) => mapFoundationWork(item)),
    )) {
      worksByKey.set(workKey(work.contractAddress, work.tokenId), work);
    }

    if (
      shouldStopCreatorPagination({
        itemsLength: data.nfts.items.length,
        perPage,
        page,
        totalItems: data.nfts.totalItems,
      })
    ) {
      break;
    }
  }

  return Array.from(worksByKey.values());
}

export async function fetchFoundationDropCollectionsPage(page: number, perPage = 24) {
  const data = foundationDropCollectionsSchema.parse(
    await fetchFoundationGraphql(DROP_COLLECTIONS_QUERY, {
      page,
      perPage,
    }),
  );

  return {
    page: data.dropCollectionsV2.page,
    totalItems: data.dropCollectionsV2.totalItems,
    items: data.dropCollectionsV2.items
      .map((item) => mapFoundationDiscoveredContract(item))
      .filter((item): item is FoundationDiscoveredContract => item !== null),
  };
}

export async function fetchFoundationEditionCollectionsPage(
  page: number,
  perPage = 24,
) {
  const data = foundationEditionCollectionsSchema.parse(
    await fetchFoundationGraphql(EDITION_COLLECTIONS_QUERY, {
      page,
      perPage,
    }),
  );

  return {
    page: data.editions.page,
    totalItems: data.editions.totalItems,
    items: data.editions.items
      .map((item) => mapFoundationDiscoveredContract(item))
      .filter((item): item is FoundationDiscoveredContract => item !== null),
  };
}

export async function searchFoundationCollectionsPage(
  query: string,
  page: number,
  perPage = 24,
) {
  const data = foundationCollectionSearchSchema.parse(
    await fetchFoundationGraphql(SEARCH_COLLECTIONS_QUERY, {
      query,
      page,
      perPage,
    }),
  );

  return {
    page: data.collectionsSearchDb.page,
    items: data.collectionsSearchDb.items
      .map((item) => mapFoundationDiscoveredContract(item))
      .filter((item): item is FoundationDiscoveredContract => item !== null),
  };
}

export async function fetchFoundationWorksByCollection(
  contractAddress: string,
  page = 0,
  perPage = 24,
) {
  const data = foundationNftsSearchSchema.parse(
    await fetchFoundationGraphql(NFTS_BY_COLLECTION_QUERY, {
      collectionAddresses: [getAddress(contractAddress)],
      page,
      perPage,
    }),
  );

  return filterIpfsWorks(
    data.nftsSearchV2Db.search.items.map((work) => mapFoundationWork(work)),
  );
}

export async function searchFoundationWorks(query: string, perPage = 12) {
  if (!query.trim()) return [];

  const data = foundationNftsSearchSchema.parse(
    await fetchFoundationGraphql(SEARCH_NFTS_QUERY, {
      query,
      page: 0,
      perPage,
    }),
  );

  return filterIpfsWorks(
    data.nftsSearchV2Db.search.items.map((work) => mapFoundationWork(work)),
  );
}
