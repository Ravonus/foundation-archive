"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { api } from "~/trpc/react";

type FeedbackState = { tone: "success" | "error"; message: string };

export function ProfileArchiveRequestButton({
  accountAddress,
  username,
  label,
}: {
  accountAddress: string;
  username?: string | null;
  label?: string | null;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

  useEffect(() => {
    if (!feedback) return;
    const id = window.setTimeout(() => setFeedback(null), 6000);
    return () => window.clearTimeout(id);
  }, [feedback]);

  const mutation = api.archive.requestProfileArchive.useMutation({
    onSuccess: (result) => {
      setFeedback({
        tone: "success",
        message: `Added ${result.queuedWorks} work${result.queuedWorks === 1 ? "" : "s"} from ${result.label} to the line. ${result.alreadyPinnedWorks} already saved.`,
      });
      startRefresh(() => {
        router.refresh();
      });
    },
    onError: (error) => {
      setFeedback({
        tone: "error",
        message: error.message || "Something went wrong. Please try again.",
      });
    },
  });

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => {
          mutation.mutate({
            accountAddress,
            username: username ?? undefined,
            label: label ?? undefined,
          });
        }}
        disabled={mutation.isPending || isRefreshing}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm text-[var(--color-bg)] hover:opacity-90 disabled:opacity-50"
        title="Add every work by this artist to the save line."
      >
        {mutation.isPending || isRefreshing ? (
          <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
        ) : (
          <Plus aria-hidden className="h-4 w-4" />
        )}
        Save all of this artist&apos;s work
      </button>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {feedback?.message ?? ""}
      </div>
      {feedback ? (
        <p
          role={feedback.tone === "error" ? "alert" : "status"}
          className={
            feedback.tone === "error"
              ? "inline-flex items-start gap-1.5 text-sm text-[var(--color-err)]"
              : "inline-flex items-start gap-1.5 text-sm text-[var(--color-muted)]"
          }
        >
          {feedback.tone === "error" ? (
            <AlertCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <CheckCircle2
              aria-hidden
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-ok)]"
            />
          )}
          <span>{feedback.message}</span>
        </p>
      ) : null}
    </div>
  );
}
