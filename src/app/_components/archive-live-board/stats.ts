import type { LucideIcon } from "lucide-react";
import { Activity, DatabaseZap, Orbit, ServerCog } from "lucide-react";

import type { ArchiveLiveSnapshot } from "~/lib/archive-live";

import type { Tone } from "./types";

export interface PipelineShares {
  pipelineTotal: number;
  preservedShare: number;
  queuedShare: number;
  deferredShare: number;
}

export interface StatCard {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: Tone;
  hint: string;
  meta: string;
  pulsing: boolean;
  progress: number | null;
}

export function computePipelineShares(
  stats: ArchiveLiveSnapshot["stats"],
): PipelineShares {
  const pipelineTotal = stats.artworks;
  if (pipelineTotal === 0) {
    return {
      pipelineTotal,
      preservedShare: 0,
      queuedShare: 0,
      deferredShare: 0,
    };
  }
  return {
    pipelineTotal,
    preservedShare: Math.min(
      (stats.fullyPreservedArtworks / pipelineTotal) * 100,
      100,
    ),
    queuedShare: Math.min((stats.pendingJobs / pipelineTotal) * 100, 100),
    deferredShare: Math.min((stats.deferredRoots / pipelineTotal) * 100, 100),
  };
}

function preservedCard(
  stats: ArchiveLiveSnapshot["stats"],
  shares: PipelineShares,
): StatCard {
  const partialArchiveCount = Math.max(
    stats.preservedRoots - stats.fullyPreservedArtworks,
    0,
  );
  const storageMeta =
    stats.pinnedRoots > 0
      ? `${stats.pinnedRoots.toLocaleString()} roots pinned to IPFS`
      : `${stats.downloadedRoots.toLocaleString()} files stored on our servers`;

  return {
    label: "Saved",
    value: stats.fullyPreservedArtworks,
    icon: DatabaseZap,
    tone: "ok",
    hint:
      shares.pipelineTotal > 0
        ? `${Math.round(shares.preservedShare)}% of tracked works are fully complete`
        : "Works fully complete on the archive",
    meta:
      partialArchiveCount > 0
        ? `${partialArchiveCount.toLocaleString()} still need remaining archive steps, ${storageMeta}`
        : storageMeta,
    pulsing: false,
    progress: shares.preservedShare,
  };
}

function queuedCard(
  stats: ArchiveLiveSnapshot["stats"],
  shares: PipelineShares,
): StatCard {
  return {
    label: "In line",
    value: stats.pendingJobs,
    icon: Activity,
    tone: stats.pendingJobs > 0 ? "warn" : "muted",
    hint:
      stats.pendingJobs > 0
        ? `${Math.round(shares.queuedShare)}% still being saved`
        : "Nothing waiting right now",
    meta:
      stats.pendingJobs > 0
        ? "These are being saved automatically"
        : "All caught up",
    pulsing: stats.pendingJobs > 0,
    progress: shares.queuedShare,
  };
}

function deferredCard(
  stats: ArchiveLiveSnapshot["stats"],
  shares: PipelineShares,
): StatCard {
  return {
    label: "Scheduled",
    value: stats.deferredRoots,
    icon: Orbit,
    tone: "info",
    hint:
      stats.deferredRoots > 0
        ? `${Math.round(shares.deferredShare)}% held for a larger save batch`
        : "No larger works waiting for a later batch",
    meta:
      stats.deferredRoots > 0
        ? "We'll pick these up as capacity grows"
        : "Covering everything found so far",
    pulsing: false,
    progress: shares.deferredShare,
  };
}

function trackedCard(stats: ArchiveLiveSnapshot["stats"]): StatCard {
  const collectionsLabel = `${stats.contracts.toLocaleString()} collection${stats.contracts === 1 ? "" : "s"}`;
  return {
    label: "Tracked",
    value: stats.artworks,
    icon: ServerCog,
    tone: "muted",
    hint: "Works we know about",
    meta: collectionsLabel,
    pulsing: false,
    progress: null,
  };
}

export function buildStatCards(
  stats: ArchiveLiveSnapshot["stats"],
  shares: PipelineShares,
): Array<StatCard> {
  return [
    preservedCard(stats, shares),
    queuedCard(stats, shares),
    deferredCard(stats, shares),
    trackedCard(stats),
  ];
}
