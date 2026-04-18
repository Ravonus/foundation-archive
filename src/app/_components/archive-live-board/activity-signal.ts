import type { ArchiveLiveArtworkCard, ArchiveLiveEvent } from "~/lib/archive-live";

import { eventTone } from "./tone";
import type { ActivitySignal } from "./types";

export function isArtworkCard(
  artwork: ArchiveLiveArtworkCard | null,
): artwork is ArchiveLiveArtworkCard {
  return Boolean(artwork);
}

export function activityGroupKey(artwork: ArchiveLiveArtworkCard) {
  return `${artwork.metadataCid ?? "no-metadata"}:${artwork.mediaCid ?? "no-media"}`;
}

export function activityGroupMatchesEvent(
  artwork: ArchiveLiveArtworkCard,
  event: ArchiveLiveEvent | null,
) {
  if (!event) return false;
  if (event.artwork) {
    return activityGroupKey(artwork) === activityGroupKey(event.artwork);
  }

  if (!event.cid) return false;
  return artwork.metadataCid === event.cid || artwork.mediaCid === event.cid;
}

type SignalCategory = "preserved" | "queued" | "discovered" | "live";

const SIGNAL_FALLBACKS: Record<SignalCategory, { label: string; fallback: string }> =
  {
    preserved: {
      label: "Just saved",
      fallback: "A new work was just saved to the archive.",
    },
    queued: {
      label: "Just added to the line",
      fallback: "A new work is waiting to be saved.",
    },
    discovered: {
      label: "Just found",
      fallback: "A new work was just discovered.",
    },
    live: {
      label: "Live update",
      fallback: "This feed updates as new works are found and saved.",
    },
  };

function signalCategory(type: string): SignalCategory {
  if (type.includes("pinned") || type.includes("downloaded")) return "preserved";
  if (type.includes("queue")) return "queued";
  if (type.includes("discover")) return "discovered";
  return "live";
}

export function activitySignal(event: ArchiveLiveEvent | null): ActivitySignal {
  const tone = eventTone(event?.type ?? "");
  const type = event?.type.toLowerCase() ?? "";
  const { label, fallback } = SIGNAL_FALLBACKS[signalCategory(type)];

  return {
    label,
    summary: event?.summary ?? fallback,
    tone,
  };
}
