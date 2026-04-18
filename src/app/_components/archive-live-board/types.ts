import type { ArchiveLiveArtworkCard } from "~/lib/archive-live";

export type Tone = "ok" | "warn" | "err" | "info" | "muted";

export interface ActivityGroup {
  artwork: ArchiveLiveArtworkCard;
  key: string;
  sharedCount: number;
}

export interface ActivitySignal {
  label: string;
  summary: string;
  tone: Tone;
}

export interface SocketBadge {
  label: string;
  className: string;
  dotClass: string;
  pulse: boolean;
}
