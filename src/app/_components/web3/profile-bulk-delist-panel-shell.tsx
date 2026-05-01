"use client";

import { useEffect, useState, type ComponentType } from "react";

import type { ProfileBulkDelistPanelProps } from "./profile-bulk-delist-panel";

type LoadedModules = {
  ProfileBulkDelistPanel: ComponentType<ProfileBulkDelistPanelProps>;
  Web3Provider: ComponentType<{ children: React.ReactNode }>;
};

function BulkDelistLoadingFallback() {
  return (
    <div className="mt-6 rounded-sm border border-[var(--color-line)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-muted)]">
      Loading bulk delist...
    </div>
  );
}

export function ProfileBulkDelistPanelShell(
  props: ProfileBulkDelistPanelProps,
) {
  const [loaded, setLoaded] = useState<LoadedModules | null>(null);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      import("./profile-bulk-delist-panel"),
      import("./web3-provider"),
    ]).then(([panelModule, providerModule]) => {
      if (cancelled) return;
      setLoaded({
        ProfileBulkDelistPanel: panelModule.ProfileBulkDelistPanel,
        Web3Provider: providerModule.Web3Provider,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return <BulkDelistLoadingFallback />;
  }

  const { ProfileBulkDelistPanel, Web3Provider } = loaded;

  return (
    <Web3Provider>
      <ProfileBulkDelistPanel {...props} />
    </Web3Provider>
  );
}
