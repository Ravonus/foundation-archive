import { getAddress, isAddressEqual } from "viem";

import {
  BASE_CHAIN_ID,
  ETHEREUM_CHAIN_ID,
  FOUNDATION_PLATFORM_CONTRACTS,
  getRpcClient,
} from "~/server/archive/chains";
import type { PrismaClient } from "~/server/prisma-client";

import { NFT_MARKET_GETTERS_ABI } from "./abi";

type DatabaseClient = PrismaClient;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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

export async function readFoundationMarketIndexerStates(
  client: DatabaseClient,
) {
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

type GetTokenMarketStateOptions = {
  refreshMissingFromChain?: boolean;
};

export async function getTokenMarketState(
  client: DatabaseClient,
  identity: TokenIdentity,
  options: GetTokenMarketStateOptions = {},
): Promise<TokenMarketState> {
  let state = await loadStoredTokenMarketState(client, identity);
  if (
    options.refreshMissingFromChain &&
    !state.activeBuyPrice &&
    !state.liveAuction
  ) {
    await refreshTokenMarketStateFromChain(client, identity).catch(() => null);
    state = await loadStoredTokenMarketState(client, identity);
  }

  return state;
}

async function loadStoredTokenMarketState(
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
  const isRescuable =
    liveAuction?.status === "bidding" &&
    (liveAuction.endTime?.getTime() ?? Number.POSITIVE_INFINITY) <= now;

  return { activeBuyPrice, liveAuction, isRescuable };
}

async function refreshTokenMarketStateFromChain(
  client: DatabaseClient,
  identity: TokenIdentity,
) {
  const marketContracts = marketContractsForChain(identity.chainId);
  if (marketContracts.length === 0) return;

  const nftContract = getAddress(identity.nftContract);
  const tokenId = BigInt(identity.tokenId);
  const rpc = getRpcClient(identity.chainId);
  const latestBlock = Number(await rpc.getBlockNumber());

  await Promise.all(
    marketContracts.map(async (marketContract) => {
      try {
        const [buyPrice, auctionId] = await Promise.all([
          rpc.readContract({
            address: marketContract,
            abi: NFT_MARKET_GETTERS_ABI,
            functionName: "getBuyPrice",
            args: [nftContract, tokenId],
          }),
          rpc.readContract({
            address: marketContract,
            abi: NFT_MARKET_GETTERS_ABI,
            functionName: "getReserveAuctionIdFor",
            args: [nftContract, tokenId],
          }),
        ]);

        await Promise.all([
          persistLiveBuyPrice(client, {
            chainId: identity.chainId,
            marketContract,
            nftContract,
            tokenId,
            buyPrice,
            latestBlock,
          }),
          persistLiveAuction(client, {
            chainId: identity.chainId,
            marketContract,
            nftContract,
            tokenId,
            auctionId,
            latestBlock,
            readAuction: (id) =>
              rpc.readContract({
                address: marketContract,
                abi: NFT_MARKET_GETTERS_ABI,
                functionName: "getReserveAuction",
                args: [id],
              }),
          }),
        ]);
      } catch {
        // Some historical market anchors do not expose the same getter surface.
        // A miss here should not block the page from using another market.
      }
    }),
  );
}

function marketContractsForChain(chainId: number): `0x${string}`[] {
  if (chainId === ETHEREUM_CHAIN_ID) {
    return [
      getAddress(FOUNDATION_PLATFORM_CONTRACTS[ETHEREUM_CHAIN_ID].nftMarket),
      getAddress(
        FOUNDATION_PLATFORM_CONTRACTS[ETHEREUM_CHAIN_ID].nftDropMarket,
      ),
    ];
  }
  if (chainId === BASE_CHAIN_ID) {
    return [
      getAddress(FOUNDATION_PLATFORM_CONTRACTS[BASE_CHAIN_ID].nftMarket),
      getAddress(FOUNDATION_PLATFORM_CONTRACTS[BASE_CHAIN_ID].nftDropMarket),
    ];
  }
  return [];
}

async function persistLiveBuyPrice(
  client: DatabaseClient,
  input: {
    chainId: number;
    marketContract: `0x${string}`;
    nftContract: `0x${string}`;
    tokenId: bigint;
    buyPrice: readonly [`0x${string}`, bigint];
    latestBlock: number;
  },
) {
  const [seller, price] = input.buyPrice;
  if (isZeroAddress(seller)) return;

  const marketContract = lower(input.marketContract);
  const nftContract = lower(input.nftContract);
  const tokenId = input.tokenId.toString();
  await client.foundationBuyPrice.upsert({
    where: {
      chainId_marketContract_nftContract_tokenId: {
        chainId: input.chainId,
        marketContract,
        nftContract,
        tokenId,
      },
    },
    create: {
      chainId: input.chainId,
      marketContract,
      nftContract,
      tokenId,
      seller: lower(seller),
      price: price.toString(),
      status: "active",
      setBlock: input.latestBlock,
      updatedBlock: input.latestBlock,
    },
    update: {
      seller: lower(seller),
      price: price.toString(),
      status: "active",
      buyer: null,
      acceptedAt: null,
      acceptedTxHash: null,
      totalFees: null,
      creatorRev: null,
      sellerRev: null,
      updatedBlock: input.latestBlock,
    },
  });
}

async function persistLiveAuction(
  client: DatabaseClient,
  input: {
    chainId: number;
    marketContract: `0x${string}`;
    nftContract: `0x${string}`;
    tokenId: bigint;
    auctionId: bigint;
    latestBlock: number;
    readAuction: (auctionId: bigint) => Promise<{
      nftContract: `0x${string}`;
      tokenId: bigint;
      seller: `0x${string}`;
      duration: bigint;
      extensionDuration: bigint;
      endTime: bigint;
      bidder: `0x${string}`;
      amount: bigint;
    }>;
  },
) {
  if (input.auctionId === 0n) return;

  const auction = await input.readAuction(input.auctionId);
  if (
    !isAddressEqual(getAddress(auction.nftContract), input.nftContract) ||
    auction.tokenId !== input.tokenId ||
    isZeroAddress(auction.seller)
  ) {
    return;
  }

  const hasBid = !isZeroAddress(auction.bidder);
  const endTime =
    auction.endTime > 0n ? new Date(Number(auction.endTime) * 1000) : null;
  await client.foundationReserveAuction.upsert({
    where: {
      chainId_marketContract_auctionId: {
        chainId: input.chainId,
        marketContract: lower(input.marketContract),
        auctionId: input.auctionId.toString(),
      },
    },
    create: {
      chainId: input.chainId,
      marketContract: lower(input.marketContract),
      auctionId: input.auctionId.toString(),
      nftContract: lower(input.nftContract),
      tokenId: input.tokenId.toString(),
      seller: lower(auction.seller),
      reservePrice: auction.amount.toString(),
      duration: Number(auction.duration),
      extensionDuration: Number(auction.extensionDuration),
      highestBidder: hasBid ? lower(auction.bidder) : null,
      highestBid: hasBid ? auction.amount.toString() : null,
      endTime,
      status: hasBid ? "bidding" : "open",
      createdBlock: input.latestBlock,
    },
    update: {
      nftContract: lower(input.nftContract),
      tokenId: input.tokenId.toString(),
      seller: lower(auction.seller),
      reservePrice: auction.amount.toString(),
      duration: Number(auction.duration),
      extensionDuration: Number(auction.extensionDuration),
      highestBidder: hasBid ? lower(auction.bidder) : null,
      highestBid: hasBid ? auction.amount.toString() : null,
      endTime,
      status: hasBid ? "bidding" : "open",
    },
  });
}

function isZeroAddress(address: string) {
  return isAddressEqual(getAddress(address), ZERO_ADDRESS);
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
  artworks: Array<{
    chainId: number;
    contractAddress: string;
    tokenId: string;
  }>,
) {
  if (artworks.length === 0) {
    return {
      listedCount: 0,
      rescuableCount: 0,
      perToken: new Map<string, "listed" | "auction" | "rescuable">(),
    };
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
      row.status === "bidding" && row.endTime && row.endTime.getTime() <= now;
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
