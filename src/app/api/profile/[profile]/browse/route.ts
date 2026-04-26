import { NextResponse, type NextRequest } from "next/server";

import {
  hydrateProfileFromCache,
  loadArchivedArtistPage,
  mergeArchivedAndFoundation,
  normalizeProfileView,
  resolveProfileFromKey,
} from "~/app/profile/[profile]/_data";
import { attachMarketStateToGridItems } from "~/server/archive/foundation-market";
import { db } from "~/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ profile: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { profile } = await context.params;
  const key = decodeURIComponent(profile).trim();
  const searchParams = request.nextUrl.searchParams;

  const view = normalizeProfileView(searchParams.get("view") ?? undefined);
  const mode = searchParams.get("mode") ?? "db";
  const dbCursor = searchParams.get("cursor");
  const foundationPageParam = Number(searchParams.get("page") ?? "0");

  const initialProfile = await resolveProfileFromKey(key);
  const resolved = await hydrateProfileFromCache(initialProfile);

  if (mode === "foundation") {
    return handleFoundationLoad({
      page: Number.isFinite(foundationPageParam) ? foundationPageParam : 0,
    });
  }

  return handleDbLoad({ resolved, view, dbCursor });
}

async function handleDbLoad({
  resolved,
  view,
  dbCursor,
}: {
  resolved: Awaited<ReturnType<typeof resolveProfileFromKey>>;
  view: ReturnType<typeof normalizeProfileView>;
  dbCursor: string | null;
}) {
  const archivedPage = await loadArchivedArtistPage({
    accountAddress: resolved.accountAddress,
    username: resolved.username,
    view,
    encodedCursor: dbCursor,
  });

  const { items: mergedItems, seenKeys } = mergeArchivedAndFoundation({
    view,
    archivedRows: archivedPage.rows,
    foundationWorks: [],
    archivedByKey: new Map(),
  });

  const items = await attachMarketStateToGridItems(db, mergedItems).catch(
    () => mergedItems,
  );

  return NextResponse.json({
    items,
    seenKeys: Array.from(seenKeys),
    dbCursor: archivedPage.nextCursor,
    foundationPage: null,
    foundationExhausted: false,
  });
}

function handleFoundationLoad({ page }: { page: number }) {
  return NextResponse.json({
    items: [],
    seenKeys: [],
    dbCursor: null,
    foundationPage: page,
    foundationExhausted: true,
  });
}
