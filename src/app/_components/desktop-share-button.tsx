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

type FeedbackState = { tone: "success" | "error" | "pending"; message: string };
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
  hasPairedDevice,
  queueWorkToRelay,
  shareWork,
  work,
}: {
  canPinDirectly: boolean;
  hasPairedDevice: boolean;
  queueWorkToRelay: (work: DesktopShareableWork) => Promise<unknown>;
  shareWork: (work: DesktopShareableWork) => Promise<{ pins: unknown[] }>;
  work: DesktopShareableWork;
}): Promise<ShareOutcome> {
  // Direct path: local bridge is on the same loopback as the browser.
  if (canPinDirectly) {
    const result = await shareWork(work);
    return {
      message: `Saved on this computer (${result.pins.length} file${result.pins.length === 1 ? "" : "s"} sent).`,
      notificationTitle: "Foundation backup saved",
      notificationBody: `${work.title} is pinned on this computer now.`,
    };
  }

  // Relay path: queueWorkToRelay hits /api/relay/owner/queue-work, which
  // persists the job on the archive server regardless of whether our local
  // WebSocket finished handshaking. We only need hasPairedDevice — the
  // device-was-ever-connected bootstrap cache — to know a worker exists.
  // The socket is only needed to surface live job status; if it isn't
  // connected yet, queueWorkToRelay will still succeed and the job gets
  // picked up when the bridge reconnects.
  if (!hasPairedDevice) {
    throw new Error(
      "Desktop app isn't connected yet. Open the desktop app, then try again.",
    );
  }

  await queueWorkToRelay(work);
  return {
    message: relaySuccessMessage,
    notificationTitle: "Foundation backup saved",
    notificationBody: `${work.title} is pinned on your desktop app now.`,
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
  hasPairedDevice: boolean;
  queueWorkToRelay: (work: DesktopShareableWork) => Promise<unknown>;
  shareWork: (work: DesktopShareableWork) => Promise<{ pins: unknown[] }>;
  work: DesktopShareableWork;
  setIsWorking: (value: boolean) => void;
  setFeedback: (value: FeedbackState | null) => void;
};

function pendingMessage(canPinDirectly: boolean) {
  return canPinDirectly
    ? "Saving to this computer\u2026"
    : "Sending to your desktop app\u2026";
}

function runSaveClick(params: RunSaveParams) {
  params.setIsWorking(true);
  params.setFeedback({
    tone: "pending",
    message: pendingMessage(params.canPinDirectly),
  });
  const notificationPermissionPromise = ensureNotificationPermission();

  const action = runShareAction({
    canPinDirectly: params.canPinDirectly,
    hasPairedDevice: params.hasPairedDevice,
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

  if (feedback.tone === "pending") {
    return (
      <div
        role="status"
        className="inline-flex items-start gap-1.5 rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-body)]"
      >
        <LoaderCircle
          aria-hidden
          className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin"
        />
        <span>{feedback.message}</span>
      </div>
    );
  }

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
    if (feedback.tone === "pending") return;
    const id = window.setTimeout(() => setFeedback(null), 6000);
    return () => window.clearTimeout(id);
  }, [feedback]);

  const shareable = Boolean(work.metadataCid ?? work.mediaCid);
  const canPinDirectly = reachable;
  // "Paired" = we've ever seen a relay device, whether or not it's live.
  // Bootstraps from localStorage so a page refresh or fresh navigation
  // doesn't get a fatal "not reachable" toast while the socket handshakes.
  const hasPairedDevice = relayDevices.length > 0;
  const hasConnectedRelayHelper =
    relaySocketConnected && relayDevices.some((device) => device.connected);

  // The panel already gates visibility based on whether a pairing exists
  // at all. Once the button is rendered, keep it rendered — click handling
  // decides whether the save actually works and surfaces a clear error
  // toast if the bridge is offline.
  if (!shareable) return null;

  const handleSave = () =>
    runSaveClick({
      canPinDirectly,
      hasPairedDevice,
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
