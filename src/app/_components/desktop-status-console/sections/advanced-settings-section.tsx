"use client";

import { FolderSync, HardDrive, LoaderCircle, Wrench } from "lucide-react";

import type { ConfigDraft } from "../types";

type AdvancedProps = {
  reachable: boolean;
  canControl: boolean;
  controlLabel: string;
  configDraft: ConfigDraft;
  setConfigDraft: (updater: (current: ConfigDraft) => ConfigDraft) => void;
  isSavingConfig: boolean;
  isRepairing: boolean;
  isSyncing: boolean;
  isConnectedRemotely: boolean;
  saveConfig: () => void;
  runRepair: () => void;
  runSync: () => void;
};

function AdvancedSummary({
  canControl,
  controlLabel,
}: {
  canControl: boolean;
  controlLabel: string;
}) {
  return (
    <summary className="cursor-pointer list-none">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[0.68rem] tracking-[0.3em] text-[var(--color-muted)] uppercase">
            Advanced (optional)
          </p>
          <h3 className="mt-2 font-serif text-3xl text-[var(--color-ink)]">
            Tweak how the app behaves
          </h3>
          <p className="mt-2 max-w-xl text-sm text-[var(--color-muted)]">
            Click to change where files save, how they&apos;re shared, and
            related settings. Most people don&apos;t need to touch these.
          </p>
        </div>
        <span className="rounded-full border border-[var(--color-line)] px-3 py-1 text-xs tracking-[0.22em] text-[var(--color-muted)] uppercase">
          {canControl ? controlLabel : "not ready yet"}
        </span>
      </div>
    </summary>
  );
}

function TextSetting({
  label,
  description,
  value,
  placeholder,
  wide,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  placeholder: string;
  wide?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={wide ? "block lg:col-span-2" : "block"}>
      <span className="mb-1 block text-sm text-[var(--color-body)]">
        {label}
      </span>
      {description ? (
        <span className="mb-2 block text-xs text-[var(--color-muted)]">
          {description}
        </span>
      ) : null}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-4 py-3 text-sm text-[var(--color-ink)] outline-none"
      />
    </label>
  );
}

function SettingsInputs({
  configDraft,
  setConfigDraft,
}: Pick<AdvancedProps, "configDraft" | "setConfigDraft">) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TextSetting
        label="Folder to save files into"
        description="Where the app keeps its copy of each work on this computer."
        value={configDraft.downloadRootDir}
        placeholder="/Users/name/FoundationSync"
        onChange={(value) =>
          setConfigDraft((current) => ({ ...current, downloadRootDir: value }))
        }
      />
      <TextSetting
        label="Your local IPFS address"
        description="Only change this if you run your own IPFS node. Default works for most people."
        value={configDraft.localGatewayBaseUrl}
        placeholder="http://127.0.0.1:8080"
        onChange={(value) =>
          setConfigDraft((current) => ({
            ...current,
            localGatewayBaseUrl: value,
          }))
        }
      />
      <TextSetting
        label="External pinned gateway URL"
        description={
          'Used for each item\'s "Pinned" link. Set this to your own hostname, DDNS name, reverse proxy, or direct public IP gateway if you want links to open through your route.'
        }
        value={configDraft.publicGatewayBaseUrl}
        placeholder="https://ipfs.io"
        wide
        onChange={(value) =>
          setConfigDraft((current) => ({
            ...current,
            publicGatewayBaseUrl: value,
          }))
        }
      />
    </div>
  );
}

function SyncToggle({
  configDraft,
  setConfigDraft,
}: Pick<AdvancedProps, "configDraft" | "setConfigDraft">) {
  return (
    <label className="flex items-start gap-3 rounded-[1.4rem] border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-4 py-4">
      <input
        type="checkbox"
        checked={configDraft.syncEnabled}
        onChange={(event) =>
          setConfigDraft((current) => ({
            ...current,
            syncEnabled: event.target.checked,
          }))
        }
        className="mt-1 h-4 w-4"
      />
      <div>
        <p className="text-sm font-medium text-[var(--color-ink)]">
          Also keep plain file copies in your folder
        </p>
        <p className="mt-1 text-sm text-[var(--color-body)]">
          Off by default. The app always keeps the originals safe either way.
          This just adds a normal folder of files you can browse.
        </p>
      </div>
    </label>
  );
}

function AdvancedButtons(
  props: Pick<
    AdvancedProps,
    | "reachable"
    | "canControl"
    | "isSavingConfig"
    | "isRepairing"
    | "isSyncing"
    | "saveConfig"
    | "runRepair"
    | "runSync"
  >,
) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={props.saveConfig}
          disabled={!props.canControl || props.isSavingConfig}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)] disabled:opacity-55"
          title="Apply any settings changes above."
        >
          {props.isSavingConfig ? (
            <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
          ) : (
            <HardDrive aria-hidden className="h-4 w-4" />
          )}
          Save settings
        </button>

        <button
          type="button"
          onClick={props.runRepair}
          disabled={!props.canControl || props.isRepairing}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-body)] disabled:opacity-55"
          title="Re-save any works that look incomplete or missing."
        >
          {props.isRepairing ? (
            <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
          ) : (
            <Wrench aria-hidden className="h-4 w-4" />
          )}
          Fix missing files
        </button>

        <button
          type="button"
          onClick={props.runSync}
          disabled={!props.canControl || props.isSyncing}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-body)] disabled:opacity-55"
          title="Copy saved files into the folder above so you can browse them normally."
        >
          {props.isSyncing ? (
            <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
          ) : (
            <FolderSync aria-hidden className="h-4 w-4" />
          )}
          Copy to folder
        </button>
      </div>
      <ul className="space-y-1 text-xs text-[var(--color-muted)]">
        <li>
          <span className="text-[var(--color-ink)]">Save settings:</span> apply
          any changes you made above.
        </li>
        <li>
          <span className="text-[var(--color-ink)]">Fix missing files:</span>{" "}
          re-saves anything that looks incomplete. Safe to run anytime.
        </li>
        <li>
          <span className="text-[var(--color-ink)]">Copy to folder:</span>{" "}
          writes a plain-file copy into the folder above. Only needed if you
          turned on the folder copy option.
        </li>
      </ul>
    </div>
  );
}

export function AdvancedSettingsSection(props: AdvancedProps) {
  return (
    <details className="rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
      <AdvancedSummary
        canControl={props.canControl}
        controlLabel={props.controlLabel}
      />

      <div className="mt-5 space-y-5">
        <p className="text-sm text-[var(--color-body)]">
          {props.canControl
            ? props.isConnectedRemotely
              ? "These settings are being applied through the archive relay to your linked desktop app."
              : "These settings are being applied to the desktop app running on this computer."
            : "Connect a desktop app first, then you can manage its settings here without opening the localhost helper page."}
        </p>

        <SettingsInputs
          configDraft={props.configDraft}
          setConfigDraft={props.setConfigDraft}
        />

        <SyncToggle
          configDraft={props.configDraft}
          setConfigDraft={props.setConfigDraft}
        />

        <AdvancedButtons
          reachable={props.reachable}
          canControl={props.canControl}
          isSavingConfig={props.isSavingConfig}
          isRepairing={props.isRepairing}
          isSyncing={props.isSyncing}
          saveConfig={props.saveConfig}
          runRepair={props.runRepair}
          runSync={props.runSync}
        />
      </div>
    </details>
  );
}
