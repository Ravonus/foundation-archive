import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddressEqual } from "viem";

import {
  type ArtistMarketCandidate,
  hydrateProfileFromCache,
  loadArtistMarketCandidates,
  resolveProfileFromKey,
} from "~/app/profile/[profile]/_data";
import { getTokenMarketState } from "~/server/archive/foundation-market";
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

const MARKET_REFRESH_CONCURRENCY = 4;

export async function GET(_request: NextRequest, context: RouteContext) {
  const { profile } = await context.params;
  const key = decodeURIComponent(profile).trim();
  const initialProfile = await resolveProfileFromKey(key);
  const resolved = await hydrateProfileFromCache(initialProfile);
  const candidates = await loadArtistMarketCandidates({
    accountAddress: resolved.accountAddress,
    username: resolved.username,
  });

  const targets: BulkDelistTarget[] = [];
  const skipped: SkippedCounts = {
    biddingAuctions: 0,
    otherSeller: 0,
    errors: 0,
  };

  for (
    let index = 0;
    index < candidates.length;
    index += MARKET_REFRESH_CONCURRENCY
  ) {
    const batch = candidates.slice(index, index + MARKET_REFRESH_CONCURRENCY);
    const resolvedBatch = await Promise.all(
      batch.map((candidate) =>
        findCandidateDelistTargets(candidate, resolved.accountAddress),
      ),
    );
    for (const result of resolvedBatch) {
      targets.push(...result.targets);
      skipped.biddingAuctions += result.skipped.biddingAuctions;
      skipped.otherSeller += result.skipped.otherSeller;
      skipped.errors += result.skipped.errors;
    }
  }

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

async function findCandidateDelistTargets(
  candidate: ArtistMarketCandidate,
  sellerAddress: string,
): Promise<{ targets: BulkDelistTarget[]; skipped: SkippedCounts }> {
  const skipped: SkippedCounts = {
    biddingAuctions: 0,
    otherSeller: 0,
    errors: 0,
  };

  try {
    const state = await getTokenMarketState(
      db,
      {
        chainId: candidate.chainId,
        nftContract: candidate.contractAddress,
        tokenId: candidate.tokenId,
      },
      { refreshFromChain: true },
    );

    const targets: BulkDelistTarget[] = [];
    if (state.activeBuyPrice) {
      if (addressesMatch(state.activeBuyPrice.seller, sellerAddress)) {
        targets.push({
          id: `${state.activeBuyPrice.chainId}:${state.activeBuyPrice.marketContract}:buyPrice:${state.activeBuyPrice.nftContract}:${state.activeBuyPrice.tokenId}`,
          kind: "buyPrice",
          chainId: state.activeBuyPrice.chainId,
          title: candidate.title,
          slug: candidate.slug,
          contractAddress: state.activeBuyPrice.nftContract,
          tokenId: state.activeBuyPrice.tokenId,
          marketContract: state.activeBuyPrice.marketContract,
          seller: state.activeBuyPrice.seller,
          price: state.activeBuyPrice.price,
          auctionId: null,
          reservePrice: null,
        });
      } else {
        skipped.otherSeller += 1;
      }
    }

    if (state.liveAuction) {
      if (!addressesMatch(state.liveAuction.seller, sellerAddress)) {
        skipped.otherSeller += 1;
      } else if (
        state.liveAuction.status === "open" &&
        !state.liveAuction.highestBid
      ) {
        targets.push({
          id: `${state.liveAuction.chainId}:${state.liveAuction.marketContract}:reserveAuction:${state.liveAuction.auctionId}`,
          kind: "reserveAuction",
          chainId: state.liveAuction.chainId,
          title: candidate.title,
          slug: candidate.slug,
          contractAddress: state.liveAuction.nftContract,
          tokenId: state.liveAuction.tokenId,
          marketContract: state.liveAuction.marketContract,
          seller: state.liveAuction.seller,
          price: null,
          auctionId: state.liveAuction.auctionId,
          reservePrice: state.liveAuction.reservePrice,
        });
      } else {
        skipped.biddingAuctions += 1;
      }
    }

    return { targets, skipped };
  } catch {
    skipped.errors += 1;
    return { targets: [], skipped };
  }
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
