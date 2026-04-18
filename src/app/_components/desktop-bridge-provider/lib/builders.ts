import { buildFoundationShareBridgeDeepLink } from "~/lib/desktop-relay";

import { trimTrailingSlash } from "./bridge-api";
import type {
  BridgeConfig,
  BridgeSession,
  DesktopShareableWork,
  RelayOwnerDevice,
  RelayPairing,
} from "../types";

function resolveRelayServerUrl(
  candidate: string | null | undefined,
  config: BridgeConfig | null,
) {
  const trimmed = candidate?.trim();
  if (trimmed && trimmed.length > 0) return trimmed;
  return config?.relay_server_url ?? window.location.origin;
}

function resolveDeviceName(
  candidate: string | null | undefined,
  config: BridgeConfig | null,
) {
  const trimmed = candidate?.trim();
  if (trimmed && trimmed.length > 0) return trimmed;
  return config?.relay_device_name ?? "Foundation desktop app";
}

export function buildRelayPairingUrl({
  pairing,
  relayServerUrl,
  deviceName,
  config,
}: {
  pairing: RelayPairing;
  relayServerUrl: string | null | undefined;
  deviceName: string | null | undefined;
  config: BridgeConfig | null;
}) {
  return buildFoundationShareBridgeDeepLink({
    relayServerUrl: resolveRelayServerUrl(relayServerUrl, config),
    pairingCode: pairing.pairingCode,
    deviceName: resolveDeviceName(deviceName, config),
  });
}

export function resolveLinkRelayServerUrl(
  relayServerUrl: string | null | undefined,
  config: BridgeConfig | null,
) {
  return resolveRelayServerUrl(relayServerUrl, config);
}

export function pickRelayDevice(
  devices: RelayOwnerDevice[],
  deviceId: string | null | undefined,
) {
  const explicit = deviceId
    ? devices.find((device) => device.id === deviceId)
    : undefined;
  if (explicit) return explicit;

  return devices
    .filter((device) => device.relayEnabled)
    .slice()
    .sort((left, right) => {
      const leftConnected = left.connected ? 1 : 0;
      const rightConnected = right.connected ? 1 : 0;
      if (leftConnected !== rightConnected)
        return rightConnected - leftConnected;

      const leftTime = left.lastSeenAt
        ? new Date(left.lastSeenAt).getTime()
        : 0;
      const rightTime = right.lastSeenAt
        ? new Date(right.lastSeenAt).getTime()
        : 0;
      return rightTime - leftTime;
    })[0];
}

export function buildWorkShareUrl(
  bridgeUrl: string,
  session: BridgeSession,
  work: DesktopShareableWork,
) {
  const url = new URL("/share/work/view", trimTrailingSlash(bridgeUrl));

  url.searchParams.set("session_secret", session.session_secret);
  url.searchParams.set("title", work.title);
  url.searchParams.set("contract_address", work.contractAddress);
  url.searchParams.set("token_id", work.tokenId);

  if (work.foundationUrl)
    url.searchParams.set("foundation_url", work.foundationUrl);
  if (work.artistUsername) {
    url.searchParams.set("artist_username", work.artistUsername);
  }
  if (work.metadataCid) url.searchParams.set("metadata_cid", work.metadataCid);
  if (work.mediaCid) url.searchParams.set("media_cid", work.mediaCid);

  return url.toString();
}

export function buildSessionViewUrl(
  bridgeUrl: string,
  session: BridgeSession | null,
) {
  if (!session) return null;

  const url = new URL("/", trimTrailingSlash(bridgeUrl));
  url.searchParams.set("session_id", session.session_id);
  return url.toString();
}
