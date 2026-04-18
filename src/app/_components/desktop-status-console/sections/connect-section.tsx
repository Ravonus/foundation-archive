"use client";

import { ArrowUpRight, Cable, LoaderCircle, Unplug } from "lucide-react";

import { formatDate } from "~/lib/utils";
import type {
  RelayOwnerDevice,
  RelayPairing,
} from "~/app/_components/desktop-bridge-provider";

import type { ConfigDraft } from "../types";

type ConnectProps = {
  reachable: boolean;
  configDraft: ConfigDraft;
  setConfigDraft: (updater: (current: ConfigDraft) => ConfigDraft) => void;
  pairing: RelayPairing | null;
  pairingUrl: string | null;
  selectedDevice: RelayOwnerDevice | null;
  isConnectingLocal: boolean;
  isPairing: boolean;
  isDisconnecting: boolean;
  connectThisComputer: () => void;
  createPair: () => void;
  disconnectSelectedDevice: () => void;
};

function ConnectIntro({ reachable }: { reachable: boolean }) {
  return (
    <>
      <p className="font-mono text-[0.68rem] tracking-[0.3em] text-[var(--color-muted)] uppercase">
        Step 1
      </p>
      <h3 className="mt-2 font-serif text-3xl text-[var(--color-ink)]">
        Connect the desktop app
      </h3>
      <p className="mt-2 text-sm text-[var(--color-body)]">
        Give this computer a friendly name (optional), then click the button
        below. Once connected, you can save works to your computer from any
        work&apos;s page.
      </p>

      {reachable ? (
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          Good news: the app is already running on this computer. You can
          connect in one click — no link needed.
        </p>
      ) : null}
    </>
  );
}

function DeviceNameInput({
  configDraft,
  setConfigDraft,
}: {
  configDraft: ConfigDraft;
  setConfigDraft: (updater: (current: ConfigDraft) => ConfigDraft) => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm text-[var(--color-body)]">
          Computer name (optional)
        </span>
        <span className="mb-2 block text-xs text-[var(--color-muted)]">
          Helps you recognize this computer if you connect more than one.
        </span>
        <input
          value={configDraft.relayDeviceName}
          onChange={(event) =>
            setConfigDraft((current) => ({
              ...current,
              relayDeviceName: event.target.value,
            }))
          }
          placeholder="e.g. Studio MacBook"
          className="w-full rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-4 py-3 text-sm text-[var(--color-ink)] outline-none"
        />
      </label>
    </div>
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
      title="Use the desktop app that's already running on this computer."
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

function CreatePairButton({
  reachable,
  isPairing,
  onClick,
}: {
  reachable: boolean;
  isPairing: boolean;
  onClick: () => void;
}) {
  const classes = reachable
    ? "inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-body)] disabled:opacity-55"
    : "inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)] disabled:opacity-55";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPairing}
      className={classes}
      title="Generate a one-time link to open the desktop app (works on a different computer too)."
    >
      {isPairing ? (
        <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
      ) : (
        <Cable aria-hidden className="h-4 w-4" />
      )}
      {reachable ? "Create a link instead" : "Create a connection link"}
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
      title="Stop this site from sending works to this computer. Your saved works stay."
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
    | "selectedDevice"
    | "isConnectingLocal"
    | "isPairing"
    | "isDisconnecting"
    | "connectThisComputer"
    | "createPair"
    | "disconnectSelectedDevice"
  >,
) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {props.reachable ? (
        <ConnectLocalButton
          isConnectingLocal={props.isConnectingLocal}
          onClick={props.connectThisComputer}
        />
      ) : null}
      <CreatePairButton
        reachable={props.reachable}
        isPairing={props.isPairing}
        onClick={props.createPair}
      />
      {props.selectedDevice ? (
        <DisconnectButton
          isDisconnecting={props.isDisconnecting}
          onClick={props.disconnectSelectedDevice}
        />
      ) : null}
    </div>
  );
}

function PairingCard({
  pairing,
  pairingUrl,
}: {
  pairing: RelayPairing;
  pairingUrl: string | null;
}) {
  return (
    <div className="mt-6 rounded-[1.6rem] border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-5">
      <p className="font-mono text-[0.76rem] tracking-[0.28em] text-[var(--color-muted)] uppercase">
        Ready to open
      </p>
      <p className="mt-2 text-sm text-[var(--color-body)]">
        Click the button below to open the app. This link expires{" "}
        {formatDate(pairing.expiresAt)}.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {pairingUrl ? (
          <a
            href={pairingUrl}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)] hover:opacity-90"
          >
            Open desktop app
            <ArrowUpRight aria-hidden className="h-4 w-4" />
          </a>
        ) : null}
      </div>
      <div className="mt-4 rounded-[1.2rem] border border-dashed border-[var(--color-line)] px-4 py-3">
        <p className="font-mono text-[0.66rem] tracking-[0.24em] text-[var(--color-muted)] uppercase">
          Backup code
        </p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          If the button doesn&apos;t open the app, type this code into the
          app&apos;s &ldquo;Connect from link&rdquo; screen.
        </p>
        <p className="mt-2 font-serif text-3xl text-[var(--color-ink)]">
          {pairing.pairingCode}
        </p>
        {pairingUrl ? (
          <p className="mt-3 font-mono text-[0.78rem] break-all text-[var(--color-body)]">
            {pairingUrl}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PairingPlaceholder() {
  return (
    <div className="mt-6 rounded-[1.6rem] border border-dashed border-[var(--color-line)] bg-[var(--color-surface-alt)] px-6 py-10 text-center text-sm text-[var(--color-muted)]">
      Click &ldquo;Create a connection link&rdquo; above when you&apos;re ready
      to connect.
    </div>
  );
}

export function ConnectSection(props: ConnectProps) {
  return (
    <div className="rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
      <ConnectIntro reachable={props.reachable} />
      <DeviceNameInput
        configDraft={props.configDraft}
        setConfigDraft={props.setConfigDraft}
      />
      <ActionButtons
        reachable={props.reachable}
        selectedDevice={props.selectedDevice}
        isConnectingLocal={props.isConnectingLocal}
        isPairing={props.isPairing}
        isDisconnecting={props.isDisconnecting}
        connectThisComputer={props.connectThisComputer}
        createPair={props.createPair}
        disconnectSelectedDevice={props.disconnectSelectedDevice}
      />
      {props.pairing ? (
        <PairingCard pairing={props.pairing} pairingUrl={props.pairingUrl} />
      ) : (
        <PairingPlaceholder />
      )}
    </div>
  );
}
