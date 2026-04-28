/* eslint-disable complexity */

import type {
  DesktopShareableWork,
  RelayQueuedJob,
  ShareWorkResult,
} from "~/app/_components/desktop-bridge-provider/types";

const DIRECT_SAVE_FALLBACK =
  "Couldn't reach the desktop app directly. Make sure the desktop app is open, then try again.";
const RELAY_SAVE_FALLBACK =
  "Couldn't reach the desktop relay right now. Try again in a moment.";
const DUAL_ROUTE_FALLBACK =
  "Couldn't reach the desktop app directly, and the relay queue also failed. Try again in a moment.";

type DesktopSaveRoute = "direct" | "relay";

export type DesktopSaveResult =
  | {
      route: "direct";
      result: ShareWorkResult;
    }
  | {
      route: "relay";
      result: RelayQueuedJob;
    };

function messageFromError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;

  const message = error.message.trim();
  if (
    error instanceof TypeError ||
    message === "Failed to fetch" ||
    message === "Load failed" ||
    /NetworkError/i.test(message)
  ) {
    return fallback;
  }

  return message.length > 0 ? message : fallback;
}

function shouldTryFallbackRoute(error: unknown, route: DesktopSaveRoute) {
  if (!(error instanceof Error)) return false;

  const message = error.message.trim();
  if (
    error instanceof TypeError ||
    message === "Failed to fetch" ||
    message === "Load failed" ||
    /NetworkError/i.test(message) ||
    /timed out/i.test(message)
  ) {
    return true;
  }

  if (route === "relay") {
    return (
      message === "Pair vault is not ready yet." ||
      message === "No linked desktop device is available yet."
    );
  }

  return false;
}

export async function saveWorkToDesktop(input: {
  work: DesktopShareableWork;
  canPinDirectly: boolean;
  hasPairedDevice: boolean;
  shareWork: (work: DesktopShareableWork) => Promise<ShareWorkResult>;
  queueWorkToRelay: (work: DesktopShareableWork) => Promise<RelayQueuedJob>;
}): Promise<DesktopSaveResult> {
  const { work, canPinDirectly, hasPairedDevice, shareWork, queueWorkToRelay } =
    input;

  let directFailedRecoverably = false;
  let relayFailedRecoverably = false;

  if (canPinDirectly) {
    try {
      return {
        route: "direct",
        result: await shareWork(work),
      };
    } catch (error) {
      if (!hasPairedDevice || !shouldTryFallbackRoute(error, "direct")) {
        throw new Error(messageFromError(error, DIRECT_SAVE_FALLBACK));
      }
      directFailedRecoverably = true;
    }
  }

  if (hasPairedDevice) {
    try {
      return {
        route: "relay",
        result: await queueWorkToRelay(work),
      };
    } catch (error) {
      if (!canPinDirectly || !shouldTryFallbackRoute(error, "relay")) {
        if (directFailedRecoverably) {
          throw new Error(DUAL_ROUTE_FALLBACK);
        }
        throw new Error(messageFromError(error, RELAY_SAVE_FALLBACK));
      }
      relayFailedRecoverably = true;
    }
  }

  if (
    canPinDirectly &&
    hasPairedDevice &&
    directFailedRecoverably &&
    relayFailedRecoverably
  ) {
    throw new Error(DUAL_ROUTE_FALLBACK);
  }

  throw new Error(
    "Desktop app isn't connected yet. Open the desktop app, then try again.",
  );
}
