"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  HardDriveDownload,
  LoaderCircle,
} from "lucide-react";

import {
  useDesktopBridge,
  type DesktopShareableWork,
} from "~/app/_components/desktop-bridge-provider";

type FeedbackState = { tone: "success" | "error"; message: string };
type ShareOutcome = {
  message: string;
  notificationTitle: string;
  notificationBody: string;
};

const chipClass =
  "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)] disabled:opacity-50";

const relaySuccessMessage =
  "Saved by your desktop app and added to its backup list.";

async function ensureNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported" as const;
  }

  if (Notification.permission === "granted") {
    return "granted" as const;
  }

  if (Notification.permission === "denied") {
    return "denied" as const;
  }

  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function showShareNotification(outcome: ShareOutcome) {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return;
  }

  if (Notification.permission !== "granted") {
    return;
  }

  try {
    new Notification(outcome.notificationTitle, {
      body: outcome.notificationBody,
      tag: "foundation-desktop-share",
    });
  } catch {
    // Best effort only.
  }
}

async function runShareAction({
  canPinDirectly,
  hasConnectedRelayHelper,
  queueWorkToRelay,
  shareWork,
  work,
}: {
  canPinDirectly: boolean;
  hasConnectedRelayHelper: boolean;
  queueWorkToRelay: (work: DesktopShareableWork) => Promise<unknown>;
  shareWork: (work: DesktopShareableWork) => Promise<{ pins: unknown[] }>;
  work: DesktopShareableWork;
}): Promise<ShareOutcome> {
  if (!canPinDirectly || hasConnectedRelayHelper) {
    await queueWorkToRelay(work);
    return {
      message: relaySuccessMessage,
      notificationTitle: "Foundation backup saved",
      notificationBody: `${work.title} is pinned on your desktop app now.`,
    };
  }

  const result = await shareWork(work);
  return {
    message: `Saved on this computer (${result.pins.length} file${result.pins.length === 1 ? "" : "s"} sent).`,
    notificationTitle: "Foundation backup saved",
    notificationBody: `${work.title} is pinned on this computer now.`,
  };
}

function SaveButtonIcon({ isWorking }: { isWorking: boolean }) {
  if (isWorking) {
    return <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" />;
  }

  return <HardDriveDownload aria-hidden className="h-3.5 w-3.5" />;
}

type RunSaveParams = {
  canPinDirectly: boolean;
  hasConnectedRelayHelper: boolean;
  queueWorkToRelay: (work: DesktopShareableWork) => Promise<unknown>;
  shareWork: (work: DesktopShareableWork) => Promise<{ pins: unknown[] }>;
  work: DesktopShareableWork;
  setIsWorking: (value: boolean) => void;
  setFeedback: (value: FeedbackState | null) => void;
};

function runSaveClick(params: RunSaveParams) {
  params.setIsWorking(true);
  params.setFeedback(null);
  const notificationPermissionPromise = ensureNotificationPermission();

  const action = runShareAction({
    canPinDirectly: params.canPinDirectly,
    hasConnectedRelayHelper: params.hasConnectedRelayHelper,
    queueWorkToRelay: params.queueWorkToRelay,
    shareWork: params.shareWork,
    work: params.work,
  }).then(async (outcome) => {
    const permission = await notificationPermissionPromise.catch(
      () => "unsupported" as const,
    );
    if (permission === "granted") showShareNotification(outcome);
    params.setFeedback({ tone: "success", message: outcome.message });
  });

  void action
    .catch((caughtError) => {
      params.setFeedback({
        tone: "error",
        message:
          caughtError instanceof Error
            ? caughtError.message
            : "Couldn't save this work to your computer.",
      });
    })
    .finally(() => params.setIsWorking(false));
}

function ShareFeedback({ feedback }: { feedback: FeedbackState | null }) {
  if (!feedback) return null;

  const isError = feedback.tone === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      className={
        isError
          ? "inline-flex items-start gap-1.5 rounded-md border border-[var(--color-err)]/40 bg-[var(--tint-err)] px-2.5 py-1.5 text-xs text-[var(--color-err)]"
          : "inline-flex items-start gap-1.5 rounded-md border border-[var(--color-ok)]/30 bg-[var(--tint-ok)] px-2.5 py-1.5 text-xs text-[var(--color-ok)]"
      }
    >
      {isError ? (
        <AlertCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : (
        <CheckCircle2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      )}
      <span>{feedback.message}</span>
    </div>
  );
}

type ShareButtonViewProps = {
  work: DesktopShareableWork;
  hasConnectedRelayHelper: boolean;
  isWorking: boolean;
  feedback: FeedbackState | null;
  onSave: () => void;
};

function ShareButtonView(props: ShareButtonViewProps) {
  const mode = props.hasConnectedRelayHelper ? "relay-helper" : "local-bridge";

  return (
    <div className="inline-flex flex-col gap-2">
      <button
        type="button"
        disabled={props.isWorking}
        data-umami-event="desktop-save-click"
        data-umami-event-mode={mode}
        data-umami-event-token-id={props.work.tokenId}
        onClick={props.onSave}
        className={chipClass}
        title="Save this work to your desktop app."
      >
        <SaveButtonIcon isWorking={props.isWorking} />
        Save to my computer
      </button>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {props.feedback?.message ?? ""}
      </div>

      <ShareFeedback feedback={props.feedback} />
    </div>
  );
}

export function DesktopShareButton({ work }: { work: DesktopShareableWork }) {
  const {
    shareWork,
    reachable,
    relayDevices,
    relaySocketConnected,
    queueWorkToRelay,
  } = useDesktopBridge();
  const [isWorking, setIsWorking] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const id = window.setTimeout(() => setFeedback(null), 6000);
    return () => window.clearTimeout(id);
  }, [feedback]);

  const shareable = Boolean(work.metadataCid ?? work.mediaCid);
  const canPinDirectly = reachable;
  const hasConnectedRelayHelper =
    relaySocketConnected && relayDevices.some((device) => device.connected);
  const canSave = canPinDirectly || hasConnectedRelayHelper;

  if (!shareable) return null;
  if (!canSave) return null;

  const handleSave = () =>
    runSaveClick({
      canPinDirectly,
      hasConnectedRelayHelper,
      queueWorkToRelay,
      shareWork,
      work,
      setIsWorking,
      setFeedback,
    });

  return (
    <ShareButtonView
      work={work}
      hasConnectedRelayHelper={hasConnectedRelayHelper}
      isWorking={isWorking}
      feedback={feedback}
      onSave={handleSave}
    />
  );
}
