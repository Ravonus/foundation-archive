import { z } from "zod";

export const foundationGraphqlErrorSchema = z.object({
  message: z.string(),
});

export const foundationGraphqlEnvelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(foundationGraphqlErrorSchema).optional(),
});

export const foundationUserSchema = z.object({
  accountAddress: z.string(),
  name: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  profileImageUrl: z.string().nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
});

export const foundationCollectionSchema = z.object({
  contractAddress: z.string().nullable().optional(),
  chainId: z.number().nullable().optional(),
  contractType: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  slug: z.string().nullable().optional(),
});

export const foundationCollectionDiscoverySchema = foundationCollectionSchema.extend({
  creator: foundationUserSchema.nullable().optional(),
});

export const foundationMediaSchema = z
  .object({
    __typename: z.enum(["ImageMedia", "VideoMedia", "ModelMedia"]),
    url: z.string(),
    sourceUrl: z.string().nullable().optional(),
    previewUrl: z.string().nullable().optional(),
    videoStaticUrl: z.string().nullable().optional(),
    modelStaticUrl: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

export const foundationWorkSchema = z.object({
  chainId: z.number(),
  collection: foundationCollectionSchema,
  contractAddress: z.string(),
  creator: foundationUserSchema,
  description: z.string().nullable().optional(),
  id: z.string(),
  media: foundationMediaSchema,
  metadataUrl: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  owner: foundationUserSchema.nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  tokenId: z.number(),
});

export const foundationUserSearchSchema = z.object({
  usersSearchDb: z.object({
    items: z.array(foundationUserSchema),
    page: z.number(),
  }),
});

export const foundationUserByUsernameSchema = z.object({
  userByUsername: foundationUserSchema.nullable(),
});

export const foundationNftsByCreatorSchema = z.object({
  nfts: z.object({
    items: z.array(foundationWorkSchema),
    page: z.number(),
    totalItems: z.number(),
  }),
});

export const foundationNftsSearchSchema = z.object({
  nftsSearchV2Db: z.object({
    search: z.object({
      items: z.array(foundationWorkSchema),
      page: z.number(),
    }),
  }),
});

export const foundationDropCollectionsSchema = z.object({
  dropCollectionsV2: z.object({
    items: z.array(foundationCollectionDiscoverySchema),
    page: z.number(),
    totalItems: z.number(),
  }),
});

export const foundationEditionCollectionsSchema = z.object({
  editions: z.object({
    items: z.array(foundationCollectionDiscoverySchema),
    page: z.number(),
    totalItems: z.number(),
  }),
});

export const foundationCollectionSearchSchema = z.object({
  collectionsSearchDb: z.object({
    items: z.array(foundationCollectionDiscoverySchema),
    page: z.number(),
  }),
});

export const SEARCH_USERS_QUERY = `
  query SearchUsers($query: String!, $page: Int!, $perPage: Int!) {
    usersSearchDb(query: $query, page: $page, perPage: $perPage) {
      page
      items {
        accountAddress
        name
        username
        profileImageUrl
      }
    }
  }
`;

export const USER_BY_USERNAME_QUERY = `
  query UserByUsername($username: String!) {
    userByUsername(username: $username) {
      accountAddress
      name
      username
      profileImageUrl
      coverImageUrl
      bio
    }
  }
`;

export const NFTS_BY_CREATOR_QUERY = `
  query NftsByCreator($by: NftsByOneOfInput!, $page: Int!, $perPage: Int!) {
    nfts(by: $by, page: $page, perPage: $perPage) {
      page
      totalItems
      items {
        id
        contractAddress
        tokenId
        chainId
        name
        description
        metadataUrl
        sourceUrl
        creator {
          accountAddress
          name
          username
          profileImageUrl
        }
        owner {
          accountAddress
          name
          username
          profileImageUrl
        }
        collection {
          contractAddress
          chainId
          contractType
          name
          slug
        }
        media {
          __typename
          ... on ImageMedia {
            url
            sourceUrl
          }
          ... on VideoMedia {
            url
            sourceUrl
            previewUrl
            videoStaticUrl: staticUrl
          }
          ... on ModelMedia {
            url
            sourceUrl
            modelStaticUrl: staticUrl
          }
        }
      }
    }
  }
`;

export const SEARCH_NFTS_QUERY = `
  query SearchWorks($query: String!, $page: Int!, $perPage: Limit!) {
    nftsSearchV2Db(query: $query, page: $page, perPage: $perPage, sort: MINT_DATE_DESC) {
      search {
        page
        items {
          id
          contractAddress
          tokenId
          chainId
          name
          description
          metadataUrl
          sourceUrl
          creator {
            accountAddress
            name
            username
            profileImageUrl
          }
          owner {
            accountAddress
            name
            username
            profileImageUrl
          }
          collection {
            contractAddress
            chainId
            contractType
            name
            slug
          }
          media {
            __typename
            ... on ImageMedia {
              url
              sourceUrl
            }
            ... on VideoMedia {
              url
              sourceUrl
              previewUrl
              videoStaticUrl: staticUrl
            }
            ... on ModelMedia {
              url
              sourceUrl
              modelStaticUrl: staticUrl
            }
          }
        }
      }
    }
  }
`;

export const DROP_COLLECTIONS_QUERY = `
  query DropCollectionsPage($page: Int!, $perPage: Int!) {
    dropCollectionsV2(page: $page, perPage: $perPage) {
      page
      totalItems
      items {
        contractAddress
        chainId
        contractType
        name
        slug
        creator {
          accountAddress
          name
          username
          profileImageUrl
        }
      }
    }
  }
`;

export const EDITION_COLLECTIONS_QUERY = `
  query EditionCollectionsPage($page: Int!, $perPage: Int!) {
    editions(page: $page, perPage: $perPage) {
      page
      totalItems
      items {
        contractAddress
        chainId
        contractType
        name
        slug
        creator {
          accountAddress
          name
          username
          profileImageUrl
        }
      }
    }
  }
`;

export const SEARCH_COLLECTIONS_QUERY = `
  query SearchCollections($query: String!, $page: Int!, $perPage: Int!) {
    collectionsSearchDb(query: $query, page: $page, perPage: $perPage) {
      page
      items {
        contractAddress
        chainId
        contractType
        name
        slug
        creator {
          accountAddress
          name
          username
          profileImageUrl
        }
      }
    }
  }
`;

export const NFTS_BY_COLLECTION_QUERY = `
  query NftsByCollection($collectionAddresses: [ID!], $page: Int!, $perPage: Limit!) {
    nftsSearchV2Db(
      query: ""
      collectionAddresses: $collectionAddresses
      page: $page
      perPage: $perPage
      sort: MINT_DATE_DESC
    ) {
      search {
        page
        items {
          id
          contractAddress
          tokenId
          chainId
          name
          description
          metadataUrl
          sourceUrl
          creator {
            accountAddress
            name
            username
            profileImageUrl
          }
          owner {
            accountAddress
            name
            username
            profileImageUrl
          }
          collection {
            contractAddress
            chainId
            contractType
            name
            slug
          }
          media {
            __typename
            ... on ImageMedia {
              url
              sourceUrl
            }
            ... on VideoMedia {
              url
              sourceUrl
              previewUrl
              videoStaticUrl: staticUrl
            }
            ... on ModelMedia {
              url
              sourceUrl
              modelStaticUrl: staticUrl
            }
          }
        }
      }
    }
  }
`;
