"use client";

import { useEffect, useRef } from "react";

import {
  DesktopBridgeProvider,
  useDesktopBridge,
  type DesktopShareableWork,
} from "~/app/_components/desktop-bridge-provider";
import { DesktopShareButton } from "~/app/_components/desktop-share-button";
import { FadeUp } from "~/app/_components/motion";

type DesktopSharePanelProps = {
  hasShareableRoots: boolean;
  work: DesktopShareableWork;
};

const AUTO_POLL_MS = 15_000;

function DesktopSharePanelBody({
  hasShareableRoots,
  work,
}: DesktopSharePanelProps) {
  const { reachable, relayDevices, refreshRelayDevices } = useDesktopBridge();

  // Visibility is intentionally loose: once we've *ever* seen a paired device
  // (either from live socket or the localStorage bootstrap cache), keep the
  // panel mounted. Relay flickers — socket reconnects, snapshot updates —
  // used to make the button vanish mid-save and swallow the result toast.
  const hasPairedDevice = relayDevices.length > 0;
  const hasConnectedDevice = relayDevices.some((device) => device.connected);
  const canSave = reachable || hasConnectedDevice;

  // Once shown, stay shown for the lifetime of this component. The button
  // itself surfaces connection errors on click, so hiding it transiently
  // just confuses the user.
  const everVisibleRef = useRef(false);
  if (hasPairedDevice || canSave) {
    everVisibleRef.current = true;
  }

  // Gently re-poll when we know there's a saved pairing but the live socket
  // hasn't confirmed it yet — covers the "bridge restarted, tab refreshed"
  // case without spamming anonymous visitors.
  useEffect(() => {
    if (!hasPairedDevice) return;
    if (canSave) return;
    const id = window.setInterval(() => {
      void refreshRelayDevices().catch(() => undefined);
    }, AUTO_POLL_MS);
    return () => window.clearInterval(id);
  }, [hasPairedDevice, canSave, refreshRelayDevices]);

  if (!hasShareableRoots) return null;
  if (!everVisibleRef.current) return null;

  return (
    <FadeUp delay={0.85} duration={0.6} className="block">
      <div className="mt-8 rounded-sm border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <p className="font-medium text-[var(--color-ink)]">
          Optional: keep a copy on your own computer
        </p>
        <p className="mt-2 text-sm text-[var(--color-body)]">
          This work is already saved in the archive. Pin it to your desktop app
          to keep an extra copy on your own computer.
        </p>
        <div className="mt-4">
          <DesktopShareButton work={work} />
        </div>
      </div>
    </FadeUp>
  );
}

export function DesktopSharePanel(props: DesktopSharePanelProps) {
  return (
    <DesktopBridgeProvider>
      <DesktopSharePanelBody {...props} />
    </DesktopBridgeProvider>
  );
}
