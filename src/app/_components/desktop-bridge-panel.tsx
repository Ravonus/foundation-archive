"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckCircle2, Link2, LoaderCircle, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { useDesktopBridge } from "~/app/_components/desktop-bridge-provider";

function isLoopbackUrl(value: string) {
  return /127\.0\.0\.1|localhost/i.test(value);
}

const inputClass =
  "w-full rounded-sm border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-subtle)] focus:border-[var(--color-ink)]";

const primaryBtn =
  "inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)] hover:opacity-90 disabled:opacity-50";

const secondaryBtn =
  "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)] disabled:opacity-50";

type BridgeStatus = "checking" | "disconnected" | "connected";

function statusPillFor(status: BridgeStatus) {
  if (status === "connected") {
    return {
      cls: "bg-[var(--tint-ok)] text-[var(--color-ok)]",
      label: "Helper connected",
    };
  }
  if (status === "checking") {
    return {
      cls: "bg-[var(--tint-warn)] text-[var(--color-warn)]",
      label: "Checking helper…",
    };
  }
  return {
    cls: "bg-[var(--tint-err)] text-[var(--color-err)]",
    label: "Helper offline",
  };
}

export function DesktopBridgePanel() {
  const [isPending, startTransition] = useTransition();
  const [draftBridgeUrl, setDraftBridgeUrl] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const {
    bridgeUrl,
    setBridgeUrl,
    status,
    session,
    error,
    reachable,
    connect,
    disconnect,
    buildSessionViewUrl,
  } = useDesktopBridge();

  const sessionUrl = buildSessionViewUrl();
  const effectiveDraftValue = draftBridgeUrl || bridgeUrl;
  const statusPill = statusPillFor(status);

  const handleConnect = () => {
    startTransition(() => {
      const nextUrl = effectiveDraftValue.trim() || bridgeUrl;
      setBridgeUrl(nextUrl);
      void connect()
        .then(() => {
          setFeedback("Local pin helper connected.");
          setDraftBridgeUrl("");
        })
        .catch((caughtError) => {
          setFeedback(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to connect.",
          );
        });
    });
  };

  const handleDisconnect = () => {
    startTransition(() => {
      void disconnect().then(() => {
        setFeedback("Local pin helper disconnected.");
      });
    });
  };

  return (
    <section className="rounded-sm border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-[var(--color-ink)]">
            Personal pin helper
          </h2>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-muted)]">
            Connect the desktop app on this computer so you can add local pins
            from the community archive UI. This does not run the archive
            itself. It only lets this machine become an extra personal replica.
          </p>
        </div>

        <StatusPill status={status} cls={statusPill.cls} label={statusPill.label} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
              Helper URL
            </span>
            <input
              value={effectiveDraftValue}
              onChange={(event) => setDraftBridgeUrl(event.target.value)}
              placeholder="http://127.0.0.1:43128"
              className={inputClass}
            />
          </label>

          <BridgeActions
            isPending={isPending}
            hasSession={Boolean(session)}
            bridgeUrl={bridgeUrl}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />

          <div className="rounded-sm border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-3 text-xs text-[var(--color-muted)]">
            <p>
              Reachable: {reachable ? "yes" : "no"} · Session:{" "}
              {session ? session.session_id : "—"}
            </p>
            <p className="mt-1">
              The community archive does not depend on this helper. Use it when
              you want this computer to pin archive items for your own account.
            </p>
            {isLoopbackUrl(bridgeUrl) ? (
              <p className="mt-1 text-[var(--color-warn)]">
                This QR only opens the helper on this computer. Use the pairing
                QR below to link the desktop app to your site account.
              </p>
            ) : null}
          </div>

          {feedback || error ? (
            <p className="text-sm text-[var(--color-body)]">
              {feedback ?? error}
            </p>
          ) : null}
        </div>

        <SessionQrPanel sessionUrl={sessionUrl} />
      </div>
    </section>
  );
}

function StatusPill({
  status,
  cls,
  label,
}: {
  status: BridgeStatus;
  cls: string;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${cls}`}
    >
      {status === "connected" ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : status === "checking" ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : null}
      {label}
    </span>
  );
}

function BridgeActions({
  isPending,
  hasSession,
  bridgeUrl,
  onConnect,
  onDisconnect,
}: {
  isPending: boolean;
  hasSession: boolean;
  bridgeUrl: string;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={onConnect}
        className={primaryBtn}
      >
        {isPending ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Link2 className="h-3.5 w-3.5" />
        )}
        Connect helper
      </button>

      <button
        type="button"
        disabled={isPending || !hasSession}
        onClick={onDisconnect}
        className={secondaryBtn}
      >
        Disconnect
      </button>

      <Link
        href={bridgeUrl}
        target="_blank"
        rel="noreferrer"
        className={secondaryBtn}
      >
        Open helper
      </Link>
    </div>
  );
}

function SessionQrPanel({ sessionUrl }: { sessionUrl: string | null }) {
  return (
    <div className="rounded-sm border border-[var(--color-line)] bg-[var(--color-surface-quiet)] p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-muted)]">
        <QrCode className="h-3.5 w-3.5" />
        LOCAL HELPER QR
      </div>

      {sessionUrl ? (
        <div className="mt-4 flex flex-col items-center gap-3">
          <div className="rounded-sm border border-[var(--color-line)] bg-white p-3">
            <QRCodeSVG value={sessionUrl} size={160} />
          </div>
          <p className="max-w-sm text-center text-xs text-[var(--color-muted)]">
            Open the desktop helper on this computer with the current browser
            session.
          </p>
          <Link
            href={sessionUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[var(--color-ink)] underline hover:no-underline"
          >
            Open helper session
          </Link>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          Connect the local helper first and this session QR will appear.
        </p>
      )}
    </div>
  );
}
