"use client";

import { useTransition } from "react";

export function useDesktopConsoleTransitions() {
  const [isRefreshing, startRefresh] = useTransition();
  const [isRepairing, startRepair] = useTransition();
  const [isSavingConfig, startSaveConfig] = useTransition();
  const [isSyncing, startSync] = useTransition();
  const [isPairing, startPairing] = useTransition();
  const [isConnectingLocal, startConnectLocal] = useTransition();
  const [isDisconnecting, startDisconnect] = useTransition();
  const [isVerifying, startVerify] = useTransition();

  return {
    isRefreshing,
    startRefresh,
    isRepairing,
    startRepair,
    isSavingConfig,
    startSaveConfig,
    isSyncing,
    startSync,
    isPairing,
    startPairing,
    isConnectingLocal,
    startConnectLocal,
    isDisconnecting,
    startDisconnect,
    isVerifying,
    startVerify,
  };
}
