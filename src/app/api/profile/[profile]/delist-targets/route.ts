import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddressEqual } from "viem";

import {
  type ArtistMarketCandidate,
  hydrateProfileFromCache,
  loadArtistMarketCandidates,
  resolveProfileFromKey,
} from "~/app/profile/[profile]/_data";
import { db } from "~/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ profile: string }>;
};

type BulkDelistTarget = {
  id: string;
  kind: "buyPrice" | "reserveAuction";
  chainId: number;
  title: string;
  slug: string | null;
  contractAddress: string;
  tokenId: string;
  marketContract: string;
  seller: string;
  price: string | null;
  auctionId: string | null;
  reservePrice: string | null;
};

type SkippedCounts = {
  biddingAuctions: number;
  otherSeller: number;
  errors: number;
};

const MARKET_QUERY_CHUNK_SIZE = 250;

export async function GET(_request: NextRequest, context: RouteContext) {
  const { profile } = await context.params;
  const key = decodeURIComponent(profile).trim();
  const initialProfile = await resolveProfileFromKey(key);
  const resolved = await hydrateProfileFromCache(initialProfile);
  const candidates = await loadArtistMarketCandidates({
    accountAddress: resolved.accountAddress,
    username: resolved.username,
  });

  const { targets, skipped } = await findStoredDelistTargets(
    candidates,
    resolved.accountAddress,
  );

  targets.sort((a, b) => {
    if (a.chainId !== b.chainId) return a.chainId - b.chainId;
    return a.title.localeCompare(b.title);
  });

  return NextResponse.json({
    seller: resolved.accountAddress,
    scanned: candidates.length,
    targets,
    skipped,
  });
}

async function findStoredDelistTargets(
  candidates: ArtistMarketCandidate[],
  sellerAddress: string,
): Promise<{ targets: BulkDelistTarget[]; skipped: SkippedCounts }> {
  const candidatesByToken = new Map(
    candidates.map((candidate) => [tokenKey(candidate), candidate]),
  );
  const targets: BulkDelistTarget[] = [];
  const skipped: SkippedCounts = {
    biddingAuctions: 0,
    otherSeller: 0,
    errors: 0,
  };

  for (
    let index = 0;
    index < candidates.length;
    index += MARKET_QUERY_CHUNK_SIZE
  ) {
    const batch = candidates.slice(index, index + MARKET_QUERY_CHUNK_SIZE);
    const whereTokens = batch.map((candidate) => ({
      chainId: candidate.chainId,
      nftContract: candidate.contractAddress.toLowerCase(),
      tokenId: candidate.tokenId,
    }));

    const [buyPrices, auctions] = await Promise.all([
      db.foundationBuyPrice.findMany({
        where: {
          status: "active",
          OR: whereTokens,
        },
      }),
      db.foundationReserveAuction.findMany({
        where: {
          status: { in: ["open", "bidding"] },
          OR: whereTokens,
        },
      }),
    ]);

    for (const buyPrice of buyPrices) {
      const candidate = candidatesByToken.get(tokenKey(buyPrice));
      if (!candidate) continue;
      if (addressesMatch(buyPrice.seller, sellerAddress)) {
        targets.push({
          id: `${buyPrice.chainId}:${buyPrice.marketContract}:buyPrice:${buyPrice.nftContract}:${buyPrice.tokenId}`,
          kind: "buyPrice",
          chainId: buyPrice.chainId,
          title: candidate.title,
          slug: candidate.slug,
          contractAddress: buyPrice.nftContract,
          tokenId: buyPrice.tokenId,
          marketContract: buyPrice.marketContract,
          seller: buyPrice.seller,
          price: buyPrice.price,
          auctionId: null,
          reservePrice: null,
        });
      } else {
        skipped.otherSeller += 1;
      }
    }

    for (const auction of auctions) {
      const candidate = candidatesByToken.get(tokenKey(auction));
      if (!candidate) continue;
      if (!addressesMatch(auction.seller, sellerAddress)) {
        skipped.otherSeller += 1;
      } else if (auction.status === "open" && !auction.highestBid) {
        targets.push({
          id: `${auction.chainId}:${auction.marketContract}:reserveAuction:${auction.auctionId}`,
          kind: "reserveAuction",
          chainId: auction.chainId,
          title: candidate.title,
          slug: candidate.slug,
          contractAddress: auction.nftContract,
          tokenId: auction.tokenId,
          marketContract: auction.marketContract,
          seller: auction.seller,
          price: null,
          auctionId: auction.auctionId,
          reservePrice: auction.reservePrice,
        });
      } else {
        skipped.biddingAuctions += 1;
      }
    }
  }

  return { targets, skipped };
}

function tokenKey(row: {
  chainId: number;
  contractAddress?: string;
  nftContract?: string;
  tokenId: string;
}) {
  return `${row.chainId}:${(row.nftContract ?? row.contractAddress ?? "").toLowerCase()}:${row.tokenId}`;
}

function addressesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
) {
  if (!a || !b) return false;
  try {
    return isAddressEqual(getAddress(a), getAddress(b));
  } catch {
    return false;
  }
}
