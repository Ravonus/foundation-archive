import type {
  ArtworkGridItem,
  ArtworkMarketState,
} from "~/app/_components/artwork-grid";
import type { PrismaClient } from "~/server/prisma-client";

import { summarizeMarketStateForArtworks } from "./queries";

type DatabaseClient = PrismaClient;

function tokenKeyFor(item: ArtworkGridItem) {
  return `${item.chainId}:${item.contractAddress.toLowerCase()}:${item.tokenId}`;
}

export async function attachMarketStateToGridItems(
  client: DatabaseClient,
  items: ArtworkGridItem[],
): Promise<ArtworkGridItem[]> {
  if (items.length === 0) return items;

  const summary = await summarizeMarketStateForArtworks(
    client,
    items.map((item) => ({
      chainId: item.chainId,
      contractAddress: item.contractAddress,
      tokenId: item.tokenId,
    })),
  );

  const perToken = summary.perToken as Map<string, ArtworkMarketState>;

  return items.map((item) => ({
    ...item,
    marketState: perToken.get(tokenKeyFor(item)) ?? null,
  }));
}

export type ProfileMarketSummary = {
  listedCount: number;
  rescuableCount: number;
};

export async function summarizeProfileMarketState(
  client: DatabaseClient,
  items: ArtworkGridItem[],
): Promise<ProfileMarketSummary> {
  if (items.length === 0) {
    return { listedCount: 0, rescuableCount: 0 };
  }

  const summary = await summarizeMarketStateForArtworks(
    client,
    items.map((item) => ({
      chainId: item.chainId,
      contractAddress: item.contractAddress,
      tokenId: item.tokenId,
    })),
  );

  return {
    listedCount: summary.listedCount,
    rescuableCount: summary.rescuableCount,
  };
}
