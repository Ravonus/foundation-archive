"use client";

import { useEffect, useState } from "react";

import {
  hasDesktopShareSource,
  useDesktopBridge,
  type DesktopShareableWork,
} from "~/app/_components/desktop-bridge-provider";
import { useArchiveSaveManager } from "~/app/_components/archive-save-manager";
import { FadeUp } from "~/app/_components/motion";
import { SaveTargetMenu } from "~/app/_components/save-target-menu";

type DesktopSharePanelProps = {
  work: DesktopShareableWork & { chainId: number };
};

const AUTO_POLL_MS = 15_000;

function DesktopSharePanelBody({
  work,
}: DesktopSharePanelProps) {
  const { reachable, relayDevices, refreshRelayDevices } = useDesktopBridge();
  const { pinHosts } = useArchiveSaveManager();

  // Visibility is intentionally loose: once we've *ever* seen a paired device
  // (either from live socket or the localStorage bootstrap cache), keep the
  // panel mounted. Relay flickers — socket reconnects, snapshot updates —
  // used to make the button vanish mid-save and swallow the result toast.
  const hasPairedDevice = relayDevices.length > 0;
  const hasConnectedDevice = relayDevices.some((device) => device.connected);
  const hasPinnedHosts = pinHosts.some((host) => host.enabled);
  const canSave = reachable || hasConnectedDevice;

  // Once shown, stay shown for the lifetime of this component. The button
  // itself surfaces connection errors on click, so hiding it transiently
  // just confuses the user.
  const [everVisible, setEverVisible] = useState(
    hasPairedDevice || canSave || hasPinnedHosts,
  );

  useEffect(() => {
    if (hasPairedDevice || canSave || hasPinnedHosts) {
      const id = window.setTimeout(() => setEverVisible(true), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [canSave, hasPairedDevice, hasPinnedHosts]);

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

  if (!hasDesktopShareSource(work)) return null;
  if (!everVisible) return null;

  return (
    <FadeUp delay={0.85} duration={0.6} className="block">
      <div className="mt-8 rounded-sm border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <p className="font-medium text-[var(--color-ink)]">
          Optional: keep a copy on your own computer
        </p>
        <p className="mt-2 text-sm text-[var(--color-body)]">
          This work is already saved in the archive. Send it to your desktop
          app, your own pin hosts, or both without leaving the page.
        </p>
        <div className="mt-4">
          <SaveTargetMenu work={work} variant="inline" />
        </div>
      </div>
    </FadeUp>
  );
}

export function DesktopSharePanel(props: DesktopSharePanelProps) {
  return <DesktopSharePanelBody {...props} />;
}
