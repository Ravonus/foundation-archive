import { shortAddress } from "~/lib/utils";
import type {
  BridgePinInventoryItem,
  RelayOwnerDevice,
} from "~/app/_components/desktop-bridge-provider";

export type PinMatch = {
  role: "METADATA" | "MEDIA";
  id: string;
  slug: string;
  title: string;
  artistName: string | null;
  artistUsername: string | null;
  foundationUrl: string | null;
  contractAddress: string;
  tokenId: string;
  posterUrl: string | null;
};

export type ConfigDraft = {
  downloadRootDir: string;
  syncEnabled: boolean;
  localGatewayBaseUrl: string;
  publicGatewayBaseUrl: string;
  relayEnabled: boolean;
  relayServerUrl: string;
  relayDeviceName: string;
};

export function itemLabel(item: BridgePinInventoryItem) {
  if (item.title) return item.title;
  if (item.label) return item.label;
  if (item.foundationUrl) return "Foundation root";
  return "IPFS root";
}

export function itemContext(item: BridgePinInventoryItem) {
  if (item.contractAddress && item.tokenId) {
    return `${shortAddress(item.contractAddress)} #${item.tokenId}`;
  }

  if (item.username) return `@${item.username}`;
  if (item.artistUsername) return `@${item.artistUsername}`;
  return "Pinned on your computer";
}

export function statusLabel(device: RelayOwnerDevice | null) {
  if (!device) return "Not connected";
  if (device.connected) return "Connected";
  return "Saved app";
}
