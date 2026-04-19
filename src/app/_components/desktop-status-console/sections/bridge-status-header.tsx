"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  HelpCircle,
  LoaderCircle,
  RefreshCcw,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import type {
  BridgeNetworkStatus,
  RelayOwnerDevice,
} from "~/app/_components/desktop-bridge-provider";

import { NetworkStatusBanner } from "./network-status-banner";
import { statusLabel } from "../types";

const DESKTOP_APP_REPO_URL =
  "https://github.com/Ravonus/foundation-share-bridge";

type HeaderProps = {
  selectedDevice: RelayOwnerDevice | null;
  isRefreshing: boolean;
  reload: () => void;
  feedback: string | null;
  error: string | null;
  networkStatus: BridgeNetworkStatus;
  relayConnected: boolean;
  localBridgeProbeEnabled: boolean;
  reachable: boolean;
  retryNetwork: () => void;
};

function HelpModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="About the desktop app"
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
        >
          <motion.button
            type="button"
            aria-label="Close help"
            onClick={onClose}
            className="absolute inset-0 bg-[var(--color-ink)]/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          />
          <motion.div
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 12, scale: 0.98 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 8, scale: 0.98 }
            }
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-[var(--color-line)] bg-[var(--color-bg)] shadow-[0_40px_120px_-60px_rgba(17,17,17,0.55)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--color-line)] px-6 py-5">
              <div>
                <p className="font-mono text-[0.68rem] tracking-[0.3em] text-[var(--color-muted)] uppercase">
                  About
                </p>
                <h2 className="mt-1 font-serif text-2xl text-[var(--color-ink)]">
                  What is the desktop app?
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close help"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-line-strong)] text-[var(--color-ink)] hover:bg-[var(--color-surface)]"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-6 text-sm text-[var(--color-body)]">
              <p>
                The archive site already backs up every work we know about.
                This app is for artists, collectors, and supporters who want a
                second copy on their own computer too.
              </p>
              <p>
                Once linked, any archive page can pin a work to your computer
                with one click. You stay in control — disconnect any time and
                your saved works stay on your machine.
              </p>
              <p className="text-[var(--color-muted)]">
                The archive works fine without this app. Use it only if you
                want that second local copy.
              </p>
              <a
                href={DESKTOP_APP_REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)] hover:opacity-90"
              >
                Desktop app on GitHub
                <ArrowUpRight aria-hidden className="h-4 w-4" />
              </a>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function HeaderControls({
  selectedDevice,
  isRefreshing,
  reload,
  onOpenHelp,
}: {
  selectedDevice: RelayOwnerDevice | null;
  isRefreshing: boolean;
  reload: () => void;
  onOpenHelp: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex rounded-full px-3 py-1 text-[0.68rem] tracking-[0.22em] uppercase ${
          selectedDevice?.connected
            ? "bg-[var(--tint-ok)] text-[var(--color-ok)]"
            : "bg-[var(--tint-muted)] text-[var(--color-muted)]"
        }`}
      >
        {statusLabel(selectedDevice)}
      </span>
      <button
        type="button"
        onClick={reload}
        disabled={isRefreshing}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-body)] disabled:opacity-55"
      >
        {isRefreshing ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCcw className="h-4 w-4" />
        )}
        Refresh
      </button>
      <button
        type="button"
        onClick={onOpenHelp}
        aria-label="What is this?"
        className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-body)] hover:text-[var(--color-ink)]"
      >
        <HelpCircle aria-hidden className="h-4 w-4" />
        What is this?
      </button>
    </div>
  );
}

export function BridgeStatusHeader({
  selectedDevice,
  isRefreshing,
  reload,
  feedback,
  error,
  networkStatus,
  relayConnected,
  localBridgeProbeEnabled,
  reachable,
  retryNetwork,
}: HeaderProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const message = feedback ?? error;

  return (
    <section className="rounded-2xl border border-[var(--color-line)] bg-[linear-gradient(180deg,var(--color-surface),var(--color-surface-quiet))] p-4 shadow-[0_30px_90px_-70px_rgba(17,17,17,0.35)] sm:rounded-3xl sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[0.68rem] tracking-[0.3em] text-[var(--color-muted)] uppercase">
            Desktop app
          </p>
          <h2 className="mt-1 font-serif text-2xl text-[var(--color-ink)] sm:text-3xl">
            Controls
          </h2>
        </div>
        <HeaderControls
          selectedDevice={selectedDevice}
          isRefreshing={isRefreshing}
          reload={reload}
          onOpenHelp={() => setHelpOpen(true)}
        />
      </div>

      <div className="mt-4">
        <NetworkStatusBanner
          status={networkStatus}
          relayConnected={relayConnected}
          localBridgeProbeEnabled={localBridgeProbeEnabled}
          reachable={reachable}
          retry={retryNetwork}
        />
      </div>

      {message ? (
        <div
          role={error ? "alert" : "status"}
          aria-live="polite"
          className={
            error
              ? "mt-4 flex items-start gap-2 rounded-2xl border border-[var(--color-err)]/40 bg-[var(--tint-err)] px-4 py-3 text-sm text-[var(--color-err)]"
              : "mt-4 flex items-start gap-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-body)]"
          }
        >
          {error ? (
            <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2
              aria-hidden
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ok)]"
            />
          )}
          <span>{message}</span>
        </div>
      ) : null}

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </section>
  );
}
