"use client";

import type { ComponentProps } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AnimatePresence, motion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

type ConnectWalletButtonProps = {
  variant?: "primary" | "outline";
  label?: string;
  className?: string;
};

type ConnectButtonRenderProps = Parameters<
  Exclude<ComponentProps<typeof ConnectButton.Custom>["children"], undefined>
>[0];
type ConnectedAccount = NonNullable<ConnectButtonRenderProps["account"]>;
type ConnectedChain = NonNullable<ConnectButtonRenderProps["chain"]>;

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function connectButtonClassName(
  variant: NonNullable<ConnectWalletButtonProps["variant"]>,
  className?: string,
) {
  if (className) return className;
  if (variant === "primary") {
    return "inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-[var(--color-bg)] shadow-sm transition hover:opacity-90 disabled:opacity-50";
  }
  return "inline-flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)]";
}

function ConnectWalletCta({
  className,
  label,
  onClick,
}: {
  className: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      key="connect"
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25, ease: EASE }}
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.985 }}
      className={className}
    >
      <WalletGlyph />
      <span>{label}</span>
    </motion.button>
  );
}

function WrongNetworkCta({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      key="wrong-network"
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--color-err)] bg-[var(--color-err)]/10 px-4 py-2 text-sm font-medium text-[var(--color-err)] transition hover:bg-[var(--color-err)]/20"
    >
      Wrong network
    </motion.button>
  );
}

function ConnectedWalletState({
  account,
  chain,
  openAccountModal,
  openChainModal,
}: {
  account: ConnectedAccount;
  chain: ConnectedChain;
  openAccountModal: () => void;
  openChainModal: () => void;
}) {
  return (
    <motion.div
      key="connected"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="inline-flex items-center gap-1"
    >
      <button
        type="button"
        onClick={openChainModal}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-surface-alt)]"
      >
        {chain.hasIcon && chain.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={chain.iconUrl}
            alt={chain.name ?? ""}
            width={14}
            height={14}
            className="h-3.5 w-3.5 rounded-full"
            style={{ background: chain.iconBackground }}
          />
        ) : null}
        <span>{chain.name ?? "Unknown"}</span>
      </button>
      <button
        type="button"
        onClick={openAccountModal}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-3.5 py-1.5 text-xs font-medium text-[var(--color-bg)] transition hover:opacity-90"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-brand-green-bright)]" />
        <span>{shorten(account.address)}</span>
      </button>
    </motion.div>
  );
}

export function ConnectWalletButton({
  variant = "primary",
  label = "Connect wallet",
  className,
}: ConnectWalletButtonProps) {
  const renderButton = ({
    account,
    chain,
    openAccountModal,
    openChainModal,
    openConnectModal,
    authenticationStatus,
    mounted,
  }: ConnectButtonRenderProps) => {
    const ready = mounted && authenticationStatus !== "loading";
    const connected =
      ready &&
      account &&
      chain &&
      (!authenticationStatus || authenticationStatus === "authenticated");
    const buttonClassName = connectButtonClassName(variant, className);

    return (
      <div
        aria-hidden={!ready ? true : undefined}
        className={
          !ready ? "pointer-events-none select-none opacity-0" : undefined
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          {!connected ? (
            <ConnectWalletCta
              className={buttonClassName}
              label={label}
              onClick={openConnectModal}
            />
          ) : chain.unsupported ? (
            <WrongNetworkCta onClick={openChainModal} />
          ) : (
            <ConnectedWalletState
              account={account}
              chain={chain}
              openAccountModal={openAccountModal}
              openChainModal={openChainModal}
            />
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <ConnectButton.Custom>{renderButton}</ConnectButton.Custom>
  );
}

function WalletGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="1.5"
        y="3"
        width="11"
        height="8"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M9.5 7.5h1.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
