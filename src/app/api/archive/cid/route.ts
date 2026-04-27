import { NextResponse, type NextRequest } from "next/server";

import {
  cidLookupStatus,
  loadCidLookupMatches,
} from "~/server/archive/cid-index";
import { parseIpfsLookupInput } from "~/server/archive/ipfs";
import { db } from "~/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("cid")?.trim() ?? "";
  const parsed = parseIpfsLookupInput(query);

  if (!parsed) {
    return NextResponse.json(
      { error: "Provide a CID, ipfs:// URL, or /ipfs/<cid> URL." },
      { status: 400 },
    );
  }

  const matches = await loadCidLookupMatches({
    client: db,
    query,
    take: 50,
  });

  return NextResponse.json({
    query: parsed,
    matches: matches.map((artwork) => ({
      artworkId: artwork.id,
      slug: artwork.slug,
      title: artwork.title,
      artistName: artwork.artistName,
      artistUsername: artwork.artistUsername,
      artistWallet: artwork.artistWallet,
      chainId: artwork.chainId,
      contractAddress: artwork.contractAddress,
      tokenId: artwork.tokenId,
      status: cidLookupStatus(artwork),
      metadataRoot: artwork.metadataRoot,
      mediaRoot: artwork.mediaRoot,
      cidMatches: artwork.cidIndexes,
    })),
  });
}
