"use client";

import { LoaderCircle, Radio, Wrench } from "lucide-react";

import type {
  BridgePinInventoryItem,
  PinVerificationResult,
  RelayOwnerDevice,
} from "~/app/_components/desktop-bridge-provider";

import { SavedWorksBrowser } from "../inventory/saved-works-browser";
import type { PinMatch } from "../types";

type SavedWorksProps = {
  visibleItems: BridgePinInventoryItem[];
  pinnedCount: number;
  selectedDevice: RelayOwnerDevice | null;
  visibleInventoryLabel: string;
  pinEnrichment: Record<string, PinMatch[]>;
  pinVerifications: Record<string, PinVerificationResult>;
  isVerifying: boolean;
  reachable: boolean;
  isRepairing: boolean;
  runRepair: () => void;
  runVerify: () => void;
};

function SectionHeader({
  visibleInventoryLabel,
  pinnedCount,
  totalCount,
  unreachableCount,
}: {
  visibleInventoryLabel: string;
  pinnedCount: number;
  totalCount: number;
  unreachableCount: number;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="font-mono text-[0.68rem] tracking-[0.3em] text-[var(--color-muted)] uppercase">
          Step 3 · {visibleInventoryLabel}
        </p>
        <h3 className="mt-2 font-serif text-3xl text-[var(--color-ink)]">
          Works saved on this computer
        </h3>
      </div>
      <p className="max-w-xl text-sm text-[var(--color-body)]">
        <span title="Works fully saved on this computer.">
          {pinnedCount} saved
        </span>{" "}
        · <span title="Works the app knows about (saved or pending).">
          {totalCount} tracked
        </span>
        {unreachableCount > 0
          ? ` · ${unreachableCount} not visible on the network yet`
          : ""}
      </p>
    </div>
  );
}

function ActionBar({
  reachable,
  isVerifying,
  isRepairing,
  runVerify,
  runRepair,
  needsRepair,
  unreachableCount,
}: {
  reachable: boolean;
  isVerifying: boolean;
  isRepairing: boolean;
  runVerify: () => void;
  runRepair: () => void;
  needsRepair: number;
  unreachableCount: number;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--color-body)]">
      <button
        type="button"
        onClick={runVerify}
        disabled={!reachable || isVerifying}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-1.5 text-xs text-[var(--color-body)] hover:text-[var(--color-ink)] disabled:opacity-55"
        title="Ask the IPFS network if your saved works are visible to others."
      >
        {isVerifying ? (
          <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Radio aria-hidden className="h-3.5 w-3.5" />
        )}
        Check visibility
      </button>

      {needsRepair > 0 ? (
        <button
          type="button"
          onClick={runRepair}
          disabled={!reachable || isRepairing}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-1.5 text-xs text-[var(--color-bg)] disabled:opacity-55"
          title="Try saving any works that didn't finish."
        >
          {isRepairing ? (
            <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wrench aria-hidden className="h-3.5 w-3.5" />
          )}
          Re-save {needsRepair} work{needsRepair === 1 ? "" : "s"}
        </button>
      ) : null}

      {unreachableCount > 0 ? (
        <span className="text-[0.78rem] text-[var(--color-muted)]">
          {unreachableCount} work{unreachableCount === 1 ? "" : "s"} not visible
          on the network yet. Your copy is safe — the network just hasn&apos;t
          picked them up yet. &ldquo;Re-save&rdquo; can help.
        </span>
      ) : null}
    </div>
  );
}

export function SavedWorksSection(props: SavedWorksProps) {
  const needsRepair =
    !props.selectedDevice && props.visibleItems.length - props.pinnedCount > 0
      ? props.visibleItems.length - props.pinnedCount
      : 0;

  const unreachableCount = props.visibleItems.reduce((count, item) => {
    const verification = props.pinVerifications[item.cid];
    if (!verification) return count;
    if (!item.pinned) return count;
    if (verification.reachable && verification.providerCount > 0) return count;
    return count + 1;
  }, 0);

  return (
    <section className="rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
      <SectionHeader
        visibleInventoryLabel={props.visibleInventoryLabel}
        pinnedCount={props.pinnedCount}
        totalCount={props.visibleItems.length}
        unreachableCount={unreachableCount}
      />

      <ActionBar
        reachable={props.reachable}
        isVerifying={props.isVerifying}
        isRepairing={props.isRepairing}
        runVerify={props.runVerify}
        runRepair={props.runRepair}
        needsRepair={needsRepair}
        unreachableCount={unreachableCount}
      />

      <div className="mt-6">
        <SavedWorksBrowser
          items={props.visibleItems}
          pinEnrichment={props.pinEnrichment}
          pinVerifications={props.pinVerifications}
          verifying={props.isVerifying}
        />
      </div>
    </section>
  );
}
