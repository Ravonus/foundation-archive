"use client";

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

function DesktopSharePanelBody({
  hasShareableRoots,
  work,
}: DesktopSharePanelProps) {
  const { reachable, relayDevices, relaySocketConnected } = useDesktopBridge();

  const hasConnectedRelayHelper =
    relaySocketConnected && relayDevices.some((device) => device.connected);
  const hasKnownRelayDevice = relayDevices.length > 0;
  const showDesktopShareUi =
    reachable || hasConnectedRelayHelper || hasKnownRelayDevice;

  if (!showDesktopShareUi) return null;

  return (
    <FadeUp delay={0.85} duration={0.6} className="block">
      <div className="mt-8 rounded-sm border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <p className="font-medium text-[var(--color-ink)]">
          {hasShareableRoots
            ? "Optional: keep a copy on your own computer"
            : "Not ready for your own copy yet"}
        </p>
        <p className="mt-2 text-sm text-[var(--color-body)]">
          {hasShareableRoots
            ? "This work is already saved in the archive. If you'd like to keep an extra copy on your own computer, you can use the desktop app."
            : "We haven't captured the files for this work yet, so there's nothing to send to the desktop app at the moment."}
        </p>
        {hasShareableRoots ? (
          <div className="mt-4">
            <DesktopShareButton work={work} />
          </div>
        ) : null}
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
