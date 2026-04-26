/* eslint-disable complexity, max-lines, max-lines-per-function */

"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { formatEther, getAddress, isAddressEqual, parseEther } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { ERC721_APPROVAL_ABI, FOUNDATION_NFT_MARKET_ABI } from "./foundation-contract-abi";

type ActiveBuyPrice = {
  marketContract: string;
  seller: string;
  price: string;
};

type LiveAuction = {
  marketContract: string;
  auctionId: string;
  seller: string;
  status: string;
  endTime: string | null;
  highestBid: string | null;
  reservePrice: string;
};

export function OwnerSurface(props: {
  chainId: number;
  contractAddress: string;
  tokenId: string;
  marketContract?: `0x${string}`;
  isWalletOwner: boolean;
  activeBuyPrice: ActiveBuyPrice | null;
  liveAuction: LiveAuction | null;
  title: string | null;
}) {
  const { address: connectedAddress } = useAccount();
  const contractAddressSafe = safeAddress(props.contractAddress);
  const tokenIdBigInt = safeBigInt(props.tokenId);
  const [mode, setMode] = useState<"buy-now" | "auction">("buy-now");
  const [buyNowPrice, setBuyNowPrice] = useState(() =>
    formatEditableEth(props.activeBuyPrice?.price ?? null),
  );
  const [reservePrice, setReservePrice] = useState(() =>
    formatEditableEth(props.liveAuction?.reservePrice ?? null),
  );

  const approvedForAllQuery = useReadContract({
    address: contractAddressSafe,
    abi: ERC721_APPROVAL_ABI,
    functionName: "isApprovedForAll",
    args:
      connectedAddress && props.marketContract
        ? [getAddress(connectedAddress), props.marketContract]
        : undefined,
    chainId: props.chainId,
    query: {
      enabled: Boolean(
        connectedAddress && props.marketContract && contractAddressSafe,
      ),
    },
  });

  const tokenApprovedQuery = useReadContract({
    address: contractAddressSafe,
    abi: ERC721_APPROVAL_ABI,
    functionName: "getApproved",
    args: tokenIdBigInt !== null ? [tokenIdBigInt] : undefined,
    chainId: props.chainId,
    query: {
      enabled: Boolean(contractAddressSafe && tokenIdBigInt !== null),
    },
  });

  const isApprovedForMarket = useMemo(() => {
    if (!props.marketContract) return false;
    if (approvedForAllQuery.data) return true;
    if (!tokenApprovedQuery.data) return false;
    try {
      return isAddressEqual(
        getAddress(tokenApprovedQuery.data),
        props.marketContract,
      );
    } catch {
      return false;
    }
  }, [approvedForAllQuery.data, props.marketContract, tokenApprovedQuery.data]);

  const hasActiveBuyPrice = Boolean(props.activeBuyPrice);
  const hasLiveAuction = Boolean(props.liveAuction);
  const canCreateListing =
    props.isWalletOwner && !hasActiveBuyPrice && !hasLiveAuction;
  const canEditAuction =
    props.liveAuction?.status === "open" && !props.liveAuction.highestBid;

  return (
    <div className="flex flex-col gap-4">
      <StateLine
        state={
          hasActiveBuyPrice
            ? "You manage this listing"
            : hasLiveAuction
              ? "You manage this auction"
              : "You can list this work"
        }
        subline={
          hasActiveBuyPrice
            ? "Update the price or cancel the fixed-price listing on Foundation."
            : hasLiveAuction
              ? canEditAuction
                ? "Adjust the reserve or cancel the auction before the first bid lands."
                : "This auction is already live. Once bidding starts, it can no longer be canceled."
              : "Create a Foundation buy-now listing or reserve auction directly from here."
        }
      />

      {props.activeBuyPrice && props.marketContract ? (
        <BuyPriceOwnerControls
          key={`buy:${props.activeBuyPrice.price}`}
          chainId={props.chainId}
          contractAddress={props.contractAddress}
          tokenId={props.tokenId}
          marketContract={props.marketContract}
          currentPriceWei={props.activeBuyPrice.price}
          draftPrice={buyNowPrice}
          onDraftPriceChange={setBuyNowPrice}
          title={props.title}
        />
      ) : null}

      {props.liveAuction && props.marketContract ? (
        <ReserveAuctionOwnerControls
          key={`auction:${props.liveAuction.auctionId}:${props.liveAuction.reservePrice}:${props.liveAuction.status}:${props.liveAuction.highestBid ?? "none"}`}
          chainId={props.chainId}
          marketContract={props.marketContract}
          auction={props.liveAuction}
          draftPrice={reservePrice}
          onDraftPriceChange={setReservePrice}
        />
      ) : null}

      {canCreateListing ? (
        <>
          <ApprovalNotice
            marketContract={props.marketContract}
            isApproved={isApprovedForMarket}
            chainId={props.chainId}
          />
          {!isApprovedForMarket &&
          props.marketContract &&
          contractAddressSafe ? (
            <ApproveMarketButton
              chainId={props.chainId}
              contractAddress={contractAddressSafe}
              marketContract={props.marketContract}
            />
          ) : null}
          <div className="inline-flex w-fit rounded-full border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-1">
            <ModeButton
              active={mode === "buy-now"}
              label="Buy now"
              onClick={() => setMode("buy-now")}
            />
            <ModeButton
              active={mode === "auction"}
              label="Reserve auction"
              onClick={() => setMode("auction")}
            />
          </div>
          {mode === "buy-now" && props.marketContract ? (
            <CreateBuyPriceListing
              chainId={props.chainId}
              contractAddress={props.contractAddress}
              tokenId={props.tokenId}
              marketContract={props.marketContract}
              enabled={isApprovedForMarket}
              draftPrice={buyNowPrice}
              onDraftPriceChange={setBuyNowPrice}
            />
          ) : null}
          {mode === "auction" && props.marketContract ? (
            <CreateReserveAuctionListing
              chainId={props.chainId}
              contractAddress={props.contractAddress}
              tokenId={props.tokenId}
              marketContract={props.marketContract}
              enabled={isApprovedForMarket}
              draftPrice={reservePrice}
              onDraftPriceChange={setReservePrice}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ApprovalNotice({
  marketContract,
  isApproved,
  chainId,
}: {
  marketContract?: `0x${string}`;
  isApproved: boolean;
  chainId: number;
}) {
  if (!marketContract) return null;
  return (
    <p className="text-xs leading-relaxed text-[var(--color-ink)]/60">
      {isApproved
        ? `Marketplace approval is ready on ${chainNameFor(chainId)}.`
        : "Approve Foundation's market contract once before creating a listing. Your wallet will ask for a standard ERC-721 operator approval."}
    </p>
  );
}

function ApproveMarketButton({
  chainId,
  contractAddress,
  marketContract,
}: {
  chainId: number;
  contractAddress: `0x${string}`;
  marketContract: `0x${string}`;
}) {
  return (
    <ContractActionButton
      chainId={chainId}
      buttonClassName="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-surface-alt)] disabled:opacity-60"
      actionLabel="Approve market"
      pendingLabel="Confirm approval…"
      miningLabel="Approving…"
      successLabel="Approved ✓"
      buildRequest={() => ({
        address: contractAddress,
        abi: ERC721_APPROVAL_ABI,
        functionName: "setApprovalForAll",
        args: [marketContract, true],
        chainId,
      })}
      refreshOnSuccess
    />
  );
}

function BuyPriceOwnerControls({
  chainId,
  contractAddress,
  tokenId,
  marketContract,
  currentPriceWei,
  draftPrice,
  onDraftPriceChange,
  title,
}: {
  chainId: number;
  contractAddress: string;
  tokenId: string;
  marketContract: `0x${string}`;
  currentPriceWei: string;
  draftPrice: string;
  onDraftPriceChange: (value: string) => void;
  title: string | null;
}) {
  const parsedPrice = parsePriceInput(draftPrice) ?? 0n;
  const canSubmit = parsePriceInput(draftPrice) !== null;
  const priceLabel = formatPriceEth(currentPriceWei) ?? `${currentPriceWei} wei`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-4">
      <StateLine
        state={`Buy now · ${priceLabel}`}
        subline={title ? `${title} is escrowed in Foundation's market.` : null}
      />
      <PriceInput
        label="New price (ETH)"
        value={draftPrice}
        onChange={onDraftPriceChange}
        placeholder="0.50"
      />
      <div className="flex flex-wrap gap-2">
        <ContractActionButton
          chainId={chainId}
          disabled={!canSubmit}
          buttonClassName="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] transition hover:opacity-90 disabled:opacity-60"
          actionLabel="Update price"
          pendingLabel="Confirm update…"
          miningLabel="Updating…"
          successLabel="Price updated ✓"
          buildRequest={() => ({
            address: marketContract,
            abi: FOUNDATION_NFT_MARKET_ABI,
            functionName: "setBuyPrice",
            args: [getAddress(contractAddress), BigInt(tokenId), parsedPrice],
            chainId,
          })}
          refreshOnSuccess
        />
        <ContractActionButton
          chainId={chainId}
          buttonClassName="inline-flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-surface-alt)] disabled:opacity-60"
          actionLabel="Delist"
          pendingLabel="Confirm delist…"
          miningLabel="Canceling…"
          successLabel="Delisted ✓"
          buildRequest={() => ({
            address: marketContract,
            abi: FOUNDATION_NFT_MARKET_ABI,
            functionName: "cancelBuyPrice",
            args: [getAddress(contractAddress), BigInt(tokenId)],
            chainId,
          })}
          refreshOnSuccess
        />
      </div>
    </div>
  );
}

function ReserveAuctionOwnerControls({
  chainId,
  marketContract,
  auction,
  draftPrice,
  onDraftPriceChange,
}: {
  chainId: number;
  marketContract: `0x${string}`;
  auction: LiveAuction;
  draftPrice: string;
  onDraftPriceChange: (value: string) => void;
}) {
  const parsedPrice = parsePriceInput(draftPrice) ?? 0n;
  const canSubmit = parsePriceInput(draftPrice) !== null;
  const canEdit = auction.status === "open" && !auction.highestBid;
  const reserveLabel =
    formatPriceEth(auction.reservePrice) ?? `${auction.reservePrice} wei`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-4">
      <StateLine
        state={`Reserve auction · ${reserveLabel}`}
        subline={
          canEdit
            ? "No bids yet. You can still update the reserve or cancel the auction."
            : formatRelativeTime(
                auction.endTime ? new Date(auction.endTime) : null,
              )
        }
      />
      {canEdit ? (
        <>
          <PriceInput
            label="New reserve (ETH)"
            value={draftPrice}
            onChange={onDraftPriceChange}
            placeholder="0.50"
          />
          <div className="flex flex-wrap gap-2">
            <ContractActionButton
              chainId={chainId}
              disabled={!canSubmit}
              buttonClassName="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] transition hover:opacity-90 disabled:opacity-60"
              actionLabel="Update reserve"
              pendingLabel="Confirm update…"
              miningLabel="Updating…"
              successLabel="Reserve updated ✓"
              buildRequest={() => ({
                address: marketContract,
                abi: FOUNDATION_NFT_MARKET_ABI,
                functionName: "updateReserveAuction",
                args: [BigInt(auction.auctionId), parsedPrice],
                chainId,
              })}
              refreshOnSuccess
            />
            <ContractActionButton
              chainId={chainId}
              buttonClassName="inline-flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-surface-alt)] disabled:opacity-60"
              actionLabel="Cancel auction"
              pendingLabel="Confirm cancel…"
              miningLabel="Canceling…"
              successLabel="Canceled ✓"
              buildRequest={() => ({
                address: marketContract,
                abi: FOUNDATION_NFT_MARKET_ABI,
                functionName: "cancelReserveAuction",
                args: [BigInt(auction.auctionId)],
                chainId,
              })}
              refreshOnSuccess
            />
          </div>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-[var(--color-ink)]/60">
          Once the first bid lands, Foundation locks this auction in. You can
          still settle it when it ends, but you can&apos;t delist it mid-auction.
        </p>
      )}
    </div>
  );
}

function CreateBuyPriceListing({
  chainId,
  contractAddress,
  tokenId,
  marketContract,
  enabled,
  draftPrice,
  onDraftPriceChange,
}: {
  chainId: number;
  contractAddress: string;
  tokenId: string;
  marketContract: `0x${string}`;
  enabled: boolean;
  draftPrice: string;
  onDraftPriceChange: (value: string) => void;
}) {
  const parsedPrice = parsePriceInput(draftPrice) ?? 0n;
  const canSubmit = enabled && parsePriceInput(draftPrice) !== null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-4">
      <PriceInput
        label="Buy now price (ETH)"
        value={draftPrice}
        onChange={onDraftPriceChange}
        placeholder="0.50"
      />
      <ContractActionButton
        chainId={chainId}
        disabled={!canSubmit}
        buttonClassName="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] transition hover:opacity-90 disabled:opacity-60"
        actionLabel="Create buy-now listing"
        pendingLabel="Confirm listing…"
        miningLabel="Listing…"
        successLabel="Listed ✓"
        buildRequest={() => ({
          address: marketContract,
          abi: FOUNDATION_NFT_MARKET_ABI,
          functionName: "setBuyPrice",
          args: [getAddress(contractAddress), BigInt(tokenId), parsedPrice],
          chainId,
        })}
        refreshOnSuccess
      />
    </div>
  );
}

function CreateReserveAuctionListing({
  chainId,
  contractAddress,
  tokenId,
  marketContract,
  enabled,
  draftPrice,
  onDraftPriceChange,
}: {
  chainId: number;
  contractAddress: string;
  tokenId: string;
  marketContract: `0x${string}`;
  enabled: boolean;
  draftPrice: string;
  onDraftPriceChange: (value: string) => void;
}) {
  const parsedPrice = parsePriceInput(draftPrice) ?? 0n;
  const canSubmit = enabled && parsePriceInput(draftPrice) !== null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-4">
      <PriceInput
        label="Reserve price (ETH)"
        value={draftPrice}
        onChange={onDraftPriceChange}
        placeholder="0.50"
      />
      <ContractActionButton
        chainId={chainId}
        disabled={!canSubmit}
        buttonClassName="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] transition hover:opacity-90 disabled:opacity-60"
        actionLabel="Create reserve auction"
        pendingLabel="Confirm auction…"
        miningLabel="Listing…"
        successLabel="Auction created ✓"
        buildRequest={() => ({
          address: marketContract,
          abi: FOUNDATION_NFT_MARKET_ABI,
          functionName: "createReserveAuction",
          args: [getAddress(contractAddress), BigInt(tokenId), parsedPrice],
          chainId,
        })}
        refreshOnSuccess
      />
    </div>
  );
}

function PriceInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--color-ink)]/70">
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-line-strong)]"
      />
    </label>
  );
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-[var(--color-ink)] px-3 py-1.5 text-xs font-medium text-[var(--color-bg)]"
          : "rounded-full px-3 py-1.5 text-xs font-medium text-[var(--color-ink)]/65 transition hover:text-[var(--color-ink)]"
      }
    >
      {label}
    </button>
  );
}

function ContractActionButton(args: {
  chainId: number;
  actionLabel: string;
  pendingLabel: string;
  miningLabel: string;
  successLabel: string;
  buttonClassName: string;
  disabled?: boolean;
  buildRequest: () => Parameters<ReturnType<typeof useWriteContract>["writeContract"]>[0];
  refreshOnSuccess?: boolean;
}) {
  const router = useRouter();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({
    hash,
    chainId: args.chainId,
  });

  useEffect(() => {
    if (isSuccess && args.refreshOnSuccess) {
      router.refresh();
    }
  }, [args.refreshOnSuccess, isSuccess, router]);

  return (
    <div className="flex flex-col gap-2">
      <motion.button
        type="button"
        onClick={() => writeContract(args.buildRequest())}
        disabled={(args.disabled ?? false) || isPending || isMining || isSuccess}
        whileHover={{ scale: 1.015 }}
        whileTap={{ scale: 0.985 }}
        className={args.buttonClassName}
      >
        {isSuccess
          ? args.successLabel
          : isMining
            ? args.miningLabel
            : isPending
              ? args.pendingLabel
              : args.actionLabel}
      </motion.button>
      {error ? (
        <p className="text-xs text-[var(--color-err)]">{shortenError(error)}</p>
      ) : null}
    </div>
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

function formatEditableEth(wei: string | null) {
  if (!wei) return "";
  try {
    return formatEther(BigInt(wei));
  } catch {
    return "";
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

function safeAddress(value: string) {
  try {
    return getAddress(value);
  } catch {
    return undefined;
  }
}

function safeBigInt(value: string) {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function parsePriceInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = parseEther(trimmed);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
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
