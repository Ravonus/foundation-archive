import { createPublicClient, http } from "viem";
import { base, mainnet } from "viem/chains";

import { env } from "~/env";

export const ETHEREUM_CHAIN_ID = 1;
export const BASE_CHAIN_ID = 8453;

export const SUPPORTED_CHAIN_IDS = [
  ETHEREUM_CHAIN_ID,
  BASE_CHAIN_ID,
] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

export function isSupportedChainId(
  chainId: number,
): chainId is SupportedChainId {
  return (SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId);
}

export function chainLabel(chainId: number): string {
  if (chainId === ETHEREUM_CHAIN_ID) return "Ethereum Mainnet";
  if (chainId === BASE_CHAIN_ID) return "Base";
  return `Chain ${chainId}`;
}

export function chainSlug(chainId: number): "eth" | "base" {
  return chainId === BASE_CHAIN_ID ? "base" : "eth";
}

function rpcEnvNameFor(chainId: number): "BASE_RPC_URL" | "ETHEREUM_RPC_URL" {
  return chainId === BASE_CHAIN_ID ? "BASE_RPC_URL" : "ETHEREUM_RPC_URL";
}

function rpcUrlFor(chainId: number): string | undefined {
  if (chainId === BASE_CHAIN_ID) return env.BASE_RPC_URL;
  if (chainId === ETHEREUM_CHAIN_ID) return env.ETHEREUM_RPC_URL;
  return undefined;
}

function viemChainFor(chainId: number) {
  return chainId === BASE_CHAIN_ID ? base : mainnet;
}

export function getRpcClient(chainId: number) {
  const rpcUrl = rpcUrlFor(chainId);
  if (!rpcUrl) {
    throw new Error(
      `${rpcEnvNameFor(chainId)} is required for ${chainLabel(chainId)} RPC reads (token URIs, block scans).`,
    );
  }

  return createPublicClient({
    chain: viemChainFor(chainId),
    transport: http(rpcUrl),
  });
}

// Foundation platform anchors per chain (sourced 2026-04-18 from foundation.app production bundle).
export const FOUNDATION_PLATFORM_CONTRACTS = {
  [ETHEREUM_CHAIN_ID]: {
    nft721: "0x3b3ee1931dc30c1957379fac9aba94d1c48a5405",
    nftMarket: "0xcda72070e455bb31c7690a170224ce43623d0b6f",
    nftDropMarket: "0x53f451165ba6fdbe39a134673d13948261b2334a",
    nftCollectionFactoryV2: "0x612e2daddc89d91409e40f946f9f7cfe422e777e",
    nftMarketRouter: "0x762340b8a40cdd5bfc3edd94265899fda345d0e3",
  },
  [BASE_CHAIN_ID]: {
    nftMarket: "0x7b503e206db34148ad77e00afe214034edf9e3ff",
    nftDropMarket: "0x62037b26fff91929655aa3a060f327b47d1e2b3e",
    nftCollectionFactoryV2: "0xf1814213a5ef856aaa1fdb0f7f375569168d8e73",
    nftMarketRouter: "0xfee588791cda1d01ccfc80b51efa00c0be5b129e",
  },
} as const;
