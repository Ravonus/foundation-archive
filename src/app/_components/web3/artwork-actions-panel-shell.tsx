"use client";

import { useEffect, useState, type ComponentType } from "react";

import type { ArtworkActionsPanelProps } from "./artwork-actions-panel";

type LoadedModules = {
  ArtworkActionsPanel: ComponentType<ArtworkActionsPanelProps>;
  Web3Provider: ComponentType<{ children: React.ReactNode }>;
};

function ActionsLoadingFallback() {
  return (
    <div className="rounded-sm border border-[var(--color-line)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-muted)]">
      Loading collector actions...
    </div>
  );
}

export function ArtworkActionsPanelShell(props: ArtworkActionsPanelProps) {
  const [loaded, setLoaded] = useState<LoadedModules | null>(null);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      import("./artwork-actions-panel"),
      import("./web3-provider"),
    ]).then(([panelModule, providerModule]) => {
      if (cancelled) return;
      setLoaded({
        ArtworkActionsPanel: panelModule.ArtworkActionsPanel,
        Web3Provider: providerModule.Web3Provider,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return <ActionsLoadingFallback />;
  }

  const { ArtworkActionsPanel, Web3Provider } = loaded;

  return (
    <Web3Provider>
      <ArtworkActionsPanel {...props} />
    </Web3Provider>
  );
}
