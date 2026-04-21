"use client";

import { useState } from "react";
import { LoaderCircle, Unplug } from "lucide-react";

import type { RelayOwnerDevice } from "~/app/_components/desktop-bridge-provider";
import { formatDate } from "~/lib/utils";

type LinkedDevicesProps = {
  relayDevices: RelayOwnerDevice[];
  selectedDeviceId: string | null;
  setSelectedDeviceId: (id: string | null) => void;
  disconnectRelayDevice: (id: string) => Promise<void>;
};

function statusPillClasses(connected: boolean) {
  return connected
    ? "rounded-full bg-[var(--tint-ok)] px-2.5 py-0.5 text-[0.68rem] tracking-[0.22em] text-[var(--color-ok)] uppercase"
    : "rounded-full bg-[var(--tint-muted)] px-2.5 py-0.5 text-[0.68rem] tracking-[0.22em] text-[var(--color-muted)] uppercase";
}

function DeviceRow({
  device,
  isSelected,
  isBusy,
  onSelect,
  onDelete,
}: {
  device: RelayOwnerDevice;
  isSelected: boolean;
  isBusy: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const lastSeen = device.lastSeenAt
    ? formatDate(device.lastSeenAt)
    : "never";
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-[1.4rem] border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-4 py-3">
      <button
        type="button"
        onClick={onSelect}
        className={
          isSelected
            ? "flex min-w-0 flex-1 flex-col items-start gap-1 text-left outline-none"
            : "flex min-w-0 flex-1 flex-col items-start gap-1 text-left opacity-80 outline-none hover:opacity-100"
        }
      >
        <span className="flex items-center gap-2">
          <span className="font-medium text-[var(--color-ink)]">
            {device.deviceLabel || "Unnamed device"}
          </span>
          <span className={statusPillClasses(device.connected)}>
            {device.connected ? "Connected" : "Offline"}
          </span>
          {isSelected ? (
            <span className="rounded-full border border-[var(--color-line-strong)] px-2 py-0.5 text-[0.62rem] tracking-[0.22em] text-[var(--color-muted)] uppercase">
              Active
            </span>
          ) : null}
        </span>
        <span className="font-mono text-[0.72rem] text-[var(--color-muted)]">
          {device.id}
        </span>
        <span className="text-xs text-[var(--color-muted)]">
          Last seen {lastSeen}
          {device.pendingJobCount > 0
            ? ` · ${device.pendingJobCount} pending job${device.pendingJobCount === 1 ? "" : "s"}`
            : null}
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={isBusy}
        title="Remove this linked device. Any works already pinned stay on that computer."
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-body)] hover:text-[var(--color-ink)] disabled:opacity-55"
      >
        {isBusy ? (
          <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Unplug aria-hidden className="h-3.5 w-3.5" />
        )}
        Delete
      </button>
    </li>
  );
}

export function LinkedDevicesSection({
  relayDevices,
  selectedDeviceId,
  setSelectedDeviceId,
  disconnectRelayDevice,
}: LinkedDevicesProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (relayDevices.length === 0) return null;

  const handleDelete = (id: string) => {
    setBusyId(id);
    setError(null);
    void disconnectRelayDevice(id)
      .catch((caughtError: unknown) => {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Couldn't remove this device. Try again.",
        );
      })
      .finally(() => {
        setBusyId((current) => (current === id ? null : current));
      });
  };

  return (
    <section className="rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[0.68rem] tracking-[0.3em] text-[var(--color-muted)] uppercase">
            Linked devices
          </p>
          <h3 className="mt-2 font-serif text-3xl text-[var(--color-ink)]">
            Every desktop app connected to this archive account
          </h3>
          <p className="mt-2 max-w-xl text-sm text-[var(--color-muted)]">
            Click a device to make it the active target. Use Delete to drop
            devices you don&apos;t use anymore — saved works stay on their
            machines.
          </p>
        </div>
        <span className="rounded-full border border-[var(--color-line)] px-3 py-1 text-xs tracking-[0.22em] text-[var(--color-muted)] uppercase">
          {relayDevices.length} device{relayDevices.length === 1 ? "" : "s"}
        </span>
      </div>

      <ul className="mt-5 flex flex-col gap-3">
        {relayDevices.map((device) => (
          <DeviceRow
            key={device.id}
            device={device}
            isSelected={device.id === selectedDeviceId}
            isBusy={busyId === device.id}
            onSelect={() => setSelectedDeviceId(device.id)}
            onDelete={() => handleDelete(device.id)}
          />
        ))}
      </ul>

      {error ? (
        <p
          role="alert"
          className="mt-3 text-sm text-[color:var(--color-accent-danger,#b91c1c)]"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
