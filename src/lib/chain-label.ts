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

export function chainShortLabel(chainId: number): string {
  if (chainId === ETHEREUM_CHAIN_ID) return "ETH";
  if (chainId === BASE_CHAIN_ID) return "Base";
  return `#${chainId}`;
}

export function chainSlug(chainId: number): "eth" | "base" {
  return chainId === BASE_CHAIN_ID ? "base" : "eth";
}

export function chainExplorerAddressUrl(
  chainId: number,
  address: string,
): string {
  if (chainId === BASE_CHAIN_ID) {
    return `https://basescan.org/address/${address}`;
  }
  return `https://etherscan.io/address/${address}`;
}
