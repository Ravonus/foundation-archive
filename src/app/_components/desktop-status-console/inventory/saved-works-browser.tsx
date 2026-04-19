"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight, Filter, LoaderCircle } from "lucide-react";
import { motion } from "motion/react";

import type {
  BridgePinInventoryItem,
  PinVerificationResult,
} from "~/app/_components/desktop-bridge-provider";
import { cn } from "~/lib/utils";

import { PinWorkCard, pinHealthFor, type PinHealth } from "./pin-work-card";
import {
  pinMatchesForItem,
  pinVerificationForItem,
  type PinMatch,
} from "../types";

export type DesktopStatusFilter = "all" | "saved" | "unreachable" | "missing";

const FILTER_CHIPS: Array<{
  id: DesktopStatusFilter;
  label: string;
  help: string;
}> = [
  { id: "all", label: "All", help: "Every pin on your computer" },
  {
    id: "saved",
    label: "Saved & on network",
    help: "Pinned with live providers",
  },
  {
    id: "unreachable",
    label: "Not on network",
    help: "Pinned locally but no providers found",
  },
  { id: "missing", label: "Needs saving", help: "Pin expected but not active" },
];

const PAGE_SIZE = 12;

const CHIP_BASE =
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition";

function chipClass(active: boolean) {
  if (!active) {
    return cn(
      CHIP_BASE,
      "border border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-ink)]",
    );
  }
  return cn(CHIP_BASE, "bg-[var(--color-ink)] text-[var(--color-bg)]");
}

export function normalizeDesktopStatus(
  value: string | null | undefined,
): DesktopStatusFilter {
  if (value === "saved" || value === "unreachable" || value === "missing") {
    return value;
  }
  return "all";
}

function parseCursor(raw: string | null): number {
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function matchesFilter(
  health: PinHealth,
  filter: DesktopStatusFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "saved") return health === "saved";
  if (filter === "unreachable") return health === "unreachable";
  return health === "missing";
}

type BrowserProps = {
  items: BridgePinInventoryItem[];
  pinEnrichment: Record<string, PinMatch[]>;
  pinVerifications: Record<string, PinVerificationResult>;
  verifying: boolean;
};

type FilterArgs = {
  items: BridgePinInventoryItem[];
  filter: DesktopStatusFilter;
  verifications: Record<string, PinVerificationResult>;
  verifying: boolean;
};

function buildFilteredItems(args: FilterArgs) {
  return args.items.filter((item) => {
    const verification = pinVerificationForItem(item, args.verifications);
    const health = pinHealthFor(item, verification, args.verifying);
    return matchesFilter(health, args.filter);
  });
}

function FilterRow({
  status,
  counts,
  setStatus,
}: {
  status: DesktopStatusFilter;
  counts: Record<DesktopStatusFilter, number>;
  setStatus: (next: DesktopStatusFilter) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[0.68rem] tracking-[0.2em] text-[var(--color-muted)] uppercase">
        <Filter className="h-3.5 w-3.5" />
        <span>Filter</span>
      </div>
      <div className="edge-fade-x mt-2 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-1.5">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              title={chip.help}
              onClick={() => setStatus(chip.id)}
              className={chipClass(status === chip.id)}
            >
              {chip.label}
              <span className="font-mono text-[0.7em] opacity-70">
                {counts[chip.id]}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Pagination({
  cursor,
  totalPages,
  renderedCount,
  totalMatches,
  goToPage,
  isNavigating,
}: {
  cursor: number;
  totalPages: number;
  renderedCount: number;
  totalMatches: number;
  goToPage: (next: number) => void;
  isNavigating: boolean;
}) {
  if (totalPages <= 1 && renderedCount <= PAGE_SIZE) return null;

  const start = cursor * PAGE_SIZE + 1;
  const end = Math.min(start + renderedCount - 1, totalMatches);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-[var(--color-muted)]">
      <div className="flex items-center gap-2">
        <span className="font-mono tabular-nums">
          {start}–{end} of {totalMatches}
        </span>
        {isNavigating ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goToPage(cursor - 1)}
          disabled={cursor === 0}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1 text-[var(--color-body)] hover:text-[var(--color-ink)] disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <span className="font-mono text-[0.7rem] text-[var(--color-subtle)] tabular-nums">
          {cursor + 1} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => goToPage(cursor + 1)}
          disabled={cursor + 1 >= totalPages}
          className="inline-flex items-center gap-1 rounded-full bg-[var(--color-ink)] px-3 py-1 text-[var(--color-bg)] disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function SavedWorksBrowser({
  items,
  pinEnrichment,
  pinVerifications,
  verifying,
}: BrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, startNavigation] = useTransition();

  const status = normalizeDesktopStatus(searchParams.get("pinStatus"));
  const cursor = parseCursor(searchParams.get("pinCursor"));

  const counts: Record<DesktopStatusFilter, number> = {
    all: items.length,
    saved: 0,
    unreachable: 0,
    missing: 0,
  };
  for (const item of items) {
    const verification = pinVerificationForItem(item, pinVerifications);
    const health = pinHealthFor(item, verification, verifying);
    if (health === "saved") counts.saved += 1;
    else if (health === "unreachable") counts.unreachable += 1;
    else if (health === "missing") counts.missing += 1;
  }

  const filtered = buildFilteredItems({
    items,
    filter: status,
    verifications: pinVerifications,
    verifying,
  });
  const totalMatches = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalMatches / PAGE_SIZE));
  const safeCursor = Math.min(cursor, Math.max(0, totalPages - 1));
  const pageStart = safeCursor * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const pushParams = (
    patch: Record<string, string | null>,
    options?: { resetCursor?: boolean },
  ) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === "all" || value === "0") next.delete(key);
      else next.set(key, value);
    }
    if (options?.resetCursor) next.delete("pinCursor");

    const href = next.toString() ? `${pathname}?${next}` : pathname;
    startNavigation(() => {
      router.push(href, { scroll: false });
    });
  };

  const setStatus = (nextStatus: DesktopStatusFilter) => {
    pushParams({ pinStatus: nextStatus }, { resetCursor: true });
  };

  const goToPage = (next: number) => {
    const clamped = Math.max(0, Math.min(next, totalPages - 1));
    pushParams({ pinCursor: clamped === 0 ? null : String(clamped) });
  };

  const largeGrid = pageItems.length > 9;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 sm:p-4">
        <FilterRow status={status} counts={counts} setStatus={setStatus} />
      </div>

      {pageItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface-alt)] px-6 py-12 text-center text-[var(--color-muted)]">
          {status === "all"
            ? "Nothing saved on your computer yet. Use the desktop app to add works you want to keep."
            : "No pins match this filter. Try a different one or go back to All."}
        </div>
      ) : (
        <motion.div
          className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          variants={{
            hidden: {},
            visible: {
              transition: {
                staggerChildren: largeGrid ? 0 : 0.06,
                delayChildren: 0.05,
              },
            },
          }}
        >
          {pageItems.map((item) => (
            <PinWorkCard
              key={item.cid}
              item={item}
              matches={pinMatchesForItem(item, pinEnrichment)}
              verification={pinVerificationForItem(item, pinVerifications)}
              verifying={verifying}
              largeGrid={largeGrid}
            />
          ))}
        </motion.div>
      )}

      <Pagination
        cursor={safeCursor}
        totalPages={totalPages}
        renderedCount={pageItems.length}
        totalMatches={totalMatches}
        goToPage={goToPage}
        isNavigating={isNavigating}
      />
    </div>
  );
}
