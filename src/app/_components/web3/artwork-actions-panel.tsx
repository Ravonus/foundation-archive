"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { formatEther, getAddress, isAddressEqual } from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { ConnectWalletButton } from "./connect-wallet-button";
import {
  ERC721_OWNER_OF_ABI,
  FOUNDATION_NFT_MARKET_ABI,
} from "./foundation-contract-abi";

const EASE = [0.22, 1, 0.36, 1] as const;

type ActiveBuyPrice = {
  marketContract: string;
  price: string;
};

type LiveAuction = {
  marketContract: string;
  auctionId: string;
  status: string;
  endTime: string | null;
  highestBid: string | null;
  reservePrice: string;
};

export type ArtworkActionsPanelProps = {
  chainId: number;
  contractAddress: string;
  tokenId: string;
  title: string | null;
  activeBuyPrice: ActiveBuyPrice | null;
  liveAuction: LiveAuction | null;
  isRescuable: boolean;
};

function formatPriceEth(wei: string | null) {
  if (!wei) return null;
  try {
    const eth = formatEther(BigInt(wei));
    const num = Number(eth);
    if (!Number.isFinite(num)) return `${eth} ETH`;
    if (num === 0) return "0 ETH";
    if (num < 0.001) return `${num.toFixed(6)} ETH`;
    if (num < 1) return `${num.toFixed(4)} ETH`;
    return `${num.toFixed(3)} ETH`;
  } catch {
    return null;
  }
}

function formatRelativeTime(target: Date | null) {
  if (!target) return null;
  const diffMs = target.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);

  let phrase: string;
  if (minutes < 60) phrase = `${minutes} min`;
  else if (hours < 48) phrase = `${hours} hr`;
  else phrase = `${days} d`;

  return diffMs >= 0 ? `ends in ${phrase}` : `ended ${phrase} ago`;
}

export function ArtworkActionsPanel(props: ArtworkActionsPanelProps) {
  const { address: connectedAddress, isConnected } = useAccount();
  const activeChainId = useChainId();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  const ownerQuery = useReadContract({
    address: safeAddress(props.contractAddress),
    abi: ERC721_OWNER_OF_ABI,
    functionName: "ownerOf",
    args: [BigInt(props.tokenId)],
    chainId: props.chainId,
    query: { enabled: Boolean(safeAddress(props.contractAddress)) },
  });

  const isOwner = useMemo(() => {
    if (!isConnected || !connectedAddress || !ownerQuery.data) return false;
    try {
      return isAddressEqual(
        getAddress(connectedAddress),
        getAddress(ownerQuery.data),
      );
    } catch {
      return false;
    }
  }, [connectedAddress, isConnected, ownerQuery.data]);

  const onWrongNetwork = isConnected && activeChainId !== props.chainId;

  if (!isConnected) {
    return (
      <ActionsShell>
        <StateLine
          state={describeMarketState(props)}
          subline={describeSubline(props)}
        />
        <ConnectWalletButton variant="primary" />
      </ActionsShell>
    );
  }

  if (onWrongNetwork) {
    return (
      <ActionsShell>
        <StateLine
          state={describeMarketState(props)}
          subline={`Switch to ${chainNameFor(props.chainId)} to interact with this work.`}
        />
        <motion.button
          type="button"
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.985 }}
          disabled={isSwitchingChain}
          onClick={() =>
            switchChain({ chainId: props.chainId as 1 | 8453 })
          }
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-[var(--color-bg)] transition hover:opacity-90 disabled:opacity-60"
        >
          {isSwitchingChain
            ? "Switching…"
            : `Switch to ${chainNameFor(props.chainId)}`}
        </motion.button>
      </ActionsShell>
    );
  }

  return (
    <ActionsShell>
      <ActionsBody {...props} isOwner={isOwner} />
    </ActionsShell>
  );
}

function ActionsBody(
  props: ArtworkActionsPanelProps & { isOwner: boolean },
) {
  if (props.isRescuable && props.liveAuction) {
    return (
      <RescueAuctionAction
        chainId={props.chainId}
        marketContract={props.liveAuction.marketContract}
        auctionId={props.liveAuction.auctionId}
        endsAt={props.liveAuction.endTime ? new Date(props.liveAuction.endTime) : null}
        highestBid={props.liveAuction.highestBid}
      />
    );
  }

  if (props.activeBuyPrice && !props.isOwner) {
    return (
      <BuyNowAction
        chainId={props.chainId}
        contractAddress={props.contractAddress}
        tokenId={props.tokenId}
        marketContract={props.activeBuyPrice.marketContract}
        priceWei={props.activeBuyPrice.price}
      />
    );
  }

  if (props.liveAuction && !props.isOwner) {
    return (
      <AuctionLiveInfo
        endsAt={props.liveAuction.endTime ? new Date(props.liveAuction.endTime) : null}
        highestBid={props.liveAuction.highestBid}
        reservePrice={props.liveAuction.reservePrice}
      />
    );
  }

  if (props.isOwner) {
    return <OwnerSurface hasActiveListing={Boolean(props.activeBuyPrice)} />;
  }

  return (
    <StateLine
      state="Not currently listed"
      subline="No active sale or auction is recorded for this work."
    />
  );
}

function RescueAuctionAction({
  chainId,
  marketContract,
  auctionId,
  endsAt,
  highestBid,
}: {
  chainId: number;
  marketContract: string;
  auctionId: string;
  endsAt: Date | null;
  highestBid: string | null;
}) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({
    hash,
    chainId,
  });

  const onClick = () => {
    writeContract({
      address: getAddress(marketContract),
      abi: FOUNDATION_NFT_MARKET_ABI,
      functionName: "finalizeReserveAuction",
      args: [BigInt(auctionId)],
      chainId,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <StateLine
        state={`Auction ended · awaiting settlement`}
        subline={`${formatRelativeTime(endsAt) ?? ""}${highestBid ? ` · winning bid ${formatPriceEth(highestBid)}` : ""}`}
      />
      <div className="flex items-center gap-2">
        <motion.button
          type="button"
          onClick={onClick}
          disabled={isPending || isMining || isSuccess}
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.985 }}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-brand-green)] px-5 py-2.5 text-sm font-medium text-[#fafaf7] transition hover:bg-[var(--color-brand-green-bright)] disabled:opacity-60"
        >
          {isSuccess
            ? "Rescued ✓"
            : isMining
              ? "Settling on-chain…"
              : isPending
                ? "Confirm in wallet…"
                : "Rescue this auction"}
        </motion.button>
      </div>
      <p className="text-xs leading-relaxed text-[var(--color-ink)]/60">
        Anyone can finalize an ended auction. The artwork transfers to the
        winning bidder and the seller's address receives the proceeds. You only
        pay gas.
      </p>
      {error ? (
        <p className="text-xs text-[var(--color-err)]">{shortenError(error)}</p>
      ) : null}
    </div>
  );
}

function BuyNowAction({
  chainId,
  contractAddress,
  tokenId,
  marketContract,
  priceWei,
}: {
  chainId: number;
  contractAddress: string;
  tokenId: string;
  marketContract: string;
  priceWei: string;
}) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({
    hash,
    chainId,
  });

  const onClick = () => {
    const priceBigInt = BigInt(priceWei);
    writeContract({
      address: getAddress(marketContract),
      abi: FOUNDATION_NFT_MARKET_ABI,
      functionName: "buyV2",
      args: [
        getAddress(contractAddress),
        BigInt(tokenId),
        priceBigInt,
        "0x0000000000000000000000000000000000000000",
      ],
      value: priceBigInt,
      chainId,
    });
  };

  const priceLabel = formatPriceEth(priceWei) ?? `${priceWei} wei`;

  return (
    <div className="flex flex-col gap-2">
      <StateLine
        state={`Listed for ${priceLabel}`}
        subline="Direct on-chain purchase via Foundation's market contract."
      />
      <motion.button
        type="button"
        onClick={onClick}
        disabled={isPending || isMining || isSuccess}
        whileHover={{ scale: 1.015 }}
        whileTap={{ scale: 0.985 }}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-[var(--color-bg)] transition hover:opacity-90 disabled:opacity-60"
      >
        {isSuccess
          ? "Purchased ✓"
          : isMining
            ? "Settling on-chain…"
            : isPending
              ? "Confirm in wallet…"
              : `Buy for ${priceLabel}`}
      </motion.button>
      {error ? (
        <p className="text-xs text-[var(--color-err)]">{shortenError(error)}</p>
      ) : null}
    </div>
  );
}

function AuctionLiveInfo({
  endsAt,
  highestBid,
  reservePrice,
}: {
  endsAt: Date | null;
  highestBid: string | null;
  reservePrice: string;
}) {
  const bidLabel = highestBid ? formatPriceEth(highestBid) : null;
  const reserveLabel = formatPriceEth(reservePrice);
  const stateLine = bidLabel
    ? `Live auction · current bid ${bidLabel}`
    : `Reserve auction · ${reserveLabel ?? "reserve set"}`;

  return (
    <div className="flex flex-col gap-2">
      <StateLine state={stateLine} subline={formatRelativeTime(endsAt)} />
      <p className="text-xs leading-relaxed text-[var(--color-ink)]/60">
        Live bidding still flows through Foundation's market. After the auction
        ends, anyone can settle it from here.
      </p>
    </div>
  );
}

function OwnerSurface({ hasActiveListing }: { hasActiveListing: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <StateLine
        state="You own this work"
        subline={
          hasActiveListing
            ? "It is currently listed on Foundation's market."
            : "It is not currently listed for sale."
        }
      />
      <button
        type="button"
        disabled
        className="inline-flex w-fit cursor-not-allowed items-center gap-2 rounded-full border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface-alt)] px-4 py-2 text-xs font-medium text-[var(--color-ink)]/60"
      >
        List through Agorix · coming soon
      </button>
      <p className="text-xs leading-relaxed text-[var(--color-ink)]/60">
        We're shipping a wrapped listing flow that pays creators directly while
        funding the archive. Until then, list on Foundation as usual — we'll
        index it here.
      </p>
    </div>
  );
}

function ActionsShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={JSON.stringify(children)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: EASE }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

function StateLine({
  state,
  subline,
}: {
  state: string;
  subline?: string | null;
}) {
  return (
    <div className="flex flex-col">
      <p className="text-sm font-medium text-[var(--color-ink)]">{state}</p>
      {subline ? (
        <p className="mt-0.5 text-xs text-[var(--color-ink)]/60">{subline}</p>
      ) : null}
    </div>
  );
}

function describeMarketState(props: ArtworkActionsPanelProps): string {
  if (props.isRescuable) return "Auction ended · awaiting settlement";
  if (props.activeBuyPrice) {
    const label = formatPriceEth(props.activeBuyPrice.price);
    return label ? `Listed for ${label}` : "Listed for sale";
  }
  if (props.liveAuction) {
    if (props.liveAuction.highestBid) {
      const bid = formatPriceEth(props.liveAuction.highestBid);
      return bid ? `Live auction · current bid ${bid}` : "Live auction";
    }
    return "Reserve auction live";
  }
  return "Not currently listed";
}

function describeSubline(props: ArtworkActionsPanelProps): string | null {
  if (props.isRescuable) return "Connect a wallet to settle this auction.";
  if (props.activeBuyPrice) return "Connect a wallet to purchase.";
  if (props.liveAuction)
    return formatRelativeTime(
      props.liveAuction.endTime ? new Date(props.liveAuction.endTime) : null,
    );
  return null;
}

function safeAddress(value: string) {
  try {
    return getAddress(value);
  } catch {
    return undefined;
  }
}

function chainNameFor(chainId: number) {
  if (chainId === 1) return "Ethereum";
  if (chainId === 8453) return "Base";
  return `chain ${chainId}`;
}

function shortenError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 160 ? `${message.slice(0, 160)}…` : message;
}
