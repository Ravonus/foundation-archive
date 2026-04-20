"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { api } from "~/trpc/react";

type FeedbackState = { tone: "success" | "error"; message: string };

type RetrySaveButtonProps = {
  chainId: number;
  contractAddress: string;
  tokenId: string;
  foundationUrl: string | null;
};

export function RetrySaveButton({
  chainId,
  contractAddress,
  tokenId,
  foundationUrl,
}: RetrySaveButtonProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

  useEffect(() => {
    if (!feedback) return;
    const id = window.setTimeout(() => setFeedback(null), 6000);
    return () => window.clearTimeout(id);
  }, [feedback]);

  const mutation = api.archive.requestArtworkArchive.useMutation({
    onSuccess: (result) => {
      if (result.state === "already-pinned") {
        setFeedback({
          tone: "success",
          message: `${result.title ?? "This work"} is already saved.`,
        });
      } else {
        setFeedback({
          tone: "success",
          message: `Added to the line. You're ${
            result.jobsAhead === 0 ? "next up" : `#${result.jobsAhead + 1}`
          }.`,
        });
      }
      startRefresh(() => router.refresh());
    },
    onError: (error) => {
      setFeedback({
        tone: "error",
        message: error.message || "Something went wrong. Please try again.",
      });
    },
  });

  const busy = mutation.isPending || isRefreshing;

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <button
        type="button"
        data-umami-event="retry-save-artwork"
        onClick={() => {
          mutation.mutate({
            chainId,
            contractAddress,
            tokenId,
            foundationUrl: foundationUrl ?? undefined,
          });
        }}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)] disabled:opacity-50"
      >
        {busy ? (
          <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RotateCw aria-hidden className="h-3.5 w-3.5" />
        )}
        Retry save
      </button>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {feedback?.message ?? ""}
      </div>
      {feedback ? (
        <p
          role={feedback.tone === "error" ? "alert" : "status"}
          className={
            feedback.tone === "error"
              ? "inline-flex items-start gap-1.5 text-xs text-[var(--color-err)]"
              : "inline-flex items-start gap-1.5 text-xs text-[var(--color-muted)]"
          }
        >
          {feedback.tone === "error" ? (
            <AlertCircle aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
          ) : (
            <CheckCircle2
              aria-hidden
              className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-ok)]"
            />
          )}
          <span>{feedback.message}</span>
        </p>
      ) : null}
    </div>
  );
}
