/* eslint-disable complexity, max-lines-per-function */

"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatEther, getAddress, isAddressEqual } from "viem";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";

import { ConnectWalletButton } from "./connect-wallet-button";
import { FOUNDATION_NFT_MARKET_ABI } from "./foundation-contract-abi";
import { wagmiConfig } from "./wagmi-config";

export type ProfileBulkDelistPanelProps = {
  profile: string;
  sellerAddress: string;
};

type BulkDelistTarget = {
  id: string;
  kind: "buyPrice" | "reserveAuction";
  chainId: number;
  title: string;
  slug: string | null;
  contractAddress: string;
  tokenId: string;
  marketContract: string;
  seller: string;
  price: string | null;
  auctionId: string | null;
  reservePrice: string | null;
};

type BulkDelistResponse = {
  seller: string;
  scanned: number;
  targets: BulkDelistTarget[];
  skipped: {
    biddingAuctions: number;
    otherSeller: number;
    errors: number;
  };
};

type TargetStatus =
  | "queued"
  | "switching"
  | "confirming"
  | "mining"
  | "done"
  | "error";

type TargetProgress = {
  status: TargetStatus;
  hash?: `0x${string}`;
  error?: string;
};

const EASE = [0.22, 1, 0.36, 1] as const;
const EMPTY_TARGETS: BulkDelistTarget[] = [];

export function ProfileBulkDelistPanel({
  profile,
  sellerAddress,
}: ProfileBulkDelistPanelProps) {
  const router = useRouter();
  const { address: connectedAddress, isConnected } = useAccount();
  const activeChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [response, setResponse] = useState<BulkDelistResponse | null>(null);
  const [progress, setProgress] = useState<Record<string, TargetProgress>>({});
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  const connectedIsSeller = addressesMatch(connectedAddress, sellerAddress);
  const targets = response?.targets ?? EMPTY_TARGETS;
  const completed = targets.filter(
    (target) => progress[target.id]?.status === "done",
  ).length;
  const chainCounts = useMemo(() => countTargetsByChain(targets), [targets]);

  const loadTargets = async () => {
    setIsLoadingTargets(true);
    setTargetError(null);
    try {
      const result = await fetch(
        `/api/profile/${encodeURIComponent(profile)}/delist-targets`,
        { cache: "no-store" },
      );
      if (!result.ok) throw new Error("Unable to prepare bulk delist.");
      const payload = (await result.json()) as BulkDelistResponse;
      setResponse(payload);
      setProgress(
        Object.fromEntries(
          payload.targets.map((target) => [
            target.id,
            { status: "queued" as const },
          ]),
        ),
      );
    } catch (error) {
      setTargetError(shortenError(error));
    } finally {
      setIsLoadingTargets(false);
    }
  };

  const runDelistAll = async () => {
    if (!connectedIsSeller || targets.length === 0 || isRunning) return;
    let currentChainId = activeChainId;
    let completedAny = false;
    let activeTargetId: string | null = null;
    setIsRunning(true);
    setTargetError(null);

    try {
      for (const target of targets) {
        if (progress[target.id]?.status === "done") continue;
        activeTargetId = target.id;

        if (currentChainId !== target.chainId) {
          updateProgress(target.id, { status: "switching" });
          await switchChainAsync({ chainId: target.chainId as 1 | 8453 });
          currentChainId = target.chainId;
        }

        updateProgress(target.id, { status: "confirming" });
        const hash =
          target.kind === "buyPrice"
            ? await writeContractAsync({
                address: getAddress(target.marketContract),
                abi: FOUNDATION_NFT_MARKET_ABI,
                functionName: "cancelBuyPrice",
                args: [
                  getAddress(target.contractAddress),
                  BigInt(target.tokenId),
                ],
                chainId: target.chainId as 1 | 8453,
              })
            : await cancelReserveAuction(target, writeContractAsync);

        updateProgress(target.id, { status: "mining", hash });
        await waitForTransactionReceipt(wagmiConfig, {
          chainId: target.chainId as 1 | 8453,
          hash,
        });
        updateProgress(target.id, { status: "done", hash });
        completedAny = true;
      }
    } catch (error) {
      const message = shortenError(error);
      setTargetError(message);
      if (activeTargetId) {
        updateProgress(activeTargetId, { status: "error", error: message });
      }
    } finally {
      setIsRunning(false);
      if (completedAny) {
        router.refresh();
        void loadTargets();
      }
    }
  };

  function updateProgress(id: string, next: TargetProgress) {
    setProgress((current) => ({ ...current, [id]: next }));
  }

  return (
    <section className="mt-6 rounded-sm border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            Bulk delist
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink)]/60">
            Cancel active Foundation buy-now listings and open reserve auctions
            from the seller wallet.
          </p>
        </div>
        <ConnectWalletButton variant="outline" />
      </div>

      {!isConnected ? (
        <PanelNotice>
          Connect the seller wallet to prepare delisting.
        </PanelNotice>
      ) : !connectedIsSeller ? (
        <PanelNotice>
          Connected wallet does not match this artist profile.
        </PanelNotice>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              onClick={() => void loadTargets()}
              disabled={isLoadingTargets || isRunning}
              variant={targets.length > 0 ? "outline" : "primary"}
            >
              {isLoadingTargets ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : targets.length > 0 ? (
                <RefreshCw className="h-3.5 w-3.5" />
              ) : null}
              {targets.length > 0 ? "Refresh targets" : "Prepare delist all"}
            </ActionButton>
            {targets.length > 0 ? (
              <ActionButton
                onClick={() => void runDelistAll()}
                disabled={
                  isRunning || isLoadingTargets || completed === targets.length
                }
                variant="primary"
              >
                {isRunning ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Delist all
              </ActionButton>
            ) : null}
          </div>

          {response ? (
            <div className="flex flex-wrap gap-2 text-xs text-[var(--color-muted)]">
              <StatPill>{targets.length} cancelable</StatPill>
              {chainCounts.ethereum > 0 ? (
                <StatPill>{chainCounts.ethereum} Ethereum</StatPill>
              ) : null}
              {chainCounts.base > 0 ? (
                <StatPill>{chainCounts.base} Base</StatPill>
              ) : null}
              {response.skipped.biddingAuctions > 0 ? (
                <StatPill>
                  {response.skipped.biddingAuctions} with bids locked
                </StatPill>
              ) : null}
              {response.skipped.otherSeller > 0 ? (
                <StatPill>{response.skipped.otherSeller} other seller</StatPill>
              ) : null}
            </div>
          ) : null}

          {response && targets.length === 0 && !isLoadingTargets ? (
            <PanelNotice>
              No cancelable listings found for this seller.
            </PanelNotice>
          ) : null}

          {targets.length > 0 ? (
            <TargetProgressList targets={targets} progress={progress} />
          ) : null}
        </div>
      )}

      {targetError ? (
        <p className="mt-3 text-xs text-[var(--color-err)]">{targetError}</p>
      ) : null}
    </section>
  );
}

async function cancelReserveAuction(
  target: BulkDelistTarget,
  writeContractAsync: ReturnType<typeof useWriteContract>["writeContractAsync"],
) {
  if (!target.auctionId) throw new Error("Missing auction id.");
  return writeContractAsync({
    address: getAddress(target.marketContract),
    abi: FOUNDATION_NFT_MARKET_ABI,
    functionName: "cancelReserveAuction",
    args: [BigInt(target.auctionId)],
    chainId: target.chainId as 1 | 8453,
  });
}

function TargetProgressList({
  targets,
  progress,
}: {
  targets: BulkDelistTarget[];
  progress: Record<string, TargetProgress>;
}) {
  return (
    <div className="max-h-72 overflow-y-auto rounded-sm border border-[var(--color-line)]">
      <ul className="divide-y divide-[var(--color-line)]">
        {targets.map((target) => {
          const state = progress[target.id]?.status ?? "queued";
          return (
            <li
              key={target.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
            >
              <div className="min-w-0">
                {target.slug ? (
                  <Link
                    href={`/archive/${target.slug}`}
                    className="block truncate font-medium text-[var(--color-ink)] hover:underline"
                  >
                    {target.title}
                  </Link>
                ) : (
                  <span className="block truncate font-medium text-[var(--color-ink)]">
                    {target.title}
                  </span>
                )}
                <span className="text-[var(--color-muted)]">
                  {chainNameFor(target.chainId)} ·{" "}
                  {target.kind === "buyPrice" ? "Buy now" : "Reserve auction"}{" "}
                  {formatTargetPrice(target)}
                </span>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--tint-muted)] px-2 py-1 text-[var(--color-muted)]">
                {statusLabel(state)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  variant: "primary" | "outline";
}) {
  const className =
    variant === "primary"
      ? "bg-[var(--color-ink)] text-[var(--color-bg)] hover:opacity-90"
      : "border border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:bg-[var(--color-surface-alt)]";
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.2, ease: EASE }}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${className}`}
    >
      {children}
    </motion.button>
  );
}

function PanelNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-sm bg-[var(--color-surface-alt)] px-3 py-2 text-xs leading-relaxed text-[var(--color-ink)]/60">
      {children}
    </p>
  );
}

function StatPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--color-surface-alt)] px-2.5 py-1">
      {children}
    </span>
  );
}

function countTargetsByChain(targets: BulkDelistTarget[]) {
  return targets.reduce(
    (counts, target) => {
      if (target.chainId === 1) counts.ethereum += 1;
      if (target.chainId === 8453) counts.base += 1;
      return counts;
    },
    { ethereum: 0, base: 0 },
  );
}

function formatTargetPrice(target: BulkDelistTarget) {
  const value = target.price ?? target.reservePrice;
  if (!value) return "";
  try {
    return `· ${formatEther(BigInt(value))} ETH`;
  } catch {
    return "";
  }
}

function statusLabel(status: TargetStatus) {
  switch (status) {
    case "queued":
      return "Ready";
    case "switching":
      return "Switching";
    case "confirming":
      return "Confirm";
    case "mining":
      return "Pending";
    case "done":
      return "Done";
    case "error":
      return "Stopped";
  }
}

function addressesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
) {
  if (!a || !b) return false;
  try {
    return isAddressEqual(getAddress(a), getAddress(b));
  } catch {
    return false;
  }
}

function chainNameFor(chainId: number) {
  if (chainId === 1) return "Ethereum";
  if (chainId === 8453) return "Base";
  return `chain ${chainId}`;
}

function shortenError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 180 ? `${message.slice(0, 180)}...` : message;
}
