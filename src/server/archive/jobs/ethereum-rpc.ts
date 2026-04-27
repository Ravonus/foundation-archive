import { getAddress, parseAbiItem } from "viem";

import { getRpcClient } from "~/server/archive/chains";

const TOKEN_CREATOR_ABI = [
  parseAbiItem("function tokenCreator(uint256 tokenId) view returns (address)"),
  parseAbiItem(
    "function getTokenCreatorPaymentAddress(uint256 tokenId) view returns (address)",
  ),
];

export async function resolveTokenUriFromContract(input: {
  chainId: number;
  contractAddress: string;
  tokenId: string;
}) {
  const rpc = getRpcClient(input.chainId);

  return rpc.readContract({
    address: getAddress(input.contractAddress),
    abi: [
      parseAbiItem("function tokenURI(uint256 tokenId) view returns (string)"),
    ],
    functionName: "tokenURI",
    args: [BigInt(input.tokenId)],
  });
}

export async function resolveTokenCreatorFromContract(input: {
  chainId: number;
  contractAddress: string;
  tokenId: string;
}) {
  const rpc = getRpcClient(input.chainId);
  const address = getAddress(input.contractAddress);
  const tokenId = BigInt(input.tokenId);

  for (const abiItem of TOKEN_CREATOR_ABI) {
    try {
      const creator = await rpc.readContract({
        address,
        abi: [abiItem],
        functionName: abiItem.name,
        args: [tokenId],
      });

      return getAddress(creator).toLowerCase();
    } catch {
      // Not all ERC-721s expose Foundation creator helpers.
    }
  }

  return null;
}

export async function discoverTokenIdsFromLogs(input: {
  chainId: number;
  contractAddress: string;
  fromBlock: number;
  toBlock?: number;
}) {
  const client = getRpcClient(input.chainId);

  const logs = await client.getLogs({
    address: getAddress(input.contractAddress),
    event: parseAbiItem(
      "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    ),
    fromBlock: BigInt(input.fromBlock),
    toBlock: input.toBlock ? BigInt(input.toBlock) : undefined,
  });

  const tokenIds = new Set<string>();

  for (const log of logs) {
    const tokenId = log.args.tokenId;
    if (tokenId !== undefined) {
      tokenIds.add(tokenId.toString());
    }
  }

  return Array.from(tokenIds).sort(
    (left, right) => Number(left) - Number(right),
  );
}
