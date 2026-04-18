export type ArchiveStatusFilter =
  | "all"
  | "preserved"
  | "partial"
  | "pending"
  | "failed"
  | "missing";

export type ArchiveMediaFilter =
  | "all"
  | "image"
  | "video"
  | "audio"
  | "html"
  | "model";

export type ArchiveSort = "newest" | "oldest" | "title";

export type ArchiveBrowseItem = {
  lookupSource: "ARCHIVED" | "FOUNDATION_LIVE";
  metadataCid: string | null;
  mediaCid: string | null;
  metadataStatus: string;
  mediaStatus: string;
  mediaKind: string;
};

export const ARCHIVE_SORT_OPTIONS: Array<{
  id: ArchiveSort;
  label: string;
  hint: string;
}> = [
  {
    id: "newest",
    label: "Newest",
    hint: "Latest archive activity first",
  },
  {
    id: "oldest",
    label: "Oldest",
    hint: "Walk the archive from the beginning",
  },
  {
    id: "title",
    label: "Title A-Z",
    hint: "Alphabetical title order",
  },
];

export function normalizeArchiveSort(
  value: string | null | undefined,
): ArchiveSort {
  switch (value) {
    case "oldest":
    case "title":
      return value;
    case "newest":
    case null:
    case undefined:
    default:
      return "newest";
  }
}

export function normalizeArchiveStatus(
  value: string | null | undefined,
): ArchiveStatusFilter {
  switch (value) {
    case "preserved":
    case "partial":
    case "pending":
    case "failed":
    case "missing":
      return value;
    case "all":
    case null:
    case undefined:
    default:
      return "all";
  }
}

export function normalizeArchiveMedia(
  value: string | null | undefined,
): ArchiveMediaFilter {
  switch (value) {
    case "image":
    case "video":
    case "audio":
    case "html":
    case "model":
      return value;
    case "all":
    case null:
    case undefined:
    default:
      return "all";
  }
}

function isPinned(status: string): boolean {
  return status === "PINNED";
}

function isDownloaded(status: string): boolean {
  return status === "DOWNLOADED" || isPinned(status);
}

function isFailed(status: string): boolean {
  return status === "FAILED";
}

function isAllPinned(item: ArchiveBrowseItem): boolean {
  const metadataOk = !item.metadataCid || isPinned(item.metadataStatus);
  const mediaOk = !item.mediaCid || isPinned(item.mediaStatus);
  return metadataOk && mediaOk;
}

function isAllDownloaded(item: ArchiveBrowseItem): boolean {
  const metadataOk = !item.metadataCid || isDownloaded(item.metadataStatus);
  const mediaOk = !item.mediaCid || isDownloaded(item.mediaStatus);
  return metadataOk && mediaOk;
}

export function archiveItemStatus(
  item: ArchiveBrowseItem,
): Exclude<ArchiveStatusFilter, "all"> {
  if (item.lookupSource === "FOUNDATION_LIVE") return "missing";

  const hasMetadataRoot = Boolean(item.metadataCid);
  const hasMediaRoot = Boolean(item.mediaCid);

  if (!hasMetadataRoot && !hasMediaRoot) return "missing";
  if (isFailed(item.metadataStatus) || isFailed(item.mediaStatus)) return "failed";
  if (isAllPinned(item)) return "preserved";
  if (isAllDownloaded(item)) return "partial";
  return "pending";
}

export function archiveItemMatchesFilters(
  item: ArchiveBrowseItem,
  status: ArchiveStatusFilter,
  media: ArchiveMediaFilter,
) {
  if (status !== "all" && archiveItemStatus(item) !== status) return false;
  if (media !== "all" && item.mediaKind.toLowerCase() !== media) return false;
  return true;
}
