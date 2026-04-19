import { ArrowUpRight } from "lucide-react";
import { formatEther } from "viem";

import type { Prisma } from "~/server/prisma-client";

type MarketEventRow = Prisma.FoundationMarketEventGetPayload<Record<string, never>>;

const BLOCK_EXPLORER_TX = (chainId: number, hash: string) => {
  if (chainId === 8453) return `https://basescan.org/tx/${hash}`;
  return `https://etherscan.io/tx/${hash}`;
};

function shortAddress(address: string | null) {
  if (!address) return null;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatEth(wei: string | null) {
  if (!wei) return null;
  try {
    const value = Number(formatEther(BigInt(wei)));
    if (!Number.isFinite(value)) return null;
    if (value === 0) return "0 ETH";
    if (value < 0.001) return `${value.toFixed(6)} ETH`;
    if (value < 1) return `${value.toFixed(4)} ETH`;
    return `${value.toFixed(3)} ETH`;
  } catch {
    return null;
  }
}

// eslint-disable-next-line complexity
function eventLabel(event: MarketEventRow): {
  title: string;
  detail: string | null;
  tone: "neutral" | "good" | "warn" | "info";
} {
  const amount = formatEth(event.amount);
  const actor = shortAddress(event.actorAddress);

  switch (event.eventName) {
    case "ReserveAuctionCreated":
      return {
        title: "Reserve auction listed",
        detail: amount ? `Reserve set at ${amount}` : null,
        tone: "info",
      };
    case "ReserveAuctionBidPlaced":
      return {
        title: "Bid placed",
        detail: [actor, amount].filter(Boolean).join(" · ") || null,
        tone: "info",
      };
    case "ReserveAuctionFinalized":
      return {
        title: "Auction settled",
        detail: amount ? `Seller proceeds ${amount}` : null,
        tone: "good",
      };
    case "ReserveAuctionCanceled":
      return {
        title: "Auction canceled",
        detail: null,
        tone: "warn",
      };
    case "ReserveAuctionInvalidated":
      return {
        title: "Auction invalidated",
        detail: null,
        tone: "warn",
      };
    case "ReserveAuctionUpdated":
      return {
        title: "Reserve updated",
        detail: amount ? `New reserve ${amount}` : null,
        tone: "neutral",
      };
    case "BuyPriceSet":
      return {
        title: "Listed for sale",
        detail: amount ? `Price ${amount}` : null,
        tone: "info",
      };
    case "BuyPriceAccepted":
      return {
        title: "Sold",
        detail:
          [actor && `to ${actor}`, amount && `for ${amount}`]
            .filter(Boolean)
            .join(" ") || null,
        tone: "good",
      };
    case "BuyPriceCanceled":
      return {
        title: "Listing canceled",
        detail: null,
        tone: "warn",
      };
    case "BuyPriceInvalidated":
      return {
        title: "Listing invalidated",
        detail: null,
        tone: "warn",
      };
    default:
      return {
        title: event.eventName,
        detail: null,
        tone: "neutral",
      };
  }
}

function toneClass(tone: "neutral" | "good" | "warn" | "info") {
  switch (tone) {
    case "good":
      return "text-[var(--color-ok)]";
    case "warn":
      return "text-[var(--color-warn)]";
    case "info":
      return "text-[var(--color-info)]";
    case "neutral":
      return "text-[var(--color-muted)]";
  }
}

export function MarketHistoryList({
  events,
  chainId,
}: {
  events: MarketEventRow[];
  chainId: number;
}) {
  if (events.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="font-medium text-[var(--color-ink)]">On-chain history</h3>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Every Foundation market event recorded for this work, indexed straight
        from the blockchain.
      </p>
      <ol className="mt-4 space-y-2">
        {events.map((event) => {
          const labeled = eventLabel(event);
          return (
            <li
              key={event.id}
              className="flex items-start justify-between gap-4 rounded-sm border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden
                    className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current ${toneClass(labeled.tone)}`}
                  />
                  <span className="font-medium text-[var(--color-ink)]">
                    {labeled.title}
                  </span>
                </p>
                {labeled.detail ? (
                  <p className="mt-1 text-xs text-[var(--color-body)]">
                    {labeled.detail}
                  </p>
                ) : null}
                <p className="mt-1 font-mono text-[0.65rem] tracking-wide text-[var(--color-muted)]">
                  block {event.blockNumber}
                </p>
              </div>
              <a
                href={BLOCK_EXPLORER_TX(chainId, event.txHash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[0.7rem] text-[var(--color-muted)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)]"
              >
                tx
                <ArrowUpRight aria-hidden className="h-3 w-3" />
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export type { MarketEventRow };
