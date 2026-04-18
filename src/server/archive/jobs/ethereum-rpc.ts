import { env } from "~/env";
import { createPublicClient, getAddress, http, parseAbiItem } from "viem";

export function getEthereumClient() {
  if (!env.ETHEREUM_RPC_URL) {
    throw new Error(
      "ETHEREUM_RPC_URL is required for contract-driven scans and token metadata lookup.",
    );
  }

  return createPublicClient({
    transport: http(env.ETHEREUM_RPC_URL),
  });
}

export async function resolveTokenUriFromContract(input: {
  contractAddress: string;
  tokenId: string;
}) {
  const rpc = getEthereumClient();

  return rpc.readContract({
    address: getAddress(input.contractAddress),
    abi: [parseAbiItem("function tokenURI(uint256 tokenId) view returns (string)")],
    functionName: "tokenURI",
    args: [BigInt(input.tokenId)],
  });
}

export async function discoverTokenIdsFromLogs(input: {
  contractAddress: string;
  fromBlock: number;
  toBlock?: number;
}) {
  const client = getEthereumClient();

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
