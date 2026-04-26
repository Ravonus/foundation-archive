"use client";

import { LoaderCircle, RotateCw } from "lucide-react";

import { useArchiveSaveManager } from "~/app/_components/archive-save-manager";

type RetrySaveButtonProps = {
  title: string;
  chainId: number;
  contractAddress: string;
  tokenId: string;
  foundationUrl: string | null;
};

export function RetrySaveButton({
  title,
  chainId,
  contractAddress,
  tokenId,
  foundationUrl,
}: RetrySaveButtonProps) {
  const { requestArchiveSave, getWorkState } = useArchiveSaveManager();
  const work = {
    title,
    chainId,
    contractAddress,
    tokenId,
    foundationUrl,
    artistUsername: null,
    metadataCid: null,
    mediaCid: null,
  };
  const busy = getWorkState(work).archive === "pending";

  return (
    <button
      type="button"
      data-umami-event="retry-save-artwork"
      onClick={() => {
        void requestArchiveSave(work);
      }}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)] disabled:opacity-50"
    >
      {busy ? (
        <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RotateCw aria-hidden className="h-3.5 w-3.5" />
      )}
      {busy ? "Queued" : "Retry save"}
    </button>
  );
}
