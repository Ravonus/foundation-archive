"use client";

import { useEffect } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Cable,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  Unplug,
} from "lucide-react";

import { formatDate } from "~/lib/utils";
import type {
  RelayOwnerDevice,
  RelayPairing,
} from "~/app/_components/desktop-bridge-provider";

import type { DeepLinkStatus } from "../hooks/use-desktop-console-raw-state";

type ConnectProps = {
  reachable: boolean;
  relayConnected: boolean;
  localBridgeProbeEnabled: boolean;
  ownerTokenReady: boolean;
  pairing: RelayPairing | null;
  pairingUrl: string | null;
  deepLinkStatus: DeepLinkStatus;
  selectedDevice: RelayOwnerDevice | null;
  isConnectingLocal: boolean;
  isPairing: boolean;
  isDisconnecting: boolean;
  connectThisComputer: () => void;
  preparePairingLink: (options?: { force?: boolean; silent?: boolean }) => void;
  openPreparedPairing: () => void;
  disconnectSelectedDevice: () => void;
};

const PAIRING_REFRESH_BUFFER_MS = 30_000;

function pairingStillUsable(pairing: RelayPairing | null) {
  if (!pairing) return false;

  const expiresAt = Date.parse(pairing.expiresAt);
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt - Date.now() > PAIRING_REFRESH_BUFFER_MS;
}

function ConnectIntro({
  reachable,
  relayConnected,
  selectedDevice,
}: {
  reachable: boolean;
  relayConnected: boolean;
  selectedDevice: RelayOwnerDevice | null;
}) {
  if (relayConnected) {
    return (
      <>
        <p className="font-mono text-[0.68rem] tracking-[0.3em] text-[var(--color-muted)] uppercase">
          Open desktop app
        </p>
        <h3 className="mt-2 font-serif text-3xl text-[var(--color-ink)]">
          Your desktop app is already linked
        </h3>
        <p className="mt-2 text-sm text-[var(--color-body)]">
          Archive pages can already send works to{" "}
          <span className="font-medium text-[var(--color-ink)]">
            {selectedDevice?.deviceLabel ?? "this computer"}
          </span>
          . You can jump straight to your saved works below.
        </p>
      </>
    );
  }

  if (reachable) {
    return (
      <>
        <p className="font-mono text-[0.68rem] tracking-[0.3em] text-[var(--color-muted)] uppercase">
          Connect desktop app
        </p>
        <h3 className="mt-2 font-serif text-3xl text-[var(--color-ink)]">
          The app is already open here
        </h3>
        <p className="mt-2 text-sm text-[var(--color-body)]">
          Click once to connect this browser to the desktop app on this
          computer. After that, archive pages can send works here automatically.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="font-mono text-[0.68rem] tracking-[0.3em] text-[var(--color-muted)] uppercase">
        Open desktop app
      </p>
      <h3 className="mt-2 font-serif text-3xl text-[var(--color-ink)]">
        One click should do it
      </h3>
      <p className="mt-2 text-sm text-[var(--color-body)]">
        We&apos;ll try to open the desktop app and connect it automatically. If
        your browser ignores the deep link, you&apos;ll get a manual link right
        below.
      </p>
    </>
  );
}

function ConnectLocalButton({
  isConnectingLocal,
  onClick,
}: {
  isConnectingLocal: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isConnectingLocal}
      title="Connect the desktop app that's already open on this computer."
      className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)] disabled:opacity-55"
    >
      {isConnectingLocal ? (
        <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
      ) : (
        <Cable aria-hidden className="h-4 w-4" />
      )}
      Connect this computer
    </button>
  );
}

function OpenAppButton({
  isPairing,
  pairingUrl,
  onPrepare,
  onOpen,
}: {
  isPairing: boolean;
  pairingUrl: string | null;
  onPrepare: () => void;
  onOpen: () => void;
}) {
  if (pairingUrl) {
    return (
      <a
        href={pairingUrl}
        onClick={onOpen}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)] hover:opacity-90"
      >
        <ExternalLink aria-hidden className="h-4 w-4" />
        Open desktop app
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onPrepare}
      disabled={isPairing}
      title="Prepare a one-time desktop app link."
      className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)] disabled:opacity-55"
    >
      {isPairing ? (
        <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
      ) : (
        <Cable aria-hidden className="h-4 w-4" />
      )}
      Open desktop app
    </button>
  );
}

function DisconnectButton({
  isDisconnecting,
  onClick,
}: {
  isDisconnecting: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisconnecting}
      title="Stop this site from sending works to this desktop app. Your saved works stay on the computer."
      className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-body)] disabled:opacity-55"
    >
      {isDisconnecting ? (
        <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
      ) : (
        <Unplug aria-hidden className="h-4 w-4" />
      )}
      Disconnect
    </button>
  );
}

function ActionButtons(
  props: Pick<
    ConnectProps,
    | "reachable"
    | "relayConnected"
    | "pairingUrl"
    | "isConnectingLocal"
    | "isPairing"
    | "isDisconnecting"
    | "connectThisComputer"
    | "preparePairingLink"
    | "openPreparedPairing"
    | "selectedDevice"
    | "disconnectSelectedDevice"
  >,
) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {props.reachable && !props.relayConnected ? (
        <ConnectLocalButton
          isConnectingLocal={props.isConnectingLocal}
          onClick={props.connectThisComputer}
        />
      ) : null}
      {!props.reachable ? (
        <OpenAppButton
          isPairing={props.isPairing}
          pairingUrl={props.pairingUrl}
          onPrepare={() => props.preparePairingLink({ force: true })}
          onOpen={props.openPreparedPairing}
        />
      ) : null}
      {props.selectedDevice ? (
        <DisconnectButton
          isDisconnecting={props.isDisconnecting}
          onClick={props.disconnectSelectedDevice}
        />
      ) : null}
    </div>
  );
}

function statusTone(status: DeepLinkStatus, relayConnected: boolean) {
  if (relayConnected) {
    return {
      border: "border-emerald-500/40",
      background: "bg-emerald-500/10",
      text: "text-emerald-200",
    };
  }

  if (status === "error") {
    return {
      border: "border-rose-500/40",
      background: "bg-rose-500/10",
      text: "text-rose-100",
    };
  }

  return {
    border: "border-[var(--color-line)]",
    background: "bg-[var(--color-surface-alt)]",
    text: "text-[var(--color-ink)]",
  };
}

function StatusIcon({
  deepLinkStatus,
  relayConnected,
}: {
  deepLinkStatus: DeepLinkStatus;
  relayConnected: boolean;
}) {
  if (relayConnected) {
    return <CheckCircle2 aria-hidden className="h-5 w-5 text-emerald-300" />;
  }

  if (deepLinkStatus === "preparing" || deepLinkStatus === "opening") {
    return <LoaderCircle aria-hidden className="h-5 w-5 animate-spin" />;
  }

  if (deepLinkStatus === "waiting") {
    return <Cable aria-hidden className="h-5 w-5 text-[var(--color-ink)]" />;
  }

  if (deepLinkStatus === "error") {
    return <AlertCircle aria-hidden className="h-5 w-5 text-rose-200" />;
  }

  return <Cable aria-hidden className="h-5 w-5 text-[var(--color-ink)]" />;
}

function statusCopy({
  reachable,
  relayConnected,
  ownerTokenReady,
  pairing,
  deepLinkStatus,
  selectedDevice,
}: Pick<
  ConnectProps,
  | "reachable"
  | "relayConnected"
  | "ownerTokenReady"
  | "pairing"
  | "deepLinkStatus"
  | "selectedDevice"
>) {
  if (relayConnected) {
    return {
      title: "Desktop app connected",
      body: `This browser is linked to ${selectedDevice?.deviceLabel ?? "your desktop app"}. Archive pages can send works there now.`,
    };
  }

  if (reachable) {
    return {
      title: "Desktop app found on this computer",
      body: "The app is already running locally. Click once to connect this browser and you're done.",
    };
  }

  if (!ownerTokenReady) {
    return {
      title: "Preparing your secure link",
      body: "Getting a one-time connection link ready so the browser can open the desktop app safely.",
    };
  }

  if (deepLinkStatus === "preparing") {
    return {
      title: "Preparing your app link",
      body: "Making a fresh one-time link for this browser and this computer.",
    };
  }

  if (deepLinkStatus === "opening") {
    return {
      title: "Opening the desktop app",
      body: "Your browser should hand off to the installed desktop app now, and a local helper window should open so you can watch it finish.",
    };
  }

  if (deepLinkStatus === "waiting") {
    return {
      title: "Waiting for the app to confirm",
      body: "The helper window should confirm the link and then this page will flip to connected. Keep this tab open for a moment.",
    };
  }

  if (deepLinkStatus === "error") {
    return {
      title: "Couldn't prepare the app link",
      body: "Try the button again below. If the browser ignores it, the manual link stays available here too.",
    };
  }

  if (pairing) {
    return {
      title: "Your app link is ready",
      body: "Click Open desktop app below. If nothing happens, use the manual link right under it.",
    };
  }

  return {
    title: "Open the desktop app",
    body: "We’ll create a one-time link in the background, then one click should open and connect the app.",
  };
}

function DeepLinkStatusCard(
  props: Pick<
    ConnectProps,
    | "reachable"
    | "relayConnected"
    | "ownerTokenReady"
    | "pairing"
    | "deepLinkStatus"
    | "selectedDevice"
  >,
) {
  const tone = statusTone(props.deepLinkStatus, props.relayConnected);
  const copy = statusCopy(props);

  return (
    <div
      className={`mt-6 rounded-[1.6rem] border p-5 ${tone.border} ${tone.background}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${tone.text}`}>
          <StatusIcon
            deepLinkStatus={props.deepLinkStatus}
            relayConnected={props.relayConnected}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--color-ink)]">
            {copy.title}
          </p>
          <p className="mt-2 text-sm text-[var(--color-body)]">{copy.body}</p>
        </div>
      </div>
    </div>
  );
}

function PairingCard({
  pairing,
  pairingUrl,
  onOpen,
}: {
  pairing: RelayPairing;
  pairingUrl: string | null;
  onOpen: () => void;
}) {
  return (
    <div className="mt-6 rounded-[1.6rem] border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-5">
      <p className="font-medium text-[var(--color-ink)]">
        If the app didn&apos;t open, try the link again.
      </p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        This one-time link expires {formatDate(pairing.expiresAt)}.
      </p>

      {pairingUrl ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={pairingUrl}
            onClick={onOpen}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)] hover:opacity-90"
          >
            Open app again
            <ArrowUpRight aria-hidden className="h-4 w-4" />
          </a>
        </div>
      ) : null}

      <details className="mt-4 rounded-[1.2rem] border border-dashed border-[var(--color-line)] px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-[var(--color-ink)]">
          Manual link and backup code
        </summary>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Only use this if your browser refuses to open the app automatically.
        </p>
        <p className="mt-3 font-serif text-3xl text-[var(--color-ink)]">
          {pairing.pairingCode}
        </p>
        {pairingUrl ? (
          <p className="mt-3 font-mono text-[0.78rem] break-all text-[var(--color-body)]">
            {pairingUrl}
          </p>
        ) : null}
      </details>
    </div>
  );
}

function RelayNote({
  localBridgeProbeEnabled,
  selectedDevice,
}: {
  localBridgeProbeEnabled: boolean;
  selectedDevice: RelayOwnerDevice | null;
}) {
  if (localBridgeProbeEnabled) return null;

  return (
    <p className="mt-4 text-xs text-[var(--color-muted)]">
      This browser can&apos;t talk to `127.0.0.1` directly from the public site,
      so the page waits for the archive relay instead. If you already linked{" "}
      {selectedDevice?.deviceLabel ?? "a desktop app"}, its saved works will
      appear here as soon as that app reconnects.
    </p>
  );
}

export function ConnectSection(props: ConnectProps) {
  const {
    deepLinkStatus,
    isPairing,
    ownerTokenReady,
    pairing,
    preparePairingLink,
    reachable,
    relayConnected,
  } = props;

  useEffect(() => {
    if (reachable || relayConnected || !ownerTokenReady) {
      return;
    }

    if (isPairing) {
      return;
    }

    if (
      deepLinkStatus === "preparing" ||
      deepLinkStatus === "opening" ||
      deepLinkStatus === "waiting" ||
      deepLinkStatus === "error"
    ) {
      return;
    }

    if (pairingStillUsable(pairing)) {
      return;
    }

    preparePairingLink({ silent: true });
  }, [
    deepLinkStatus,
    isPairing,
    ownerTokenReady,
    pairing,
    preparePairingLink,
    reachable,
    relayConnected,
  ]);

  return (
    <div className="rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
      <ConnectIntro
        reachable={props.reachable}
        relayConnected={props.relayConnected}
        selectedDevice={props.selectedDevice}
      />

      <DeepLinkStatusCard
        reachable={props.reachable}
        relayConnected={props.relayConnected}
        ownerTokenReady={props.ownerTokenReady}
        pairing={props.pairing}
        deepLinkStatus={props.deepLinkStatus}
        selectedDevice={props.selectedDevice}
      />

      <ActionButtons
        reachable={props.reachable}
        relayConnected={props.relayConnected}
        pairingUrl={props.pairingUrl}
        selectedDevice={props.selectedDevice}
        isConnectingLocal={props.isConnectingLocal}
        isPairing={props.isPairing}
        isDisconnecting={props.isDisconnecting}
        connectThisComputer={props.connectThisComputer}
        preparePairingLink={props.preparePairingLink}
        openPreparedPairing={props.openPreparedPairing}
        disconnectSelectedDevice={props.disconnectSelectedDevice}
      />

      <RelayNote
        localBridgeProbeEnabled={props.localBridgeProbeEnabled}
        selectedDevice={props.selectedDevice}
      />

      {props.pairing ? (
        <PairingCard
          pairing={props.pairing}
          pairingUrl={props.pairingUrl}
          onOpen={props.openPreparedPairing}
        />
      ) : null}
    </div>
  );
}
