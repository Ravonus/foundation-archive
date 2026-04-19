import {
  normalizeArchiveMedia,
  normalizeArchiveSort,
  normalizeArchiveStatus,
  type ArchiveMediaFilter,
  type ArchiveSort,
  type ArchiveStatusFilter,
} from "~/lib/archive-browse";

export type ParsedArchiveSearchParams = {
  query: string;
  cursor: string | null;
  sort: ArchiveSort;
  status: ArchiveStatusFilter;
  media: ArchiveMediaFilter;
};

type ArchiveSearchParamRecord = Partial<{
  q: string | null | undefined;
  cursor: string | null | undefined;
  sort: string | null | undefined;
  status: string | null | undefined;
  media: string | null | undefined;
}>;

function readParam(
  input: URLSearchParams | ArchiveSearchParamRecord,
  key: keyof ArchiveSearchParamRecord,
) {
  if (input instanceof URLSearchParams) {
    return input.get(key) ?? undefined;
  }
  return input[key];
}

export function parseArchiveSearchParams(
  input: URLSearchParams | ArchiveSearchParamRecord,
): ParsedArchiveSearchParams {
  return {
    query: readParam(input, "q")?.trim() ?? "",
    cursor: readParam(input, "cursor")?.trim() ?? null,
    sort: normalizeArchiveSort(readParam(input, "sort")),
    status: normalizeArchiveStatus(readParam(input, "status")),
    media: normalizeArchiveMedia(readParam(input, "media")),
  };
}
