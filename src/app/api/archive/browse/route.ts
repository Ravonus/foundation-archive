import { NextResponse, type NextRequest } from "next/server";

import {
  computeNextCursor,
  loadArchiveCidArtworkIds,
  loadArchivedWorks,
} from "~/app/archive/_data";
import { toArchivedGridItem } from "~/app/archive/_grid-item";
import { parseArchiveSearchParams } from "~/app/archive/_search-params";
import { ARCHIVE_PAGE_SIZE } from "~/app/archive/_types";
import { attachMarketStateToGridItems } from "~/server/archive/foundation-market";
import { db } from "~/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = parseArchiveSearchParams(request.nextUrl.searchParams);
  const cidArtworkIds = params.query
    ? await loadArchiveCidArtworkIds(params.query)
    : null;
  const archivedRows = await loadArchivedWorks({
    query: params.query,
    sort: params.sort,
    status: params.status,
    media: params.media,
    encodedCursor: params.cursor,
    cidArtworkIds,
  });

  const archivedWorks = archivedRows.slice(0, ARCHIVE_PAGE_SIZE);
  const items = await attachMarketStateToGridItems(
    db,
    archivedWorks.map(toArchivedGridItem),
  );

  return NextResponse.json({
    items,
    nextCursor: computeNextCursor(archivedRows, params.sort),
  });
}
