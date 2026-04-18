"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";

export function InventoryPreview({
  title,
  previewCandidates,
}: {
  title: string;
  previewCandidates: string[];
}) {
  const previewSeed = previewCandidates.join("\u0001");
  const [candidateState, setCandidateState] = useState(() => ({
    seed: previewSeed,
    index: 0,
  }));
  const candidateIndex =
    candidateState.seed === previewSeed ? candidateState.index : 0;

  const activePreview = previewCandidates[candidateIndex] ?? null;

  if (!activePreview) {
    return (
      <div className="mt-4 flex aspect-[1.2/1] w-full items-center justify-center rounded-[1.2rem] border border-dashed border-[var(--color-line)] bg-[var(--color-surface-alt)] text-[var(--color-subtle)]">
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={activePreview}
      alt={title}
      loading="lazy"
      onError={() => {
        setCandidateState((current) => ({
          seed: previewSeed,
          index:
            current.seed === previewSeed ? current.index + 1 : candidateIndex + 1,
        }));
      }}
      className="mt-4 block aspect-[1.2/1] w-full max-w-full rounded-[1.2rem] object-cover"
    />
  );
}
