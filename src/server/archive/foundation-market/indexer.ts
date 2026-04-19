import { getAddress } from "viem";

import {
  BASE_CHAIN_ID,
  ETHEREUM_CHAIN_ID,
  FOUNDATION_PLATFORM_CONTRACTS,
  chainLabel,
  getRpcClient,
} from "~/server/archive/chains";
import { emitArchiveEvent } from "~/server/archive/live-events";
import type { PrismaClient } from "~/server/prisma-client";

import { NFT_MARKET_EVENTS } from "./abi";

type DatabaseClient = PrismaClient;

type IndexerState = Awaited<
  ReturnType<DatabaseClient["foundationMarketIndexerState"]["findFirstOrThrow"]>
>;

type MarketKind = "nftMarket" | "nftDropMarket";

type MarketTarget = {
  chainId: number;
  kind: MarketKind;
  address: string;
};

type EventContext = {
  client: DatabaseClient;
  chainId: number;
  marketContract: string;
  blockNumber: number;
  txHash: string;
};

const FOUNDATION_MARKET_TARGETS: MarketTarget[] = [
  {
    chainId: ETHEREUM_CHAIN_ID,
    kind: "nftMarket",
    address: FOUNDATION_PLATFORM_CONTRACTS[ETHEREUM_CHAIN_ID].nftMarket,
  },
  {
    chainId: ETHEREUM_CHAIN_ID,
    kind: "nftDropMarket",
    address: FOUNDATION_PLATFORM_CONTRACTS[ETHEREUM_CHAIN_ID].nftDropMarket,
  },
  {
    chainId: BASE_CHAIN_ID,
    kind: "nftMarket",
    address: FOUNDATION_PLATFORM_CONTRACTS[BASE_CHAIN_ID].nftMarket,
  },
  {
    chainId: BASE_CHAIN_ID,
    kind: "nftDropMarket",
    address: FOUNDATION_PLATFORM_CONTRACTS[BASE_CHAIN_ID].nftDropMarket,
  },
];

function lower(address: string) {
  return address.toLowerCase();
}

export async function ensureFoundationMarketIndexerStates(
  client: DatabaseClient,
) {
  for (const target of FOUNDATION_MARKET_TARGETS) {
    const marketContract = lower(target.address);
    const existing = await client.foundationMarketIndexerState.findUnique({
      where: {
        chainId_marketContract: {
          chainId: target.chainId,
          marketContract,
        },
      },
    });
    if (existing) continue;

    let seedBlock = 0;
    try {
      const rpc = getRpcClient(target.chainId);
      seedBlock = Number(await rpc.getBlockNumber());
    } catch {
      // RPC may be unavailable at seed time; default to 0 and let the first
      // tick after RPC is configured advance the checkpoint.
      seedBlock = 0;
    }

    await client.foundationMarketIndexerState.create({
      data: {
        chainId: target.chainId,
        marketContract,
        marketKind: target.kind,
        scanFromBlock: seedBlock,
        nextFromBlock: seedBlock,
      },
    });
  }
}

export async function runFoundationMarketIndexerTick(client: DatabaseClient) {
  await ensureFoundationMarketIndexerStates(client);

  const states = await client.foundationMarketIndexerState.findMany({
    orderBy: [{ lastRunFinishedAt: "asc" }, { updatedAt: "asc" }],
  });

  let scannedRanges = 0;
  let processedEvents = 0;

  for (const state of states) {
    const result = await runMarketIndexerForState(client, state);
    if (!result) continue;
    scannedRanges += 1;
    processedEvents += result.eventCount;
  }

  return { scannedRanges, processedEvents };
}

async function runMarketIndexerForState(
  client: DatabaseClient,
  state: IndexerState,
) {
  const runStartedAt = new Date();

  let latestBlock: number;
  try {
    const rpc = getRpcClient(state.chainId);
    latestBlock = Number(await rpc.getBlockNumber());
  } catch (error) {
    await recordIndexerFailure(client, state, runStartedAt, error);
    return null;
  }

  if (state.nextFromBlock > latestBlock) {
    await client.foundationMarketIndexerState.update({
      where: { id: state.id },
      data: {
        lastRunStartedAt: runStartedAt,
        lastRunFinishedAt: new Date(),
        lastEventCount: 0,
        lastError: null,
      },
    });
    return { eventCount: 0 };
  }

  const fromBlock = state.nextFromBlock;
  const toBlock = Math.min(
    fromBlock + state.blockWindowSize - 1,
    latestBlock,
  );

  try {
    const rpc = getRpcClient(state.chainId);
    const logs = await rpc.getLogs({
      address: getAddress(state.marketContract),
      events: NFT_MARKET_EVENTS,
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock),
    });

    logs.sort((left, right) => {
      const blockDiff = Number(left.blockNumber - right.blockNumber);
      if (blockDiff !== 0) return blockDiff;
      return left.logIndex - right.logIndex;
    });

    for (const log of logs) {
      await dispatchMarketLog(client, state, log);
    }

    await client.foundationMarketIndexerState.update({
      where: { id: state.id },
      data: {
        nextFromBlock: toBlock + 1,
        lastScannedBlock: toBlock,
        lastRunStartedAt: runStartedAt,
        lastRunFinishedAt: new Date(),
        lastEventCount: logs.length,
        lastError: null,
      },
    });

    if (logs.length > 0) {
      await emitArchiveEvent(client, {
        type: "market-indexer.scan-progress",
        summary: `${chainLabel(state.chainId)} ${state.marketKind} indexer ingested ${logs.length} event${logs.length === 1 ? "" : "s"} from blocks ${fromBlock}-${toBlock}.`,
        data: {
          chainId: state.chainId,
          marketContract: state.marketContract,
          marketKind: state.marketKind,
          fromBlock,
          toBlock,
          eventCount: logs.length,
        },
      });
    }

    return { eventCount: logs.length };
  } catch (error) {
    await recordIndexerFailure(client, state, runStartedAt, error);
    return null;
  }
}

async function recordIndexerFailure(
  client: DatabaseClient,
  state: IndexerState,
  runStartedAt: Date,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : "unknown indexer failure";
  await client.foundationMarketIndexerState.update({
    where: { id: state.id },
    data: {
      lastRunStartedAt: runStartedAt,
      lastRunFinishedAt: new Date(),
      lastError: message,
    },
  });
  await emitArchiveEvent(client, {
    type: "market-indexer.scan-failed",
    summary: `${chainLabel(state.chainId)} ${state.marketKind} indexer scan failed: ${message}`,
    data: {
      chainId: state.chainId,
      marketContract: state.marketContract,
      marketKind: state.marketKind,
      error: message,
    },
  });
}

type MarketLog = {
  eventName?: string;
  args?: unknown;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: string | null;
};

async function dispatchMarketLog(
  client: DatabaseClient,
  state: IndexerState,
  log: MarketLog,
) {
  if (!log.eventName) return;

  const ctx: EventContext = {
    client,
    chainId: state.chainId,
    marketContract: state.marketContract,
    blockNumber: Number(log.blockNumber),
    txHash: log.transactionHash ?? "",
  };

  await persistMarketEventLog(state, log, ctx);

  switch (log.eventName) {
    case "ReserveAuctionCreated":
      return handleReserveAuctionCreated(ctx, log.args as ReserveAuctionCreatedArgs);
    case "ReserveAuctionBidPlaced":
      return handleReserveAuctionBidPlaced(ctx, log.args as ReserveAuctionBidPlacedArgs);
    case "ReserveAuctionFinalized":
      return handleReserveAuctionFinalized(ctx, log.args as ReserveAuctionFinalizedArgs);
    case "ReserveAuctionCanceled":
      return handleReserveAuctionCanceled(ctx, log.args as ReserveAuctionCanceledArgs);
    case "ReserveAuctionInvalidated":
      return handleReserveAuctionInvalidated(ctx, log.args as ReserveAuctionInvalidatedArgs);
    case "ReserveAuctionUpdated":
      return handleReserveAuctionUpdated(ctx, log.args as ReserveAuctionUpdatedArgs);
    case "BuyPriceSet":
      return handleBuyPriceSet(ctx, log.args as BuyPriceSetArgs);
    case "BuyPriceAccepted":
      return handleBuyPriceAccepted(ctx, log.args as BuyPriceAcceptedArgs);
    case "BuyPriceCanceled":
      return handleBuyPriceCanceled(ctx, log.args as BuyPriceCanceledArgs);
    case "BuyPriceInvalidated":
      return handleBuyPriceInvalidated(ctx, log.args as BuyPriceInvalidatedArgs);
    default:
      return undefined;
  }
}

async function persistMarketEventLog(
  state: IndexerState,
  log: MarketLog,
  ctx: EventContext,
) {
  const args = (log.args ?? {}) as Record<string, unknown>;
  const projection = projectMarketEvent(log.eventName ?? "", args);
  const enriched = await enrichWithTokenIfMissing(ctx, projection);

  try {
    await ctx.client.foundationMarketEvent.create({
      data: {
        chainId: ctx.chainId,
        marketContract: ctx.marketContract,
        marketKind: state.marketKind,
        eventName: log.eventName ?? "",
        blockNumber: ctx.blockNumber,
        logIndex: log.logIndex,
        txHash: ctx.txHash,
        nftContract: enriched.nftContract,
        tokenId: enriched.tokenId,
        auctionId: enriched.auctionId,
        actorAddress: enriched.actorAddress,
        amount: enriched.amount,
        payload: JSON.stringify(args, (_key, value) =>
          typeof value === "bigint" ? value.toString() : value,
        ),
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      /Unique constraint|duplicate key/.test(error.message)
    ) {
      return;
    }
    throw error;
  }
}

async function enrichWithTokenIfMissing(
  ctx: EventContext,
  projection: EventProjection,
): Promise<EventProjection> {
  if (projection.nftContract && projection.tokenId) return projection;
  if (!projection.auctionId) return projection;

  const auction = await ctx.client.foundationReserveAuction.findUnique({
    where: {
      chainId_marketContract_auctionId: {
        chainId: ctx.chainId,
        marketContract: ctx.marketContract,
        auctionId: projection.auctionId,
      },
    },
    select: { nftContract: true, tokenId: true },
  });

  if (!auction) return projection;

  return {
    ...projection,
    nftContract: auction.nftContract,
    tokenId: auction.tokenId,
  };
}

type EventProjection = {
  nftContract: string | null;
  tokenId: string | null;
  auctionId: string | null;
  actorAddress: string | null;
  amount: string | null;
};

function projectMarketEvent(
  eventName: string,
  args: Record<string, unknown>,
): EventProjection {
  const optional = (key: string) =>
    args[key] === undefined || args[key] === null
      ? null
      : String(args[key]);
  const optionalLower = (key: string) => {
    const value = optional(key);
    return value ? value.toLowerCase() : null;
  };

  switch (eventName) {
    case "ReserveAuctionCreated":
      return {
        nftContract: optionalLower("nftContract"),
        tokenId: optional("tokenId"),
        auctionId: optional("auctionId"),
        actorAddress: optionalLower("seller"),
        amount: optional("reservePrice"),
      };
    case "ReserveAuctionBidPlaced":
      return {
        nftContract: null,
        tokenId: null,
        auctionId: optional("auctionId"),
        actorAddress: optionalLower("bidder"),
        amount: optional("amount"),
      };
    case "ReserveAuctionFinalized":
      return {
        nftContract: null,
        tokenId: null,
        auctionId: optional("auctionId"),
        actorAddress: optionalLower("bidder"),
        amount: optional("sellerRev"),
      };
    case "ReserveAuctionCanceled":
    case "ReserveAuctionInvalidated":
      return {
        nftContract: null,
        tokenId: null,
        auctionId: optional("auctionId"),
        actorAddress: null,
        amount: null,
      };
    case "ReserveAuctionUpdated":
      return {
        nftContract: null,
        tokenId: null,
        auctionId: optional("auctionId"),
        actorAddress: null,
        amount: optional("reservePrice"),
      };
    case "BuyPriceSet":
      return {
        nftContract: optionalLower("nftContract"),
        tokenId: optional("tokenId"),
        auctionId: null,
        actorAddress: optionalLower("seller"),
        amount: optional("price"),
      };
    case "BuyPriceAccepted":
      return {
        nftContract: optionalLower("nftContract"),
        tokenId: optional("tokenId"),
        auctionId: null,
        actorAddress: optionalLower("buyer"),
        amount: optional("sellerRev"),
      };
    case "BuyPriceCanceled":
    case "BuyPriceInvalidated":
      return {
        nftContract: optionalLower("nftContract"),
        tokenId: optional("tokenId"),
        auctionId: null,
        actorAddress: null,
        amount: null,
      };
    default:
      return {
        nftContract: null,
        tokenId: null,
        auctionId: null,
        actorAddress: null,
        amount: null,
      };
  }
}

type ReserveAuctionCreatedArgs = {
  seller: string;
  nftContract: string;
  tokenId: bigint;
  duration: bigint;
  extensionDuration: bigint;
  reservePrice: bigint;
  auctionId: bigint;
};

type ReserveAuctionBidPlacedArgs = {
  auctionId: bigint;
  bidder: string;
  amount: bigint;
  endTime: bigint;
};

type ReserveAuctionFinalizedArgs = {
  auctionId: bigint;
  seller: string;
  bidder: string;
  totalFees: bigint;
  creatorRev: bigint;
  sellerRev: bigint;
};

type ReserveAuctionCanceledArgs = { auctionId: bigint };
type ReserveAuctionInvalidatedArgs = { auctionId: bigint };

type ReserveAuctionUpdatedArgs = {
  auctionId: bigint;
  reservePrice: bigint;
};

type BuyPriceSetArgs = {
  nftContract: string;
  tokenId: bigint;
  seller: string;
  price: bigint;
};

type BuyPriceAcceptedArgs = {
  nftContract: string;
  tokenId: bigint;
  seller: string;
  buyer: string;
  totalFees: bigint;
  creatorRev: bigint;
  sellerRev: bigint;
};

type BuyPriceCanceledArgs = { nftContract: string; tokenId: bigint };
type BuyPriceInvalidatedArgs = { nftContract: string; tokenId: bigint };

async function handleReserveAuctionCreated(
  ctx: EventContext,
  args: ReserveAuctionCreatedArgs,
) {
  const auctionId = args.auctionId.toString();
  await ctx.client.foundationReserveAuction.upsert({
    where: {
      chainId_marketContract_auctionId: {
        chainId: ctx.chainId,
        marketContract: ctx.marketContract,
        auctionId,
      },
    },
    create: {
      chainId: ctx.chainId,
      marketContract: ctx.marketContract,
      auctionId,
      nftContract: lower(args.nftContract),
      tokenId: args.tokenId.toString(),
      seller: lower(args.seller),
      reservePrice: args.reservePrice.toString(),
      duration: Number(args.duration),
      extensionDuration: Number(args.extensionDuration),
      status: "open",
      createdBlock: ctx.blockNumber,
    },
    update: {
      nftContract: lower(args.nftContract),
      tokenId: args.tokenId.toString(),
      seller: lower(args.seller),
      reservePrice: args.reservePrice.toString(),
      duration: Number(args.duration),
      extensionDuration: Number(args.extensionDuration),
      status: "open",
      createdBlock: ctx.blockNumber,
    },
  });
}

async function handleReserveAuctionBidPlaced(
  ctx: EventContext,
  args: ReserveAuctionBidPlacedArgs,
) {
  await ctx.client.foundationReserveAuction.updateMany({
    where: {
      chainId: ctx.chainId,
      marketContract: ctx.marketContract,
      auctionId: args.auctionId.toString(),
    },
    data: {
      highestBidder: lower(args.bidder),
      highestBid: args.amount.toString(),
      endTime: new Date(Number(args.endTime) * 1000),
      status: "bidding",
    },
  });
}

async function handleReserveAuctionFinalized(
  ctx: EventContext,
  args: ReserveAuctionFinalizedArgs,
) {
  await ctx.client.foundationReserveAuction.updateMany({
    where: {
      chainId: ctx.chainId,
      marketContract: ctx.marketContract,
      auctionId: args.auctionId.toString(),
    },
    data: {
      highestBidder: lower(args.bidder),
      seller: lower(args.seller),
      status: "finalized",
      finalizedBlock: ctx.blockNumber,
      finalizedTxHash: ctx.txHash,
      finalizedTotalFees: args.totalFees.toString(),
      finalizedCreatorRev: args.creatorRev.toString(),
      finalizedSellerRev: args.sellerRev.toString(),
    },
  });
}

async function handleReserveAuctionCanceled(
  ctx: EventContext,
  args: ReserveAuctionCanceledArgs,
) {
  await ctx.client.foundationReserveAuction.updateMany({
    where: {
      chainId: ctx.chainId,
      marketContract: ctx.marketContract,
      auctionId: args.auctionId.toString(),
    },
    data: { status: "canceled" },
  });
}

async function handleReserveAuctionInvalidated(
  ctx: EventContext,
  args: ReserveAuctionInvalidatedArgs,
) {
  await ctx.client.foundationReserveAuction.updateMany({
    where: {
      chainId: ctx.chainId,
      marketContract: ctx.marketContract,
      auctionId: args.auctionId.toString(),
    },
    data: { status: "invalidated" },
  });
}

async function handleReserveAuctionUpdated(
  ctx: EventContext,
  args: ReserveAuctionUpdatedArgs,
) {
  await ctx.client.foundationReserveAuction.updateMany({
    where: {
      chainId: ctx.chainId,
      marketContract: ctx.marketContract,
      auctionId: args.auctionId.toString(),
    },
    data: { reservePrice: args.reservePrice.toString() },
  });
}

async function handleBuyPriceSet(ctx: EventContext, args: BuyPriceSetArgs) {
  const nftContract = lower(args.nftContract);
  const tokenId = args.tokenId.toString();
  await ctx.client.foundationBuyPrice.upsert({
    where: {
      chainId_marketContract_nftContract_tokenId: {
        chainId: ctx.chainId,
        marketContract: ctx.marketContract,
        nftContract,
        tokenId,
      },
    },
    create: {
      chainId: ctx.chainId,
      marketContract: ctx.marketContract,
      nftContract,
      tokenId,
      seller: lower(args.seller),
      price: args.price.toString(),
      status: "active",
      setBlock: ctx.blockNumber,
      updatedBlock: ctx.blockNumber,
    },
    update: {
      seller: lower(args.seller),
      price: args.price.toString(),
      status: "active",
      buyer: null,
      acceptedAt: null,
      acceptedTxHash: null,
      totalFees: null,
      creatorRev: null,
      sellerRev: null,
      setBlock: ctx.blockNumber,
      updatedBlock: ctx.blockNumber,
    },
  });
}

async function handleBuyPriceAccepted(
  ctx: EventContext,
  args: BuyPriceAcceptedArgs,
) {
  await ctx.client.foundationBuyPrice.updateMany({
    where: {
      chainId: ctx.chainId,
      marketContract: ctx.marketContract,
      nftContract: lower(args.nftContract),
      tokenId: args.tokenId.toString(),
    },
    data: {
      seller: lower(args.seller),
      buyer: lower(args.buyer),
      status: "accepted",
      acceptedAt: new Date(),
      acceptedTxHash: ctx.txHash,
      totalFees: args.totalFees.toString(),
      creatorRev: args.creatorRev.toString(),
      sellerRev: args.sellerRev.toString(),
      updatedBlock: ctx.blockNumber,
    },
  });
}

async function handleBuyPriceCanceled(
  ctx: EventContext,
  args: BuyPriceCanceledArgs,
) {
  await ctx.client.foundationBuyPrice.updateMany({
    where: {
      chainId: ctx.chainId,
      marketContract: ctx.marketContract,
      nftContract: lower(args.nftContract),
      tokenId: args.tokenId.toString(),
    },
    data: {
      status: "canceled",
      updatedBlock: ctx.blockNumber,
    },
  });
}

async function handleBuyPriceInvalidated(
  ctx: EventContext,
  args: BuyPriceInvalidatedArgs,
) {
  await ctx.client.foundationBuyPrice.updateMany({
    where: {
      chainId: ctx.chainId,
      marketContract: ctx.marketContract,
      nftContract: lower(args.nftContract),
      tokenId: args.tokenId.toString(),
    },
    data: {
      status: "invalidated",
      updatedBlock: ctx.blockNumber,
    },
  });
}
