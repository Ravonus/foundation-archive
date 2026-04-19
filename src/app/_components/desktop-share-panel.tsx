"use client";

import { useEffect } from "react";

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
  const { reachable, relayDevices, relaySocketConnected, refreshRelayDevices } =
    useDesktopBridge();

  const hasConnectedRelayHelper =
    relaySocketConnected && relayDevices.some((device) => device.connected);
  const canSave = reachable || hasConnectedRelayHelper;

  // Auto-poll the bridge status so the panel appears/disappears as the user
  // opens or closes the desktop app — no manual "Check desktop connection"
  // needed. Only polls while a previous pairing exists so we don't spam the
  // backend for every visitor.
  const hasPairingHistory = relayDevices.length > 0;
  useEffect(() => {
    if (!hasPairingHistory) return;
    if (canSave) return;
    const id = window.setInterval(() => {
      void refreshRelayDevices().catch(() => undefined);
    }, AUTO_POLL_MS);
    return () => window.clearInterval(id);
  }, [hasPairingHistory, canSave, refreshRelayDevices]);

  if (!hasShareableRoots) return null;
  if (!canSave) return null;

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
