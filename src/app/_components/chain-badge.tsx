import {
  BASE_CHAIN_ID,
  ETHEREUM_CHAIN_ID,
  chainLabel,
  chainShortLabel,
} from "~/lib/chain-label";
import { cn } from "~/lib/utils";

type ChainBadgeProps = {
  chainId: number;
  variant?: "short" | "full";
  className?: string;
};

function chainAccentClass(chainId: number) {
  if (chainId === BASE_CHAIN_ID) {
    return "border-[#1652F0]/40 bg-[#1652F0]/10 text-[#1652F0]";
  }
  if (chainId === ETHEREUM_CHAIN_ID) {
    return "border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-ink)]";
  }
  return "border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-muted)]";
}

export function ChainBadge({
  chainId,
  variant = "short",
  className,
}: ChainBadgeProps) {
  const label = variant === "short" ? chainShortLabel(chainId) : chainLabel(chainId);

  return (
    <span
      title={chainLabel(chainId)}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide",
        chainAccentClass(chainId),
        className,
      )}
    >
      {label}
    </span>
  );
}
