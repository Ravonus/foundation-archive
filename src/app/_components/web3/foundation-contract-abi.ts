export const ERC721_OWNER_OF_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

export const FOUNDATION_NFT_MARKET_ABI = [
  {
    type: "function",
    name: "buyV2",
    stateMutability: "payable",
    inputs: [
      { name: "nftContract", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "maxPrice", type: "uint256" },
      { name: "referrer", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "finalizeReserveAuction",
    stateMutability: "nonpayable",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelBuyPrice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "nftContract", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
