import {
  BackupStatus,
  type Prisma,
  type PrismaClient,
  type RootKind,
} from "~/server/prisma-client";

import type { DependencyManifest } from "./dependencies";
import { parseIpfsLookupInput } from "./ipfs";
import { listCidDirectoryEntries } from "./storage";

const ROOT_SOURCE_TYPE = "root";
const DAG_SOURCE_TYPE = "dag:directory-entry";
const DEFAULT_CID_LOOKUP_LIMIT = 50;
const DEFAULT_CID_OVERLAP_GROUP_LIMIT = 8;
const DEFAULT_CID_OVERLAP_ARTWORK_LIMIT = 12;
const CID_OVERLAP_SEED_ARTWORK_LIMIT = 250;
const CID_OVERLAP_CANDIDATE_CID_LIMIT = 1_000;
const CID_OVERLAP_ROW_LIMIT = 5_000;

function cleanRelativePath(relativePath: string | null | undefined) {
  return relativePath?.replace(/^\/+|\/+$/g, "") ?? "";
}

function cidLookupWhere(query: string) {
  const parsed = parseIpfsLookupInput(query);
  if (!parsed) return null;

  return {
    cid: parsed.cid,
    ...(parsed.relativePath ? { relativePath: parsed.relativePath } : {}),
  };
}

function uniqueIds(ids: string[], limit: number) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    output.push(id);
    if (output.length >= limit) break;
  }

  return output;
}

export async function loadCidArtworkIdsForQuery(args: {
  client: PrismaClient;
  query: string;
  limit?: number;
}) {
  const where = cidLookupWhere(args.query);
  if (!where) return null;

  const limit = args.limit ?? DEFAULT_CID_LOOKUP_LIMIT;
  const roots = await args.client.ipfsRoot.findMany({
    where,
    take: limit,
    select: { id: true },
  });

  const rootIds = roots.map((root) => root.id);
  const [rootArtworkRows, indexRows] = await Promise.all([
    rootIds.length > 0
      ? args.client.artwork.findMany({
          where: {
            OR: [
              { metadataRootId: { in: rootIds } },
              { mediaRootId: { in: rootIds } },
            ],
          },
          take: limit,
          select: { id: true },
        })
      : Promise.resolve([]),
    args.client.ipfsCidIndex.findMany({
      where,
      take: limit,
      select: { artworkId: true },
    }),
  ]);

  return uniqueIds(
    [
      ...rootArtworkRows.map((artwork) => artwork.id),
      ...indexRows.map((row) => row.artworkId),
    ],
    limit,
  );
}

function rootIndexRow(args: {
  artworkId: string;
  root: {
    id: string;
    cid: string;
    kind: RootKind;
    relativePath: string | null;
  };
}): Prisma.IpfsCidIndexCreateManyInput {
  return {
    cid: args.root.cid,
    relativePath: cleanRelativePath(args.root.relativePath),
    rootId: args.root.id,
    artworkId: args.artworkId,
    rootKind: args.root.kind,
    sourceType: ROOT_SOURCE_TYPE,
    discoveredFrom: ROOT_SOURCE_TYPE,
    depth: 0,
  };
}

export async function syncArtworkRootCidIndex(
  client: PrismaClient,
  artworkId: string,
) {
  const artwork = await client.artwork.findUnique({
    where: { id: artworkId },
    select: {
      id: true,
      metadataRoot: {
        select: {
          id: true,
          cid: true,
          kind: true,
          relativePath: true,
        },
      },
      mediaRoot: {
        select: {
          id: true,
          cid: true,
          kind: true,
          relativePath: true,
        },
      },
    },
  });

  if (!artwork) {
    return { deleted: 0, indexed: 0 };
  }

  const deleted = await client.ipfsCidIndex.deleteMany({
    where: { artworkId, sourceType: ROOT_SOURCE_TYPE },
  });

  const data = [artwork.metadataRoot, artwork.mediaRoot]
    .filter((root): root is NonNullable<typeof root> => Boolean(root))
    .map((root) => rootIndexRow({ artworkId: artwork.id, root }));

  if (data.length === 0) {
    return { deleted: deleted.count, indexed: 0 };
  }

  const created = await client.ipfsCidIndex.createMany({
    data,
    skipDuplicates: true,
  });

  return { deleted: deleted.count, indexed: created.count };
}

export async function indexDependencyManifestCids(args: {
  client: PrismaClient;
  artworkId: string;
  rootId: string;
  rootKind: RootKind;
  manifest: DependencyManifest;
}) {
  await args.client.ipfsCidIndex.deleteMany({
    where: {
      artworkId: args.artworkId,
      rootId: args.rootId,
      NOT: { sourceType: ROOT_SOURCE_TYPE },
    },
  });

  const data: Prisma.IpfsCidIndexCreateManyInput[] = args.manifest.nodes.map(
    (node) => ({
      cid: node.cid,
      relativePath: cleanRelativePath(node.relativePath),
      rootId: args.rootId,
      artworkId: args.artworkId,
      rootKind: args.rootKind,
      sourceType: node.sourceType || "dependency",
      discoveredFrom: node.discoveredFrom,
      depth: node.depth,
    }),
  );

  if (data.length === 0) {
    return { indexed: 0 };
  }

  const created = await args.client.ipfsCidIndex.createMany({
    data,
    skipDuplicates: true,
  });

  return { indexed: created.count };
}

export async function indexKuboDagCids(args: {
  client: PrismaClient;
  artworkId: string;
  rootId: string;
  rootKind: RootKind;
  rootCid: string;
}) {
  const entries = await listCidDirectoryEntries(args.rootCid);

  await args.client.ipfsCidIndex.deleteMany({
    where: {
      artworkId: args.artworkId,
      rootId: args.rootId,
      sourceType: DAG_SOURCE_TYPE,
    },
  });

  const data: Prisma.IpfsCidIndexCreateManyInput[] = entries
    .filter((entry) => entry.cid)
    .map((entry) => ({
      cid: entry.cid,
      relativePath: cleanRelativePath(entry.path),
      rootId: args.rootId,
      artworkId: args.artworkId,
      rootKind: args.rootKind,
      sourceType: DAG_SOURCE_TYPE,
      discoveredFrom: args.rootCid,
      depth: cleanRelativePath(entry.path).split("/").filter(Boolean).length,
    }));

  if (data.length === 0) {
    return { indexed: 0 };
  }

  const created = await args.client.ipfsCidIndex.createMany({
    data,
    skipDuplicates: true,
  });

  return { indexed: created.count };
}

export async function loadCidLookupMatches(args: {
  client: PrismaClient;
  query: string;
  take?: number;
}) {
  const parsed = parseIpfsLookupInput(args.query);
  const artworkIds = await loadCidArtworkIdsForQuery({
    client: args.client,
    query: args.query,
    limit: args.take ?? DEFAULT_CID_LOOKUP_LIMIT,
  });
  if (!parsed || !artworkIds || artworkIds.length === 0) return [];

  return args.client.artwork.findMany({
    where: { id: { in: artworkIds } },
    take: args.take ?? 50,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      artistName: true,
      artistUsername: true,
      artistWallet: true,
      chainId: true,
      contractAddress: true,
      tokenId: true,
      metadataStatus: true,
      mediaStatus: true,
      metadataRoot: {
        select: {
          cid: true,
          relativePath: true,
          gatewayUrl: true,
        },
      },
      mediaRoot: {
        select: {
          cid: true,
          relativePath: true,
          gatewayUrl: true,
        },
      },
      cidIndexes: {
        where: {
          cid: parsed.cid,
          ...(parsed.relativePath ? { relativePath: parsed.relativePath } : {}),
        },
        orderBy: [{ depth: "asc" }, { relativePath: "asc" }],
        take: 20,
        select: {
          cid: true,
          relativePath: true,
          rootKind: true,
          sourceType: true,
          discoveredFrom: true,
          depth: true,
        },
      },
    },
  });
}

type CidOverlapIndexRow = Awaited<
  ReturnType<PrismaClient["ipfsCidIndex"]["findMany"]>
>[number] & {
  artwork: {
    id: string;
    slug: string;
    title: string;
    artistName: string | null;
    artistUsername: string | null;
    artistWallet: string | null;
    chainId: number;
    contractAddress: string;
    tokenId: string;
    metadataRoot: { cid: string } | null;
    mediaRoot: { cid: string } | null;
  };
};

function pushUnique<T>(items: T[], item: T, limit: number) {
  if (items.includes(item) || items.length >= limit) return;
  items.push(item);
}

async function loadSeedCidsForArtworks(args: {
  client: PrismaClient;
  artworkIds: string[];
}) {
  const [indexRows, artworkRoots] = await Promise.all([
    args.client.ipfsCidIndex.findMany({
      where: { artworkId: { in: args.artworkIds } },
      distinct: ["cid"],
      take: CID_OVERLAP_CANDIDATE_CID_LIMIT,
      select: { cid: true },
    }),
    args.client.artwork.findMany({
      where: { id: { in: args.artworkIds } },
      take: args.artworkIds.length,
      select: {
        metadataRoot: { select: { cid: true } },
        mediaRoot: { select: { cid: true } },
      },
    }),
  ]);

  return uniqueIds(
    [
      ...indexRows.map((row) => row.cid),
      ...artworkRoots.flatMap((artwork) => [
        artwork.metadataRoot?.cid,
        artwork.mediaRoot?.cid,
      ]),
    ].filter((cid): cid is string => Boolean(cid)),
    CID_OVERLAP_CANDIDATE_CID_LIMIT,
  );
}

function overlapArtworkFromRow(row: CidOverlapIndexRow) {
  return {
    id: row.artwork.id,
    slug: row.artwork.slug,
    title: row.artwork.title,
    artistName: row.artwork.artistName,
    artistUsername: row.artwork.artistUsername,
    artistWallet: row.artwork.artistWallet,
    chainId: row.artwork.chainId,
    contractAddress: row.artwork.contractAddress,
    tokenId: row.artwork.tokenId,
    metadataCid: row.artwork.metadataRoot?.cid ?? null,
    mediaCid: row.artwork.mediaRoot?.cid ?? null,
  };
}

function buildCidOverlapGroups(args: {
  rows: CidOverlapIndexRow[];
  primaryCid: string;
  groupLimit: number;
  artworkLimit: number;
}) {
  const byCid = new Map<
    string,
    {
      cid: string;
      rootKinds: RootKind[];
      sourceTypes: string[];
      artworks: ReturnType<typeof overlapArtworkFromRow>[];
      artworkIds: Set<string>;
      contractKeys: Set<string>;
      artistKeys: Set<string>;
    }
  >();

  for (const row of args.rows) {
    const group = byCid.get(row.cid) ?? {
      cid: row.cid,
      rootKinds: [],
      sourceTypes: [],
      artworks: [],
      artworkIds: new Set<string>(),
      contractKeys: new Set<string>(),
      artistKeys: new Set<string>(),
    };

    pushUnique(group.rootKinds, row.rootKind, 8);
    pushUnique(group.sourceTypes, row.sourceType, 8);

    if (!group.artworkIds.has(row.artworkId)) {
      group.artworkIds.add(row.artworkId);
      group.contractKeys.add(
        `${row.artwork.chainId}:${row.artwork.contractAddress}`,
      );
      if (row.artwork.artistWallet ?? row.artwork.artistUsername) {
        group.artistKeys.add(
          (row.artwork.artistWallet ?? row.artwork.artistUsername ?? "")
            .trim()
            .toLowerCase(),
        );
      }
      if (group.artworks.length < args.artworkLimit) {
        group.artworks.push(overlapArtworkFromRow(row));
      }
    }

    byCid.set(row.cid, group);
  }

  return [...byCid.values()]
    .filter((group) => group.artworkIds.size > 1)
    .sort((left, right) => {
      if (left.cid === args.primaryCid) return -1;
      if (right.cid === args.primaryCid) return 1;
      return right.artworkIds.size - left.artworkIds.size;
    })
    .slice(0, args.groupLimit)
    .map((group) => ({
      cid: group.cid,
      artworkCount: group.artworkIds.size,
      contractCount: group.contractKeys.size,
      artistCount: group.artistKeys.size,
      rootKinds: group.rootKinds,
      sourceTypes: group.sourceTypes,
      artworks: group.artworks,
    }));
}

export async function loadCidOverlapGroupsForQuery(args: {
  client: PrismaClient;
  query: string;
  groupLimit?: number;
  artworkLimit?: number;
}) {
  const parsed = parseIpfsLookupInput(args.query);
  if (!parsed) return [];

  const seedArtworkIds = await loadCidArtworkIdsForQuery({
    client: args.client,
    query: args.query,
    limit: CID_OVERLAP_SEED_ARTWORK_LIMIT,
  });
  if (!seedArtworkIds || seedArtworkIds.length === 0) return [];

  const seedCids = uniqueIds(
    [
      parsed.cid,
      ...(await loadSeedCidsForArtworks({
        client: args.client,
        artworkIds: seedArtworkIds,
      })),
    ],
    CID_OVERLAP_CANDIDATE_CID_LIMIT,
  );

  const rows = (await args.client.ipfsCidIndex.findMany({
    where: { cid: { in: seedCids } },
    orderBy: [{ cid: "asc" }, { depth: "asc" }, { relativePath: "asc" }],
    take: CID_OVERLAP_ROW_LIMIT,
    select: {
      cid: true,
      relativePath: true,
      rootKind: true,
      sourceType: true,
      artworkId: true,
      artwork: {
        select: {
          id: true,
          slug: true,
          title: true,
          artistName: true,
          artistUsername: true,
          artistWallet: true,
          chainId: true,
          contractAddress: true,
          tokenId: true,
          metadataRoot: { select: { cid: true } },
          mediaRoot: { select: { cid: true } },
        },
      },
    },
  })) as CidOverlapIndexRow[];

  return buildCidOverlapGroups({
    rows,
    primaryCid: parsed.cid,
    groupLimit: args.groupLimit ?? DEFAULT_CID_OVERLAP_GROUP_LIMIT,
    artworkLimit: args.artworkLimit ?? DEFAULT_CID_OVERLAP_ARTWORK_LIMIT,
  });
}

export function cidLookupStatus(input: {
  metadataRoot: { cid: string } | null;
  mediaRoot: { cid: string } | null;
  metadataStatus: BackupStatus;
  mediaStatus: BackupStatus;
}) {
  const statuses = [
    input.metadataRoot ? input.metadataStatus : null,
    input.mediaRoot ? input.mediaStatus : null,
  ].filter((status): status is BackupStatus => Boolean(status));

  if (statuses.length === 0) return BackupStatus.PENDING;
  if (statuses.some((status) => status === BackupStatus.FAILED)) {
    return BackupStatus.FAILED;
  }
  if (statuses.every((status) => status === BackupStatus.PINNED)) {
    return BackupStatus.PINNED;
  }
  if (
    statuses.every(
      (status) =>
        status === BackupStatus.DOWNLOADED || status === BackupStatus.PINNED,
    )
  ) {
    return BackupStatus.DOWNLOADED;
  }
  return BackupStatus.PENDING;
}
