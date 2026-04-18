"use client";

import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCcw } from "lucide-react";

import type {
  BridgeNetworkStatus,
  RelayOwnerDevice,
} from "~/app/_components/desktop-bridge-provider";

import { NetworkStatusBanner } from "./network-status-banner";
import { statusLabel } from "../types";

type HeaderProps = {
  selectedDevice: RelayOwnerDevice | null;
  isRefreshing: boolean;
  reload: () => void;
  feedback: string | null;
  error: string | null;
  networkStatus: BridgeNetworkStatus;
  reachable: boolean;
  retryNetwork: () => void;
};

function HeaderIntro() {
  return (
    <div className="max-w-3xl">
      <p className="font-mono text-[0.68rem] tracking-[0.3em] text-[var(--color-muted)] uppercase">
        Desktop app
      </p>
      <h2 className="mt-2 font-serif text-4xl text-[var(--color-ink)]">
        Keep works safe on your own computer
      </h2>
      <p className="mt-3 max-w-2xl text-[var(--color-body)]">
        The archive site already backs up every work we know about. This app is
        for artists, collectors, and supporters who want a second copy on their
        own computer too. No setup knowledge required.
      </p>
    </div>
  );
}

function HeaderControls({
  selectedDevice,
  isRefreshing,
  reload,
}: {
  selectedDevice: RelayOwnerDevice | null;
  isRefreshing: boolean;
  reload: () => void;
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
  reachable,
  retryNetwork,
}: HeaderProps) {
  const message = feedback ?? error;

  return (
    <section className="rounded-2xl border border-[var(--color-line)] bg-[linear-gradient(180deg,var(--color-surface),var(--color-surface-quiet))] p-4 shadow-[0_30px_90px_-70px_rgba(17,17,17,0.35)] sm:rounded-3xl sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <HeaderIntro />
        <HeaderControls
          selectedDevice={selectedDevice}
          isRefreshing={isRefreshing}
          reload={reload}
        />
      </div>

      <div className="mt-4">
        <NetworkStatusBanner
          status={networkStatus}
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
              ? "mt-5 flex items-start gap-2 rounded-2xl border border-[var(--color-err)]/40 bg-[var(--tint-err)] px-4 py-3 text-sm text-[var(--color-err)]"
              : "mt-5 flex items-start gap-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-body)]"
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
    </section>
  );
}
