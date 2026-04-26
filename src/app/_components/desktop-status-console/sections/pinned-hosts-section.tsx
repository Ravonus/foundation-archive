/* eslint-disable max-lines-per-function, complexity */

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  HardDriveDownload,
  LoaderCircle,
  Pencil,
  Plus,
  Server,
  Trash2,
  X,
} from "lucide-react";

import { useArchiveSaveManager } from "~/app/_components/archive-save-manager";
import {
  PIN_HOST_PRESETS,
  pinHostPresetById,
  type PinHostAuthMode,
  type PinHostKind,
} from "~/lib/pin-host-presets";
import { cn, formatDate } from "~/lib/utils";

type DraftState = {
  hostId: string | null;
  presetKey: string;
  label: string;
  kind: PinHostKind;
  endpointUrl: string;
  publicGatewayUrl: string;
  authMode: PinHostAuthMode;
  authHeaderName: string;
  authToken: string;
  authUsername: string;
  authPassword: string;
  enabled: boolean;
  autoPin: boolean;
};

const inputClass =
  "w-full rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-4 py-3 text-sm text-[var(--color-ink)] outline-none";

function fallbackPreset() {
  return (
    PIN_HOST_PRESETS[0] ?? {
      id: "generic-psa",
      label: "Generic host",
      description: "Custom pinning API endpoint.",
      kind: "PSA" as const,
      endpointUrl: "",
      publicGatewayUrl: "",
      authMode: "BEARER" as const,
      authHeaderName: "Authorization",
    }
  );
}

function buildDraft(presetKey = "pinata"): DraftState {
  const preset = pinHostPresetById(presetKey) ?? fallbackPreset();
  return {
    hostId: null,
    presetKey: preset.id,
    label: preset.label,
    kind: preset.kind,
    endpointUrl: preset.endpointUrl,
    publicGatewayUrl: preset.publicGatewayUrl,
    authMode: preset.authMode,
    authHeaderName: preset.authHeaderName,
    authToken: "",
    authUsername: "",
    authPassword: "",
    enabled: true,
    autoPin: true,
  };
}

function toneClass(enabled: boolean) {
  return enabled
    ? "bg-[var(--tint-ok)] text-[var(--color-ok)]"
    : "bg-[var(--color-surface-alt)] text-[var(--color-muted)]";
}

export function PinnedHostsSection() {
  const {
    pinHosts,
    pinHostsReady,
    pinHostsLoading,
    upsertPinHost,
    removePinHost,
  } = useArchiveSaveManager();
  const [draft, setDraft] = useState<DraftState>(() => buildDraft());
  const [isSaving, setIsSaving] = useState(false);
  const [removingHostId, setRemovingHostId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const id = window.setTimeout(() => setFeedback(null), 5000);
    return () => window.clearTimeout(id);
  }, [feedback]);

  const activePreset = useMemo(
    () => pinHostPresetById(draft.presetKey) ?? fallbackPreset(),
    [draft.presetKey],
  );

  const applyPreset = (presetKey: string) => {
    const preset = pinHostPresetById(presetKey);
    if (!preset) return;
    setDraft((current) => ({
      ...current,
      presetKey: preset.id,
      label: current.hostId ? current.label : preset.label,
      kind: preset.kind,
      endpointUrl: preset.endpointUrl,
      publicGatewayUrl: preset.publicGatewayUrl,
      authMode: preset.authMode,
      authHeaderName: preset.authHeaderName,
    }));
  };

  const resetDraft = () => setDraft(buildDraft(activePreset.id));

  const handleSubmit = async () => {
    setIsSaving(true);
    try {
      await upsertPinHost({
        hostId: draft.hostId,
        label: draft.label,
        presetKey: draft.presetKey,
        kind: draft.kind,
        endpointUrl: draft.endpointUrl,
        publicGatewayUrl: draft.publicGatewayUrl || null,
        authMode: draft.authMode,
        authToken: draft.authToken || null,
        authUsername: draft.authUsername || null,
        authPassword: draft.authPassword || null,
        authHeaderName: draft.authHeaderName || null,
        enabled: draft.enabled,
        autoPin: draft.autoPin,
      });
      setFeedback({
        tone: "success",
        message: draft.hostId
          ? "Pinned host updated."
          : "Pinned host added.",
      });
      setDraft(buildDraft(draft.presetKey));
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Couldn't save this pinned host yet.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (hostId: string) => {
    setRemovingHostId(hostId);
    try {
      await removePinHost(hostId);
      setFeedback({
        tone: "success",
        message: "Pinned host removed.",
      });
      if (draft.hostId === hostId) {
        setDraft(buildDraft(draft.presetKey));
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Couldn't remove this pinned host.",
      });
    } finally {
      setRemovingHostId(null);
    }
  };

  const beginEdit = (host: (typeof pinHosts)[number]) => {
    setDraft({
      hostId: host.id,
      presetKey: host.presetKey,
      label: host.label,
      kind: host.kind,
      endpointUrl: host.endpointUrl,
      publicGatewayUrl: host.publicGatewayUrl ?? "",
      authMode: host.authMode,
      authHeaderName: host.authHeaderName ?? "Authorization",
      authToken: "",
      authUsername: host.authMode === "BASIC" ? host.authSummary ?? "" : "",
      authPassword: "",
      enabled: host.enabled,
      autoPin: host.autoPin,
    });
    setFeedback(null);
  };

  return (
    <section className="rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[0.68rem] tracking-[0.3em] text-[var(--color-muted)] uppercase">
            Web pin hosts
          </p>
          <h3 className="mt-2 font-serif text-3xl text-[var(--color-ink)]">
            Pin to your own hosts too
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted)]">
            Add hosted or self-run pin endpoints here, then save straight to
            them from anywhere in the site. Auto-pin hosts also show up in the
            global save menu.
          </p>
        </div>
        <span className="rounded-full border border-[var(--color-line)] px-3 py-1 text-xs tracking-[0.22em] text-[var(--color-muted)] uppercase">
          {pinHosts.length} configured
        </span>
      </div>

      {feedback ? (
        <div
          className={cn(
            "mt-5 rounded-2xl border px-4 py-3 text-sm",
            feedback.tone === "error"
              ? "border-[var(--color-err)]/35 bg-[var(--tint-err)] text-[var(--color-err)]"
              : "border-[var(--color-ok)]/25 bg-[var(--tint-ok)] text-[var(--color-ok)]",
          )}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="mt-5 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-[var(--color-body)]">
                Preset
              </span>
              <select
                value={draft.presetKey}
                onChange={(event) => applyPreset(event.target.value)}
                className={inputClass}
              >
                {PIN_HOST_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-[var(--color-body)]">
                Label
              </span>
              <input
                value={draft.label}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, label: event.target.value }))
                }
                className={inputClass}
                placeholder="Pinata main account"
              />
            </label>
          </div>

          <p className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-4 py-3 text-sm text-[var(--color-body)]">
            {activePreset.description}
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block lg:col-span-2">
              <span className="mb-1 block text-sm text-[var(--color-body)]">
                API URL
              </span>
              <input
                value={draft.endpointUrl}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    endpointUrl: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="https://api.pinata.cloud/psa"
              />
            </label>

            <label className="block lg:col-span-2">
              <span className="mb-1 block text-sm text-[var(--color-body)]">
                Public gateway URL
              </span>
              <input
                value={draft.publicGatewayUrl}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    publicGatewayUrl: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="https://gateway.pinata.cloud/ipfs"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-[var(--color-body)]">
                Auth mode
              </span>
              <select
                value={draft.authMode}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    authMode: event.target.value as PinHostAuthMode,
                  }))
                }
                className={inputClass}
              >
                <option value="NONE">No auth</option>
                <option value="BEARER">Bearer token</option>
                <option value="BASIC">Basic auth</option>
                <option value="CUSTOM_HEADER">Custom header</option>
              </select>
            </label>

            {draft.authMode === "CUSTOM_HEADER" ? (
              <label className="block">
                <span className="mb-1 block text-sm text-[var(--color-body)]">
                  Header name
                </span>
                <input
                  value={draft.authHeaderName}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      authHeaderName: event.target.value,
                    }))
                  }
                  className={inputClass}
                  placeholder="x-api-key"
                />
              </label>
            ) : null}

            {draft.authMode === "BASIC" ? (
              <>
                <label className="block">
                  <span className="mb-1 block text-sm text-[var(--color-body)]">
                    Username / key
                  </span>
                  <input
                    value={draft.authUsername}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        authUsername: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder={
                      draft.hostId ? "Leave blank to keep the current value" : "Access key"
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-[var(--color-body)]">
                    Password / secret
                  </span>
                  <input
                    type="password"
                    value={draft.authPassword}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        authPassword: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder={
                      draft.hostId ? "Leave blank to keep the current secret" : "Secret"
                    }
                  />
                </label>
              </>
            ) : draft.authMode !== "NONE" ? (
              <label className="block lg:col-span-2">
                <span className="mb-1 block text-sm text-[var(--color-body)]">
                  Token
                </span>
                <input
                  type="password"
                  value={draft.authToken}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      authToken: event.target.value,
                    }))
                  }
                  className={inputClass}
                  placeholder={
                    draft.hostId ? "Leave blank to keep the current token" : "JWT or API token"
                  }
                />
              </label>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-[1.4rem] border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-4 py-4">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))
                }
                className="mt-1 h-4 w-4"
              />
              <div>
                <p className="text-sm font-medium text-[var(--color-ink)]">
                  Enabled
                </p>
                <p className="mt-1 text-sm text-[var(--color-body)]">
                  Keep this host available in save menus.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-[1.4rem] border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-4 py-4">
              <input
                type="checkbox"
                checked={draft.autoPin}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    autoPin: event.target.checked,
                  }))
                }
                className="mt-1 h-4 w-4"
              />
              <div>
                <p className="text-sm font-medium text-[var(--color-ink)]">
                  Include in “pin everywhere”
                </p>
                <p className="mt-1 text-sm text-[var(--color-body)]">
                  This host joins one-click multi-save actions automatically.
                </p>
              </div>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!pinHostsReady || isSaving}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)] disabled:opacity-55"
            >
              {isSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : draft.hostId ? (
                <Pencil className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {draft.hostId ? "Update host" : "Add host"}
            </button>

            {draft.hostId ? (
              <button
                type="button"
                onClick={resetDraft}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-body)]"
              >
                <X className="h-4 w-4" />
                Cancel edit
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          {pinHostsLoading ? (
            <div className="rounded-[1.5rem] border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-5 text-sm text-[var(--color-muted)]">
              <LoaderCircle className="mb-3 h-4 w-4 animate-spin" />
              Loading your pinned hosts…
            </div>
          ) : pinHosts.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-[var(--color-line)] bg-[var(--color-surface-alt)] p-5 text-sm text-[var(--color-muted)]">
              Add your first host here, then the save menus around the site can
              pin directly to it.
            </div>
          ) : (
            pinHosts.map((host) => (
              <article
                key={host.id}
                className="rounded-[1.5rem] border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-ink)]">
                      {host.label}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      {host.presetLabel} · {host.kind === "PSA" ? "Pinning API" : "Kubo RPC"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[0.68rem] uppercase tracking-[0.18em]",
                      toneClass(host.enabled),
                    )}
                  >
                    {host.enabled ? "enabled" : "paused"}
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-xs text-[var(--color-body)]">
                  <p className="truncate">{host.endpointUrl}</p>
                  {host.publicGatewayUrl ? (
                    <p className="truncate text-[var(--color-muted)]">
                      Gateway: {host.publicGatewayUrl}
                    </p>
                  ) : null}
                  <p className="text-[var(--color-muted)]">
                    Auth:{" "}
                    {host.authMode === "NONE"
                      ? "none"
                      : host.authMode === "BASIC"
                        ? `basic${host.authSummary ? ` (${host.authSummary})` : ""}`
                        : host.authSummary
                          ? `${host.authMode.toLowerCase()} (${host.authSummary})`
                          : host.authMode.toLowerCase()}
                  </p>
                  <p className="text-[var(--color-muted)]">
                    Auto-pin: {host.autoPin ? "yes" : "no"} · Last pinned:{" "}
                    {host.lastPinnedAt ? formatDate(host.lastPinnedAt) : "never"}
                  </p>
                  {host.lastError ? (
                    <p className="text-[var(--color-err)]">{host.lastError}</p>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => beginEdit(host)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-xs text-[var(--color-body)] hover:text-[var(--color-ink)]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(host.id)}
                    disabled={removingHostId === host.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-xs text-[var(--color-body)] hover:text-[var(--color-err)] disabled:opacity-55"
                  >
                    {removingHostId === host.id ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Remove
                  </button>
                </div>
              </article>
            ))
          )}

          <div className="rounded-[1.5rem] border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-4 text-xs text-[var(--color-muted)]">
            <p className="flex items-center gap-2 text-[var(--color-ink)]">
              <Server className="h-3.5 w-3.5" />
              Popular presets included
            </p>
            <ul className="mt-2 space-y-1">
              {PIN_HOST_PRESETS.map((preset) => (
                <li key={preset.id} className="flex items-center gap-2">
                  <HardDriveDownload className="h-3.5 w-3.5" />
                  <span>{preset.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
