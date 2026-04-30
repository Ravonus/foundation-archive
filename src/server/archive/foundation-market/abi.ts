import { parseAbi, parseAbiItem } from "viem";

export const RESERVE_AUCTION_CREATED_EVENT = parseAbiItem(
  "event ReserveAuctionCreated(address indexed seller, address indexed nftContract, uint256 indexed tokenId, uint256 duration, uint256 extensionDuration, uint256 reservePrice, uint256 auctionId)",
);

export const RESERVE_AUCTION_BID_PLACED_EVENT = parseAbiItem(
  "event ReserveAuctionBidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount, uint256 endTime)",
);

export const RESERVE_AUCTION_FINALIZED_EVENT = parseAbiItem(
  "event ReserveAuctionFinalized(uint256 indexed auctionId, address indexed seller, address indexed bidder, uint256 totalFees, uint256 creatorRev, uint256 sellerRev)",
);

export const RESERVE_AUCTION_CANCELED_EVENT = parseAbiItem(
  "event ReserveAuctionCanceled(uint256 indexed auctionId)",
);

export const RESERVE_AUCTION_INVALIDATED_EVENT = parseAbiItem(
  "event ReserveAuctionInvalidated(uint256 indexed auctionId)",
);

export const RESERVE_AUCTION_UPDATED_EVENT = parseAbiItem(
  "event ReserveAuctionUpdated(uint256 indexed auctionId, uint256 reservePrice)",
);

export const BUY_PRICE_SET_EVENT = parseAbiItem(
  "event BuyPriceSet(address indexed nftContract, uint256 indexed tokenId, address indexed seller, uint256 price)",
);

export const BUY_PRICE_ACCEPTED_EVENT = parseAbiItem(
  "event BuyPriceAccepted(address indexed nftContract, uint256 indexed tokenId, address indexed seller, address buyer, uint256 totalFees, uint256 creatorRev, uint256 sellerRev)",
);

export const BUY_PRICE_CANCELED_EVENT = parseAbiItem(
  "event BuyPriceCanceled(address indexed nftContract, uint256 indexed tokenId)",
);

export const BUY_PRICE_INVALIDATED_EVENT = parseAbiItem(
  "event BuyPriceInvalidated(address indexed nftContract, uint256 indexed tokenId)",
);

export const NFT_MARKET_EVENTS = [
  RESERVE_AUCTION_CREATED_EVENT,
  RESERVE_AUCTION_BID_PLACED_EVENT,
  RESERVE_AUCTION_FINALIZED_EVENT,
  RESERVE_AUCTION_CANCELED_EVENT,
  RESERVE_AUCTION_INVALIDATED_EVENT,
  RESERVE_AUCTION_UPDATED_EVENT,
  BUY_PRICE_SET_EVENT,
  BUY_PRICE_ACCEPTED_EVENT,
  BUY_PRICE_CANCELED_EVENT,
  BUY_PRICE_INVALIDATED_EVENT,
] as const;

export type NftMarketEvent = (typeof NFT_MARKET_EVENTS)[number];

export const NFT_MARKET_GETTERS_ABI = parseAbi([
  "function getBuyPrice(address nftContract, uint256 tokenId) view returns (address seller, uint256 price)",
  "function getReserveAuctionIdFor(address nftContract, uint256 tokenId) view returns (uint256 auctionId)",
  "function getReserveAuction(uint256 auctionId) view returns ((address nftContract, uint256 tokenId, address seller, uint256 duration, uint256 extensionDuration, uint256 endTime, address bidder, uint256 amount) auction)",
]);
