"use client";

import { useMemo, useState } from "react";
import { ImageIcon } from "lucide-react";

import { ModelMediaPreview } from "~/app/_components/model-media-preview";

import {
  normalizePreviewKind,
  orderPreviewCandidates,
  type PreviewCandidate,
} from "./preview-media";

export function InventoryPreview({
  title,
  mediaKind,
  previewCandidates,
}: {
  title: string;
  mediaKind: string | null;
  previewCandidates: PreviewCandidate[];
}) {
  const orderedCandidates = useMemo(
    () =>
      orderPreviewCandidates(
        previewCandidates,
        normalizePreviewKind(mediaKind),
      ),
    [mediaKind, previewCandidates],
  );
  const previewSeed = orderedCandidates
    .map((candidate) => `${candidate.kind}:${candidate.url}`)
    .join("\u0001");
  const [candidateState, setCandidateState] = useState(() => ({
    seed: previewSeed,
    index: 0,
  }));
  const candidateIndex =
    candidateState.seed === previewSeed ? candidateState.index : 0;

  const activePreview = orderedCandidates[candidateIndex] ?? null;
  const fallbackImage =
    orderedCandidates.find(
      (candidate) =>
        candidate.kind === "IMAGE" && candidate.url !== activePreview?.url,
    )?.url ?? null;

  const advanceCandidate = () => {
    setCandidateState((current) => ({
      seed: previewSeed,
      index:
        current.seed === previewSeed ? current.index + 1 : candidateIndex + 1,
    }));
  };

  if (!activePreview) {
    return (
      <div className="mt-4 flex aspect-[1.2/1] w-full items-center justify-center rounded-[1.2rem] border border-dashed border-[var(--color-line)] bg-[var(--color-surface-alt)] text-[var(--color-subtle)]">
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  }

  if (activePreview.kind === "VIDEO") {
    return (
      <video
        src={activePreview.url}
        muted
        playsInline
        autoPlay
        loop
        controls
        poster={fallbackImage ?? undefined}
        preload="metadata"
        onError={advanceCandidate}
        className="mt-4 block aspect-[1.2/1] w-full max-w-full rounded-[1.2rem] object-cover"
      />
    );
  }

  if (activePreview.kind === "HTML") {
    return (
      <iframe
        src={activePreview.url}
        title={title}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        onError={advanceCandidate}
        className="mt-4 block aspect-[1.2/1] w-full max-w-full rounded-[1.2rem] border-0 bg-[var(--color-surface-alt)]"
      />
    );
  }

  if (activePreview.kind === "AUDIO") {
    return (
      <div className="mt-4 flex aspect-[1.2/1] w-full items-center justify-center rounded-[1.2rem] bg-[var(--color-surface-alt)] px-4">
        <audio
          src={activePreview.url}
          controls
          preload="metadata"
          onError={advanceCandidate}
          className="w-full"
        />
      </div>
    );
  }

  if (activePreview.kind === "MODEL") {
    const modelCandidates = orderedCandidates
      .filter(
        (candidate) =>
          candidate.kind === "MODEL" && candidate.url !== activePreview.url,
      )
      .map((candidate) => candidate.url);

    return (
      <ModelMediaPreview
        src={activePreview.url}
        candidates={modelCandidates}
        poster={fallbackImage}
        alt={title}
        className="mt-4 aspect-[1.2/1] w-full max-w-full rounded-[1.2rem]"
      />
    );
  }

  if (activePreview.kind === "UNKNOWN") {
    return (
      <div className="mt-4 flex aspect-[1.2/1] w-full items-center justify-center rounded-[1.2rem] border border-dashed border-[var(--color-line)] bg-[var(--color-surface-alt)] px-6 text-center text-sm text-[var(--color-subtle)]">
        Preview unavailable for this file type.
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={activePreview.url}
      alt={title}
      loading="lazy"
      onError={advanceCandidate}
      className="mt-4 block aspect-[1.2/1] w-full max-w-full rounded-[1.2rem] object-cover"
    />
  );
}
