/* eslint-disable max-lines-per-function, complexity */

"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  HardDriveDownload,
  LoaderCircle,
  Save,
  Server,
  Sparkles,
} from "lucide-react";

import {
  summarizeWorkTargetState,
  useArchiveSaveManager,
  type ArchiveSaveWork,
} from "~/app/_components/archive-save-manager";
import {
  hasDesktopShareSource,
  hasHostedPinRoots,
  useDesktopBridge,
} from "~/app/_components/desktop-bridge-provider";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";

type SaveTargetMenuProps = {
  work: ArchiveSaveWork;
  variant?: "compact" | "inline";
  className?: string;
};

function compactSummary(summary: ReturnType<typeof summarizeWorkTargetState>) {
  const totalSaved =
    summary.savedHosts +
    Number(summary.desktopSaved) +
    Number(summary.archiveSaved);
  const totalPending =
    summary.pendingHosts +
    Number(summary.desktopPending) +
    Number(summary.archivePending);

  if (totalPending > 0) return `Saving ${totalPending}`;
  if (totalSaved > 0) return `Pinned ${totalSaved}`;
  return "Pin";
}

function targetStatusLabel(
  status: "PINNED" | "PENDING" | "FAILED" | "PARTIAL",
) {
  switch (status) {
    case "PINNED":
      return "Pinned";
    case "PENDING":
      return "Working";
    case "PARTIAL":
      return "Partial";
    case "FAILED":
      return "Retry";
  }
}

function targetStatusClass(
  status: "PINNED" | "PENDING" | "FAILED" | "PARTIAL",
) {
  switch (status) {
    case "PINNED":
      return "bg-[var(--tint-ok)] text-[var(--color-ok)]";
    case "PENDING":
      return "bg-[var(--tint-info)] text-[var(--color-info)]";
    case "PARTIAL":
      return "bg-[var(--tint-warn)] text-[var(--color-warn)]";
    case "FAILED":
      return "bg-[var(--tint-err)] text-[var(--color-err)]";
  }
}

export function SaveTargetMenu({
  work,
  variant = "compact",
  className,
}: SaveTargetMenuProps) {
  const bridge = useDesktopBridge();
  const {
    pinHosts,
    pinHostsReady,
    requestArchiveSave,
    saveToDesktop,
    saveToHosts,
    saveEverywhere,
    getWorkState,
  } = useArchiveSaveManager();
  const [open, setOpen] = useState(false);
  const optimisticState = getWorkState(work);
  const autoHosts = pinHosts.filter((host) => host.enabled && host.autoPin);
  const canDesktopSave = hasDesktopShareSource(work);
  const canHostPin = hasHostedPinRoots(work);
  const hasDesktopRoute = bridge.reachable || bridge.relayDevices.length > 0;

  const workStateQuery = api.pinHosts.getWorkStates.useQuery(
    {
      ownerToken: bridge.ownerToken ?? "",
      works: [work],
    },
    {
      enabled: open && pinHostsReady,
      staleTime: 10_000,
    },
  );

  const remoteStates = useMemo(
    () =>
      workStateQuery.data?.[
        `${work.chainId}:${work.contractAddress.toLowerCase()}:${work.tokenId}`
      ] ?? [],
    [work.chainId, work.contractAddress, work.tokenId, workStateQuery.data],
  );

  const summary = summarizeWorkTargetState(optimisticState, remoteStates);
  const summaryLabel = compactSummary(summary);

  const hostStatuses = useMemo(
    () =>
      Object.fromEntries(remoteStates.map((state) => [state.hostId, state])),
    [remoteStates],
  );

  return (
    <details
      open={open}
      onToggle={(event) =>
        setOpen((event.currentTarget as HTMLDetailsElement).open)
      }
      className={cn("relative z-20", open ? "z-[120]" : null, className)}
    >
      <summary
        className={cn(
          "list-none",
          variant === "compact"
            ? "cursor-pointer"
            : "inline-flex cursor-pointer",
        )}
      >
        {variant === "compact" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] shadow-sm">
            {summary.pendingHosts > 0 ||
            summary.desktopPending ||
            summary.archivePending ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : summary.savedHosts > 0 || summary.desktopSaved ? (
              <Check className="h-3.5 w-3.5 text-[var(--color-ok)]" />
            ) : (
              <HardDriveDownload className="h-3.5 w-3.5" />
            )}
            {summaryLabel}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-ink)]">
            <HardDriveDownload className="h-4 w-4" />
            Save / pin
            <ChevronDown className="h-4 w-4" />
          </span>
        )}
      </summary>

      <div className="absolute top-[calc(100%+0.6rem)] right-0 z-[130] w-[min(24rem,calc(100vw-2rem))] rounded-[1.5rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[0_30px_90px_-35px_rgba(17,17,17,0.6)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-serif text-lg text-[var(--color-ink)]">
              {work.title}
            </p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Queue it for Agorix, your desktop app, or your own pinned hosts.
            </p>
          </div>
          {summary.savedHosts > 0 || summary.pendingHosts > 0 ? (
            <span className="rounded-full bg-[var(--color-surface-alt)] px-2.5 py-1 text-[0.68rem] tracking-[0.18em] text-[var(--color-muted)] uppercase">
              {summary.savedHosts > 0
                ? `${summary.savedHosts} host${summary.savedHosts === 1 ? "" : "s"}`
                : `${summary.pendingHosts} pending`}
            </span>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void requestArchiveSave(work);
              setOpen(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-3.5 py-2 text-xs font-medium text-[var(--color-bg)] hover:opacity-90"
          >
            <Save className="h-3.5 w-3.5" />
            Save to Agorix
          </button>

          {canDesktopSave ? (
            <button
              type="button"
              onClick={() => {
                void saveToDesktop(work);
                setOpen(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-3.5 py-2 text-xs font-medium text-[var(--color-body)] hover:text-[var(--color-ink)]"
            >
              <HardDriveDownload className="h-3.5 w-3.5" />
              {hasDesktopRoute ? "Pin to desktop" : "Desktop app"}
            </button>
          ) : null}

          {(autoHosts.length > 0 || hasDesktopRoute) && (
            <button
              type="button"
              onClick={() => {
                void saveEverywhere(work);
                setOpen(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-3.5 py-2 text-xs font-medium text-[var(--color-body)] hover:text-[var(--color-ink)]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Pin everywhere
            </button>
          )}
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs tracking-[0.2em] text-[var(--color-muted)] uppercase">
              Pinned hosts
            </p>
            {autoHosts.length > 0 ? (
              <button
                type="button"
                disabled={!canHostPin}
                onClick={() => {
                  void saveToHosts(
                    work,
                    autoHosts.map((host) => host.id),
                  );
                  setOpen(false);
                }}
                className="text-xs text-[var(--color-ink)] disabled:opacity-45"
              >
                {canHostPin ? "Pin all enabled" : "Needs IPFS roots"}
              </button>
            ) : null}
          </div>

          {!canHostPin ? (
            <p className="rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface-alt)] px-4 py-3 text-sm text-[var(--color-muted)]">
              This work can go to your desktop app now. Your pinned hosts need
              IPFS roots first, so import it onto your machine before sending it
              to those hosts.
            </p>
          ) : null}

          {pinHosts.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface-alt)] px-4 py-3 text-sm text-[var(--color-muted)]">
              Add hosts from the desktop page, then they&apos;ll appear here.
            </p>
          ) : (
            pinHosts.map((host) => {
              const remoteStatus = hostStatuses[host.id] ?? null;
              const optimisticHost = optimisticState.hosts[host.id] ?? null;
              const derivedStatus =
                remoteStatus?.status ??
                (optimisticHost?.status === "saved"
                  ? "PINNED"
                  : optimisticHost?.status === "pending"
                    ? "PENDING"
                    : optimisticHost?.status === "error"
                      ? "FAILED"
                      : null);

              return (
                <div
                  key={host.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-ink)]">
                      {host.label}
                    </p>
                    <p className="truncate text-xs text-[var(--color-muted)]">
                      {host.presetLabel}
                      {host.autoPin ? " · auto" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {derivedStatus ? (
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[0.68rem] tracking-[0.16em] uppercase",
                          targetStatusClass(derivedStatus),
                        )}
                      >
                        {targetStatusLabel(derivedStatus)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      disabled={!host.enabled || !canHostPin}
                      onClick={() => {
                        void saveToHosts(work, [host.id]);
                        setOpen(false);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-xs text-[var(--color-body)] hover:text-[var(--color-ink)] disabled:opacity-45"
                    >
                      <Server className="h-3.5 w-3.5" />
                      {canHostPin
                        ? derivedStatus === "PINNED"
                          ? "Pin again"
                          : "Pin"
                        : "Needs IPFS"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </details>
  );
}
