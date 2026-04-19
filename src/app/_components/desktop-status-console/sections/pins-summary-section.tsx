"use client";

import Link from "next/link";
import { ArrowUpRight, RefreshCcw } from "lucide-react";

import { formatDate } from "~/lib/utils";
import type { RelayOwnerDevice } from "~/app/_components/desktop-bridge-provider";

type PinsSummaryProps = {
  relayDevices: RelayOwnerDevice[];
  selectedDevice: RelayOwnerDevice | null;
  setSelectedDeviceId: (id: string) => void;
  visibleInventoryLabel: string;
  visibleInventoryTime: string | null;
  pinnedCount: number;
  visibleItemsCount: number;
  sessionUrl: string | null;
  requestRelayInventory: (id: string) => void;
};

function DeviceTabs({
  relayDevices,
  selectedDevice,
  setSelectedDeviceId,
}: Pick<
  PinsSummaryProps,
  "relayDevices" | "selectedDevice" | "setSelectedDeviceId"
>) {
  if (relayDevices.length <= 1) return null;

  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {relayDevices.map((device) => (
        <button
          key={device.id}
          type="button"
          onClick={() => setSelectedDeviceId(device.id)}
          className={
            device.id === selectedDevice?.id
              ? "rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)]"
              : "rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          }
        >
          {device.deviceLabel}
        </button>
      ))}
    </div>
  );
}

function SummaryTotals({
  visibleInventoryLabel,
  pinnedCount,
  visibleItemsCount,
  visibleInventoryTime,
}: Pick<
  PinsSummaryProps,
  | "visibleInventoryLabel"
  | "pinnedCount"
  | "visibleItemsCount"
  | "visibleInventoryTime"
>) {
  const extra =
    visibleItemsCount > pinnedCount
      ? ` · ${visibleItemsCount} total tracked`
      : "";

  return (
    <div className="mt-5 rounded-[1.5rem] border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-4 text-sm text-[var(--color-body)]">
      <p className="font-medium text-[var(--color-ink)]">
        {visibleInventoryLabel}
      </p>
      <p className="mt-1">
        {pinnedCount} file{pinnedCount === 1 ? "" : "s"} saved on this computer
        {extra}.
      </p>
      {visibleInventoryTime ? (
        <p className="mt-1 text-[var(--color-muted)]">
          Last checked {formatDate(visibleInventoryTime)}.
        </p>
      ) : (
        <p className="mt-1 text-[var(--color-muted)]">
          Open or reconnect the desktop app to load the latest saved works.
        </p>
      )}
    </div>
  );
}

function SummaryActions({
  selectedDevice,
  requestRelayInventory,
  sessionUrl,
}: Pick<
  PinsSummaryProps,
  "selectedDevice" | "requestRelayInventory" | "sessionUrl"
>) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {selectedDevice?.connected ? (
        <button
          type="button"
          onClick={() => requestRelayInventory(selectedDevice.id)}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-body)]"
          title="Ask the desktop app for its latest list of saved works."
        >
          <RefreshCcw aria-hidden className="h-4 w-4" />
          Refresh list
        </button>
      ) : null}
      {sessionUrl ? (
        <Link
          href={sessionUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-body)]"
          title="Open the app running on this computer in a new tab."
        >
          Open local app
          <ArrowUpRight aria-hidden className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

export function PinsSummarySection(props: PinsSummaryProps) {
  return (
    <div className="rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
      <p className="font-mono text-[0.68rem] tracking-[0.3em] text-[var(--color-muted)] uppercase">
        Saved works
      </p>
      <h3 className="mt-2 font-serif text-3xl text-[var(--color-ink)]">
        What&apos;s on this computer
      </h3>
      <p className="mt-2 text-sm text-[var(--color-body)]">
        Once the desktop app is connected, your saved works appear here. If a
        work matches the archive, you&apos;ll see its archive page too.
      </p>

      <DeviceTabs
        relayDevices={props.relayDevices}
        selectedDevice={props.selectedDevice}
        setSelectedDeviceId={props.setSelectedDeviceId}
      />

      <SummaryTotals
        visibleInventoryLabel={props.visibleInventoryLabel}
        pinnedCount={props.pinnedCount}
        visibleItemsCount={props.visibleItemsCount}
        visibleInventoryTime={props.visibleInventoryTime}
      />

      <SummaryActions
        selectedDevice={props.selectedDevice}
        requestRelayInventory={props.requestRelayInventory}
        sessionUrl={props.sessionUrl}
      />
    </div>
  );
}
