import type { PrismaClient } from "~/server/prisma-client";

type DatabaseClient = PrismaClient;

export type TokenIdentity = {
  chainId: number;
  nftContract: string;
  tokenId: string;
};

function lower(address: string) {
  return address.toLowerCase();
}

export async function listRescuableReserveAuctions(
  client: DatabaseClient,
  options: { limit?: number; chainId?: number } = {},
) {
  const limit = options.limit ?? 100;
  const now = new Date();

  return client.foundationReserveAuction.findMany({
    where: {
      status: "bidding",
      endTime: { lte: now, not: null },
      ...(options.chainId === undefined ? {} : { chainId: options.chainId }),
    },
    orderBy: [{ endTime: "asc" }],
    take: limit,
  });
}

export async function listActiveBuyPrices(
  client: DatabaseClient,
  options: { limit?: number; chainId?: number } = {},
) {
  const limit = options.limit ?? 100;

  return client.foundationBuyPrice.findMany({
    where: {
      status: "active",
      ...(options.chainId === undefined ? {} : { chainId: options.chainId }),
    },
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
  });
}

export async function readFoundationMarketIndexerStates(client: DatabaseClient) {
  return client.foundationMarketIndexerState.findMany({
    orderBy: [{ chainId: "asc" }, { marketKind: "asc" }],
  });
}

export type TokenMarketState = {
  activeBuyPrice: Awaited<
    ReturnType<DatabaseClient["foundationBuyPrice"]["findFirst"]>
  > | null;
  liveAuction: Awaited<
    ReturnType<DatabaseClient["foundationReserveAuction"]["findFirst"]>
  > | null;
  isRescuable: boolean;
};

export async function getTokenMarketState(
  client: DatabaseClient,
  identity: TokenIdentity,
): Promise<TokenMarketState> {
  const where = {
    chainId: identity.chainId,
    nftContract: lower(identity.nftContract),
    tokenId: identity.tokenId,
  };

  const [activeBuyPrice, liveAuction] = await Promise.all([
    client.foundationBuyPrice.findFirst({
      where: { ...where, status: "active" },
      orderBy: { updatedAt: "desc" },
    }),
    client.foundationReserveAuction.findFirst({
      where: {
        ...where,
        status: { in: ["open", "bidding"] },
      },
      orderBy: { createdBlock: "desc" },
    }),
  ]);

  const now = Date.now();
  const isRescuable = Boolean(
    liveAuction &&
      liveAuction.status === "bidding" &&
      liveAuction.endTime &&
      liveAuction.endTime.getTime() <= now,
  );

  return { activeBuyPrice, liveAuction, isRescuable };
}

export async function listTokenMarketHistory(
  client: DatabaseClient,
  identity: TokenIdentity,
  options: { limit?: number } = {},
) {
  const limit = options.limit ?? 50;

  return client.foundationMarketEvent.findMany({
    where: {
      chainId: identity.chainId,
      nftContract: lower(identity.nftContract),
      tokenId: identity.tokenId,
    },
    orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }],
    take: limit,
  });
}

export async function summarizeMarketStateForArtworks(
  client: DatabaseClient,
  artworks: Array<{ chainId: number; contractAddress: string; tokenId: string }>,
) {
  if (artworks.length === 0) {
    return { listedCount: 0, rescuableCount: 0, perToken: new Map<string, "listed" | "auction" | "rescuable">() };
  }

  const tokenKeys = artworks.map(
    (a) => `${a.chainId}:${lower(a.contractAddress)}:${a.tokenId}`,
  );

  const [buyPrices, auctions] = await Promise.all([
    client.foundationBuyPrice.findMany({
      where: {
        status: "active",
        OR: artworks.map((a) => ({
          chainId: a.chainId,
          nftContract: lower(a.contractAddress),
          tokenId: a.tokenId,
        })),
      },
      select: { chainId: true, nftContract: true, tokenId: true },
    }),
    client.foundationReserveAuction.findMany({
      where: {
        status: { in: ["open", "bidding"] },
        OR: artworks.map((a) => ({
          chainId: a.chainId,
          nftContract: lower(a.contractAddress),
          tokenId: a.tokenId,
        })),
      },
      select: {
        chainId: true,
        nftContract: true,
        tokenId: true,
        status: true,
        endTime: true,
      },
    }),
  ]);

  const now = Date.now();
  const perToken = new Map<string, "listed" | "auction" | "rescuable">();

  for (const row of buyPrices) {
    perToken.set(`${row.chainId}:${row.nftContract}:${row.tokenId}`, "listed");
  }
  for (const row of auctions) {
    const key = `${row.chainId}:${row.nftContract}:${row.tokenId}`;
    const isRescuable =
      row.status === "bidding" &&
      row.endTime &&
      row.endTime.getTime() <= now;
    perToken.set(key, isRescuable ? "rescuable" : "auction");
  }

  let listedCount = 0;
  let rescuableCount = 0;
  for (const tokenKey of tokenKeys) {
    const state = perToken.get(tokenKey);
    if (state === "listed" || state === "auction") listedCount += 1;
    if (state === "rescuable") {
      listedCount += 1;
      rescuableCount += 1;
    }
  }

  return { listedCount, rescuableCount, perToken };
}
