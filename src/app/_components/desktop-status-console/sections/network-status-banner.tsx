"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, RefreshCcw, WifiOff } from "lucide-react";

import type { BridgeNetworkStatus } from "~/app/_components/desktop-bridge-provider";

type NetworkStatusBannerProps = {
  status: BridgeNetworkStatus;
  relayConnected: boolean;
  localBridgeProbeEnabled: boolean;
  reachable: boolean;
  retry: () => void;
};

function useCountdown(target: number | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (target === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [target]);

  if (target === null) return null;
  return Math.max(0, Math.ceil((target - now) / 1000));
}

function BannerBody({
  status,
  retry,
}: {
  status: BridgeNetworkStatus;
  retry: () => void;
}) {
  const countdown = useCountdown(status.retrying ? null : status.nextRetryAt);

  const subline = (() => {
    if (status.retrying) {
      return `Retrying… (attempt ${status.attempts})`;
    }
    if (countdown !== null && countdown > 0) {
      return `Next attempt in ${countdown}s · ${status.attempts} tr${status.attempts === 1 ? "y" : "ies"} so far`;
    }
    return `${status.attempts} tr${status.attempts === 1 ? "y" : "ies"} so far`;
  })();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-warn)]/30 bg-[var(--tint-warn)] px-4 py-3 text-sm text-[var(--color-body)]">
      <div className="flex min-w-0 items-start gap-3">
        {status.retrying ? (
          <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--color-warn)]" />
        ) : (
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warn)]" />
        )}
        <div className="min-w-0">
          <p className="font-medium text-[var(--color-ink)]">
            The desktop app isn&apos;t open on this computer
          </p>
          <p className="mt-0.5 text-[0.78rem] text-[var(--color-muted)]">
            {subline}
          </p>
          {status.lastError ? (
            <p className="mt-1 line-clamp-2 text-[0.72rem] text-[var(--color-muted)]/80">
              {status.lastError}
            </p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={retry}
        disabled={status.retrying}
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-3 py-1.5 text-xs text-[var(--color-bg)] disabled:opacity-55"
      >
        <RefreshCcw className="h-3.5 w-3.5" />
        Retry now
      </button>
    </div>
  );
}

function RelayConnectedBanner({
  localBridgeProbeEnabled,
  retry,
}: {
  localBridgeProbeEnabled: boolean;
  retry: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-ok)]/30 bg-[var(--tint-ok)] px-4 py-3 text-sm text-[var(--color-body)]">
      <div className="flex min-w-0 items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ok)]" />
        <div className="min-w-0">
          <p className="font-medium text-[var(--color-ink)]">
            Desktop app connected over the archive relay
          </p>
          <p className="mt-0.5 text-[0.78rem] text-[var(--color-muted)]">
            This page can still send works to your linked desktop app. Open the
            app on this same computer only if you want local-only settings or a
            direct localhost view.
          </p>
        </div>
      </div>
      {localBridgeProbeEnabled ? (
        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-3 py-1.5 text-xs text-[var(--color-bg)]"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Check local app
        </button>
      ) : null}
    </div>
  );
}

export function NetworkStatusBanner({
  status,
  relayConnected,
  localBridgeProbeEnabled,
  reachable,
  retry,
}: NetworkStatusBannerProps) {
  if (relayConnected) {
    return (
      <RelayConnectedBanner
        localBridgeProbeEnabled={localBridgeProbeEnabled}
        retry={retry}
      />
    );
  }

  if (!localBridgeProbeEnabled) return null;
  if (reachable) return null;
  if (status.attempts === 0 && !status.lastError) return null;
  return <BannerBody status={status} retry={retry} />;
}
