import {
  type ArchiveMediaFilter,
  type ArchiveSort,
  type ArchiveStatusFilter,
} from "~/lib/archive-browse";
import { type FoundationLookupWork } from "~/server/archive/foundation-api";
import { cidIndexArtworkFilterForQuery } from "~/server/archive/cid-index";
import { db } from "~/server/db";
import { BackupStatus, MediaKind, type Prisma } from "~/server/prisma-client";

import {
  ARCHIVE_PAGE_SIZE,
  type ArchiveCursorPayload,
  type ArchivedArtworkRow,
} from "./_types";

const ARCHIVED_SELECT = {
  id: true,
  chainId: true,
  slug: true,
  title: true,
  artistName: true,
  artistUsername: true,
  artistWallet: true,
  collectionName: true,
  tokenId: true,
  contractAddress: true,
  foundationContractType: true,
  mediaKind: true,
  metadataUrl: true,
  metadataStatus: true,
  mediaStatus: true,
  sourceUrl: true,
  previewUrl: true,
  staticPreviewUrl: true,
  foundationUrl: true,
  updatedAt: true,
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
} as const;

function mediaKindFor(media: Exclude<ArchiveMediaFilter, "all">): MediaKind {
  switch (media) {
    case "image":
      return MediaKind.IMAGE;
    case "video":
      return MediaKind.VIDEO;
    case "audio":
      return MediaKind.AUDIO;
    case "html":
      return MediaKind.HTML;
    case "model":
      return MediaKind.MODEL;
  }
}

function queryFilter(query: string): Prisma.ArtworkWhereInput {
  const lowered = query.toLowerCase();
  const cidFilter = cidIndexArtworkFilterForQuery(query);
  return {
    OR: [
      ...(cidFilter ? [cidFilter] : []),
      { title: { contains: query, mode: "insensitive" } },
      { artistName: { contains: query, mode: "insensitive" } },
      { artistUsername: { contains: query, mode: "insensitive" } },
      { artistWallet: { contains: lowered } },
      { collectionName: { contains: query, mode: "insensitive" } },
      { searchText: { contains: lowered } },
      { contractAddress: { contains: lowered } },
      { foundationUrl: { contains: query, mode: "insensitive" } },
      { tokenId: { contains: query } },
    ],
  };
}

function buildStatusWhere(
  status: Exclude<ArchiveStatusFilter, "all">,
): Prisma.ArtworkWhereInput {
  const failedWhere: Prisma.ArtworkWhereInput = {
    OR: [{ metadataStatus: "FAILED" }, { mediaStatus: "FAILED" }],
  };
  const preservedWhere: Prisma.ArtworkWhereInput = {
    AND: [
      {
        OR: [{ metadataRootId: null }, { metadataStatus: BackupStatus.PINNED }],
      },
      { OR: [{ mediaRootId: null }, { mediaStatus: BackupStatus.PINNED }] },
    ],
  };
  const partialWhere: Prisma.ArtworkWhereInput = {
    AND: [
      { NOT: failedWhere },
      { NOT: preservedWhere },
      {
        OR: [
          { metadataRootId: null },
          {
            metadataStatus: {
              in: [BackupStatus.DOWNLOADED, BackupStatus.PINNED],
            },
          },
        ],
      },
      {
        OR: [
          { mediaRootId: null },
          {
            mediaStatus: { in: [BackupStatus.DOWNLOADED, BackupStatus.PINNED] },
          },
        ],
      },
    ],
  };

  switch (status) {
    case "preserved":
      return preservedWhere;
    case "partial":
      return partialWhere;
    case "pending":
      return buildPendingStatusWhere(failedWhere, preservedWhere, partialWhere);
    case "failed":
      return failedWhere;
    case "missing":
      return {
        AND: [{ metadataRootId: null }, { mediaRootId: null }],
      };
  }
}

function buildPendingStatusWhere(
  failedWhere: Prisma.ArtworkWhereInput,
  preservedWhere: Prisma.ArtworkWhereInput,
  partialWhere: Prisma.ArtworkWhereInput,
): Prisma.ArtworkWhereInput {
  return {
    AND: [
      { NOT: failedWhere },
      { NOT: preservedWhere },
      { NOT: partialWhere },
      {
        OR: [
          {
            AND: [
              { metadataRootId: { not: null } },
              { metadataStatus: "PENDING" },
            ],
          },
          {
            AND: [{ mediaRootId: { not: null } }, { mediaStatus: "PENDING" }],
          },
        ],
      },
    ],
  };
}

export function buildArchivedWhere(
  query: string,
  status: ArchiveStatusFilter,
  media: ArchiveMediaFilter,
): Prisma.ArtworkWhereInput {
  const filters: Prisma.ArtworkWhereInput[] = [];

  if (status !== "missing") {
    filters.push({
      OR: [{ metadataRootId: { not: null } }, { mediaRootId: { not: null } }],
    });
  }

  if (query) {
    filters.push(queryFilter(query));
  }

  if (media !== "all") {
    filters.push({ mediaKind: mediaKindFor(media) });
  }

  if (status !== "all") {
    filters.push(buildStatusWhere(status));
  }

  return { AND: filters };
}

export function buildArchiveOrderBy(
  sort: ArchiveSort,
): Prisma.ArtworkOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ updatedAt: "asc" }, { id: "asc" }];
    case "title":
      return [{ title: "asc" }, { id: "asc" }];
    case "newest":
      return [{ updatedAt: "desc" }, { id: "desc" }];
  }
}

export function encodeArchiveCursor(payload: ArchiveCursorPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function parseCursorJson(encoded: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    return parsed;
  } catch {
    return null;
  }
}

export function decodeArchiveCursor(
  encoded: string | null | undefined,
  sort: ArchiveSort,
): ArchiveCursorPayload | null {
  if (!encoded) return null;
  const parsed = parseCursorJson(encoded);
  if (!parsed) return null;
  if (parsed.sort !== sort || typeof parsed.id !== "string") return null;

  if (sort === "newest" || sort === "oldest") {
    if (
      typeof parsed.updatedAt === "string" &&
      !Number.isNaN(Date.parse(parsed.updatedAt))
    ) {
      return { sort, id: parsed.id, updatedAt: parsed.updatedAt };
    }
    return null;
  }

  if (typeof parsed.title === "string") {
    return { sort, id: parsed.id, title: parsed.title };
  }
  return null;
}

function buildUpdatedCursorWhere(
  cursor: Extract<ArchiveCursorPayload, { sort: "oldest" | "newest" }>,
  direction: "oldest" | "newest",
): Prisma.ArtworkWhereInput {
  const op = direction === "oldest" ? "gt" : "lt";
  const updatedAt = new Date(cursor.updatedAt);
  const idOp = direction === "oldest" ? "gt" : "lt";
  return {
    OR: [
      { updatedAt: { [op]: updatedAt } },
      {
        AND: [{ updatedAt }, { id: { [idOp]: cursor.id } }],
      },
    ],
  };
}

export function buildCursorWhere(
  sort: ArchiveSort,
  cursor: ArchiveCursorPayload,
): Prisma.ArtworkWhereInput {
  switch (sort) {
    case "oldest":
      return buildUpdatedCursorWhere(
        cursor as Extract<ArchiveCursorPayload, { sort: "oldest" | "newest" }>,
        "oldest",
      );
    case "newest":
      return buildUpdatedCursorWhere(
        cursor as Extract<ArchiveCursorPayload, { sort: "oldest" | "newest" }>,
        "newest",
      );
    case "title": {
      const titleCursor = cursor as Extract<
        ArchiveCursorPayload,
        { sort: "title" }
      >;
      return {
        OR: [
          { title: { gt: titleCursor.title } },
          {
            AND: [{ title: titleCursor.title }, { id: { gt: titleCursor.id } }],
          },
        ],
      };
    }
  }
}

export function cursorPayloadFromArtwork(
  artwork: ArchivedArtworkRow,
  sort: ArchiveSort,
): ArchiveCursorPayload {
  switch (sort) {
    case "title":
      return { sort, id: artwork.id, title: artwork.title };
    case "oldest":
    case "newest":
      return {
        sort,
        id: artwork.id,
        updatedAt: artwork.updatedAt.toISOString(),
      };
  }
}

export function computeNextCursor(
  archivedRows: ArchivedArtworkRow[],
  sort: ArchiveSort,
) {
  const archivedWorks = archivedRows.slice(0, ARCHIVE_PAGE_SIZE);
  const last = archivedWorks[archivedWorks.length - 1];
  const hasMore = archivedRows.length > ARCHIVE_PAGE_SIZE;
  if (!hasMore || !last) return null;
  return encodeArchiveCursor(cursorPayloadFromArtwork(last, sort));
}

export async function loadArchivedWorks({
  query,
  sort,
  status,
  media,
  encodedCursor,
}: {
  query: string;
  sort: ArchiveSort;
  status: ArchiveStatusFilter;
  media: ArchiveMediaFilter;
  encodedCursor: string | null;
}) {
  const baseWhere = buildArchivedWhere(query, status, media);
  const cursor = decodeArchiveCursor(encodedCursor, sort);
  const where = cursor
    ? { AND: [baseWhere, buildCursorWhere(sort, cursor)] }
    : baseWhere;

  return db.artwork.findMany({
    where,
    orderBy: buildArchiveOrderBy(sort),
    take: ARCHIVE_PAGE_SIZE + 1,
    select: ARCHIVED_SELECT,
  });
}

export async function loadArchivedMatchesForWorks(
  works: FoundationLookupWork[],
) {
  if (works.length === 0) return [];

  return db.artwork.findMany({
    where: {
      AND: [
        {
          OR: [
            { metadataRootId: { not: null } },
            { mediaRootId: { not: null } },
          ],
        },
        {
          OR: works.map((work) => ({
            chainId: work.chainId,
            contractAddress: work.contractAddress,
            tokenId: work.tokenId,
          })),
        },
      ],
    },
    orderBy: [{ lastIndexedAt: "desc" }, { updatedAt: "desc" }],
    select: ARCHIVED_SELECT,
  });
}

export async function loadArchivedWorksForArtist(input: {
  accountAddress: string;
  username?: string | null;
}) {
  const artistFilters: Prisma.ArtworkWhereInput[] = [
    {
      artistWallet: input.accountAddress.toLowerCase(),
    },
  ];

  if (input.username) {
    artistFilters.push({
      artistUsername: {
        equals: input.username,
        mode: "insensitive",
      },
    });
  }

  return db.artwork.findMany({
    where: {
      AND: [
        {
          OR: [
            { metadataRootId: { not: null } },
            { mediaRootId: { not: null } },
          ],
        },
        {
          OR: artistFilters,
        },
      ],
    },
    orderBy: [{ lastIndexedAt: "desc" }, { updatedAt: "desc" }],
    select: ARCHIVED_SELECT,
  });
}
