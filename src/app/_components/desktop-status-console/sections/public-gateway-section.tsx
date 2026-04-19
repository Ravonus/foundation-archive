"use client";

import { Globe, LoaderCircle } from "lucide-react";

import type { ConfigDraft } from "../types";

type PublicGatewayProps = {
  canControl: boolean;
  controlLabel: string;
  configDraft: ConfigDraft;
  setConfigDraft: (updater: (current: ConfigDraft) => ConfigDraft) => void;
  isSavingConfig: boolean;
  saveConfig: () => void;
};

export function PublicGatewaySection(props: PublicGatewayProps) {
  const hostname = props.configDraft.tunnelHostname?.trim() ?? "";
  const publicUrl = hostname.length > 0 ? `https://${hostname}` : null;
  const enabled = props.configDraft.tunnelEnabled;

  function toggle(next: boolean) {
    props.setConfigDraft((current) => ({ ...current, tunnelEnabled: next }));
    props.saveConfig();
  }

  return (
    <section className="rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[0.68rem] tracking-[0.3em] text-[var(--color-muted)] uppercase">
            Public gateway
          </p>
          <h3 className="mt-2 font-serif text-3xl text-[var(--color-ink)]">
            Share your pins on a public URL
          </h3>
          <p className="mt-2 max-w-xl text-sm text-[var(--color-muted)]">
            Turn on to get a public HTTPS address that points to this
            desktop&apos;s IPFS gateway. No port forwarding, no firewall
            changes. Turning it off tears the tunnel back down.
          </p>
        </div>
        <span className="rounded-full border border-[var(--color-line)] px-3 py-1 text-xs tracking-[0.22em] text-[var(--color-muted)] uppercase">
          {props.canControl ? props.controlLabel : "not ready yet"}
        </span>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-[1.4rem] border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-4 py-4">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={!props.canControl || props.isSavingConfig}
          onClick={() => toggle(!enabled)}
          className={`mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-[var(--color-line)] transition ${
            enabled ? "bg-[var(--color-ink)]" : "bg-[var(--color-surface)]"
          } disabled:opacity-55`}
        >
          <span
            className={`h-4 w-4 rounded-full bg-[var(--color-bg)] transition ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Globe aria-hidden className="h-4 w-4 text-[var(--color-muted)]" />
            <p className="text-sm font-medium text-[var(--color-ink)]">
              {enabled ? "Public gateway is enabled" : "Public gateway is off"}
            </p>
            {props.isSavingConfig ? (
              <LoaderCircle aria-hidden className="h-4 w-4 animate-spin text-[var(--color-muted)]" />
            ) : null}
          </div>

          {enabled && publicUrl ? (
            <p className="mt-2 font-mono text-xs break-all text-[var(--color-ink)]">
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted underline-offset-4"
              >
                {publicUrl}
              </a>
            </p>
          ) : null}

          {enabled && !publicUrl ? (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Provisioning… the desktop app will publish a hostname shortly.
            </p>
          ) : null}

          {props.configDraft.tunnelLastError ? (
            <p className="mt-2 text-xs text-[color:var(--color-accent-danger,#b91c1c)]">
              {props.configDraft.tunnelLastError}
            </p>
          ) : null}

          {!props.canControl ? (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Connect a desktop app first, then this toggle will control its
              public gateway.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
