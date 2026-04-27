import {
  BackupStatus,
  type Prisma,
  type PrismaClient,
  type RootKind,
} from "~/server/prisma-client";

import type { DependencyManifest } from "./dependencies";
import { parseIpfsLookupInput } from "./ipfs";

const ROOT_SOURCE_TYPE = "root";

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

export function cidIndexArtworkFilterForQuery(
  query: string,
): Prisma.ArtworkWhereInput | null {
  const where = cidLookupWhere(query);
  if (!where) return null;

  return {
    OR: [
      { metadataRoot: { is: where } },
      { mediaRoot: { is: where } },
      { cidIndexes: { some: where } },
    ],
  };
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

export async function loadCidLookupMatches(args: {
  client: PrismaClient;
  query: string;
  take?: number;
}) {
  const parsed = parseIpfsLookupInput(args.query);
  const where = cidIndexArtworkFilterForQuery(args.query);
  if (!parsed || !where) return [];

  return args.client.artwork.findMany({
    where,
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
