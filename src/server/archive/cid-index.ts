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
