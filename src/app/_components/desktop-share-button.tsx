"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  HardDriveDownload,
  LoaderCircle,
} from "lucide-react";

import {
  useDesktopBridge,
  type DesktopShareableWork,
} from "~/app/_components/desktop-bridge-provider";

type FeedbackState = { tone: "success" | "error"; message: string };

const chipClass =
  "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)] disabled:opacity-50";

export function DesktopShareButton({
  work,
}: {
  work: DesktopShareableWork;
}) {
  const { shareWork, reachable, relayDevices, queueWorkToRelay } =
    useDesktopBridge();
  const [isWorking, setIsWorking] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const id = window.setTimeout(() => setFeedback(null), 6000);
    return () => window.clearTimeout(id);
  }, [feedback]);

  const shareable = Boolean(work.metadataCid ?? work.mediaCid);
  const canPinDirectly = reachable;
  const hasLinkedHelper = relayDevices.length > 0;

  if (!shareable) return null;

  return (
    <div className="inline-flex flex-col gap-2">
      {canPinDirectly || hasLinkedHelper ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isWorking}
            onClick={() => {
              setIsWorking(true);
              setFeedback(null);

              const action = canPinDirectly
                ? (hasLinkedHelper
                    ? queueWorkToRelay(work).then(() => {
                        setFeedback({
                          tone: "success",
                          message:
                            "Sent to your desktop app. It'll start saving shortly.",
                        });
                      })
                    : shareWork(work).then((result) => {
                        setFeedback({
                          tone: "success",
                          message: `Saved on this computer (${result.pins.length} file${result.pins.length === 1 ? "" : "s"} sent).`,
                        });
                      }))
                : queueWorkToRelay(work).then(() => {
                    setFeedback({
                      tone: "success",
                      message:
                        "Sent to your desktop app. It'll start saving shortly.",
                    });
                  });

              void action
                .catch((caughtError) => {
                  setFeedback({
                    tone: "error",
                    message:
                      caughtError instanceof Error
                        ? caughtError.message
                        : "Couldn't save this work to your computer.",
                  });
                })
                .finally(() => setIsWorking(false));
            }}
            className={chipClass}
            title="Save this work to your desktop app."
          >
            {isWorking ? (
              <LoaderCircle
                aria-hidden
                className="h-3.5 w-3.5 animate-spin"
              />
            ) : (
              <HardDriveDownload aria-hidden className="h-3.5 w-3.5" />
            )}
            Save to my computer
          </button>

          <Link href="/desktop" className={chipClass}>
            Set up desktop app
            <ArrowUpRight aria-hidden className="h-3 w-3" />
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Link href="/desktop" className={chipClass}>
            Set up desktop app
            <ArrowUpRight aria-hidden className="h-3 w-3" />
          </Link>
        </div>
      )}

      <p className="text-xs text-[var(--color-muted)]">
        Optional. This work is already saved on the archive — this just keeps
        an extra copy on your own computer.
      </p>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {feedback?.message ?? ""}
      </div>

      {feedback ? (
        <div
          role={feedback.tone === "error" ? "alert" : "status"}
          className={
            feedback.tone === "error"
              ? "inline-flex items-start gap-1.5 rounded-md border border-[var(--color-err)]/40 bg-[var(--tint-err)] px-2.5 py-1.5 text-xs text-[var(--color-err)]"
              : "inline-flex items-start gap-1.5 rounded-md border border-[var(--color-ok)]/30 bg-[var(--tint-ok)] px-2.5 py-1.5 text-xs text-[var(--color-ok)]"
          }
        >
          {feedback.tone === "error" ? (
            <AlertCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <CheckCircle2
              aria-hidden
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
            />
          )}
          <span>{feedback.message}</span>
        </div>
      ) : null}
    </div>
  );
}
