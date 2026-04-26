/* eslint-disable max-lines-per-function, complexity */

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, X, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import {
  useDesktopBridge,
  type DesktopShareableWork,
} from "~/app/_components/desktop-bridge-provider";
import { api, type RouterOutputs } from "~/trpc/react";
import { cn } from "~/lib/utils";

type PinHostRecord = RouterOutputs["pinHosts"]["list"][number];
type PinHostWorkState = RouterOutputs["pinHosts"]["getWorkStates"][string][number];

export type ArchiveSaveWork = DesktopShareableWork & {
  chainId: number;
};

type SaveStatus = "idle" | "pending" | "saved" | "error";

type WorkSaveState = {
  archive: SaveStatus;
  desktop: SaveStatus;
  hosts: Record<string, { label: string; status: SaveStatus }>;
};

type ToastTone = "pending" | "success" | "error";

type ToastRecord = {
  id: string;
  title: string;
  body: string;
  tone: ToastTone;
};

type ArchiveSaveContextValue = {
  pinHosts: PinHostRecord[];
  pinHostsReady: boolean;
  pinHostsLoading: boolean;
  refreshPinHosts: () => Promise<void>;
  upsertPinHost: (input: {
    hostId?: string | null;
    label: string;
    presetKey: string;
    kind: "PSA" | "KUBO_RPC";
    endpointUrl: string;
    publicGatewayUrl?: string | null;
    authMode: "NONE" | "BEARER" | "BASIC" | "CUSTOM_HEADER";
    authToken?: string | null;
    authUsername?: string | null;
    authPassword?: string | null;
    authHeaderName?: string | null;
    enabled?: boolean;
    autoPin?: boolean;
  }) => Promise<void>;
  removePinHost: (hostId: string) => Promise<void>;
  requestArchiveSave: (work: ArchiveSaveWork) => Promise<void>;
  saveToDesktop: (work: ArchiveSaveWork) => Promise<void>;
  saveToHosts: (
    work: ArchiveSaveWork,
    hostIds?: string[] | null,
    options?: { useAutoPin?: boolean },
  ) => Promise<void>;
  saveEverywhere: (work: ArchiveSaveWork) => Promise<void>;
  getWorkState: (work: ArchiveSaveWork) => WorkSaveState;
};

const ArchiveSaveContext = createContext<ArchiveSaveContextValue | null>(null);

const TOAST_EASE = [0.22, 1, 0.36, 1] as const;

function workKey(work: Pick<ArchiveSaveWork, "chainId" | "contractAddress" | "tokenId">) {
  return `${work.chainId}:${work.contractAddress.toLowerCase()}:${work.tokenId}`;
}

function emptyWorkState(): WorkSaveState {
  return {
    archive: "idle",
    desktop: "idle",
    hosts: {},
  };
}

function createToastId(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported" as const;
  }

  if (Notification.permission === "granted") return "granted" as const;
  if (Notification.permission === "denied") return "denied" as const;

  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function showBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    new Notification(title, {
      body,
      tag: "agorix-save-manager",
    });
  } catch {
    // Best effort only.
  }
}

export function ArchiveSaveManagerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const bridge = useDesktopBridge();
  const [workStates, setWorkStates] = useState<Record<string, WorkSaveState>>({});
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const notificationPermissionRef = useRef<Promise<string> | null>(null);
  const utils = api.useUtils();

  const ownerToken = bridge.ownerToken;
  const pinHostsQuery = api.pinHosts.list.useQuery(
    { ownerToken: ownerToken ?? "" },
    {
      enabled: Boolean(ownerToken),
      staleTime: 15_000,
    },
  );
  const upsertPinHostMutation = api.pinHosts.upsert.useMutation();
  const removePinHostMutation = api.pinHosts.remove.useMutation();
  const archiveMutation = api.archive.requestArtworkArchive.useMutation();
  const pinWorkMutation = api.pinHosts.pinWork.useMutation();

  const pinHosts = pinHostsQuery.data ?? [];

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts
      .filter((toast) => toast.tone !== "pending")
      .map((toast) =>
        window.setTimeout(() => {
          setToasts((current) => current.filter((item) => item.id !== toast.id));
        }, 5000),
      );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [toasts]);

  const updateToast = (id: string, next: Omit<ToastRecord, "id">) => {
    setToasts((current) =>
      current.map((toast) => (toast.id === id ? { id, ...next } : toast)),
    );
  };

  const pushToast = (toast: ToastRecord) => {
    setToasts((current) => [...current.slice(-4), toast]);
  };

  const patchWorkState = (
    key: string,
    updater: (current: WorkSaveState) => WorkSaveState,
  ) => {
    setWorkStates((current) => ({
      ...current,
      [key]: updater(current[key] ?? emptyWorkState()),
    }));
  };

  const refreshPinHosts = async () => {
    if (!ownerToken) return;
    await pinHostsQuery.refetch();
  };

  const upsertPinHost = async (
    input: ArchiveSaveContextValue["upsertPinHost"] extends (
      arg: infer T,
    ) => Promise<void>
      ? T
      : never,
  ) => {
    if (!ownerToken) {
      throw new Error("Desktop save state is not ready yet.");
    }

    await upsertPinHostMutation.mutateAsync({
      ownerToken,
      ...input,
    });
    await utils.pinHosts.list.invalidate({ ownerToken });
  };

  const removePinHost = async (hostId: string) => {
    if (!ownerToken) {
      throw new Error("Desktop save state is not ready yet.");
    }

    await removePinHostMutation.mutateAsync({
      ownerToken,
      hostId,
    });
    await utils.pinHosts.list.invalidate({ ownerToken });
  };

  const requestArchiveSave = async (work: ArchiveSaveWork) => {
    const key = workKey(work);
    const toastId = createToastId("archive");
    pushToast({
      id: toastId,
      tone: "pending",
      title: "Saving to Agorix",
      body: `${work.title} was added to the archive queue.`,
    });
    patchWorkState(key, (current) => ({ ...current, archive: "pending" }));

    try {
      const result = await archiveMutation.mutateAsync({
        chainId: work.chainId,
        contractAddress: work.contractAddress,
        tokenId: work.tokenId,
        foundationUrl: work.foundationUrl ?? undefined,
      });

      if (result.state === "already-pinned") {
        patchWorkState(key, (current) => ({ ...current, archive: "saved" }));
        updateToast(toastId, {
          tone: "success",
          title: "Already saved",
          body: `${result.title} is already preserved in Agorix.`,
        });
      } else {
        patchWorkState(key, (current) => ({ ...current, archive: "pending" }));
        updateToast(toastId, {
          tone: "success",
          title: "Queued for Agorix",
          body:
            result.jobsAhead === 0
              ? `${work.title} is next up in the save queue.`
              : `${work.title} joined the save queue at #${result.jobsAhead + 1}.`,
        });
      }

      router.refresh();
    } catch (error) {
      patchWorkState(key, (current) => ({ ...current, archive: "error" }));
      updateToast(toastId, {
        tone: "error",
        title: "Archive save failed",
        body:
          error instanceof Error
            ? error.message
            : "Couldn't queue this work for the archive.",
      });
    }
  };

  const saveToDesktop = async (work: ArchiveSaveWork) => {
    const key = workKey(work);
    const toastId = createToastId("desktop");
    pushToast({
      id: toastId,
      tone: "pending",
      title: "Sending to desktop",
      body: `Saving ${work.title} to your desktop app.`,
    });
    patchWorkState(key, (current) => ({ ...current, desktop: "pending" }));

    notificationPermissionRef.current ??= ensureNotificationPermission();

    try {
      if (bridge.reachable) {
        const result = await bridge.shareWork(work);
        patchWorkState(key, (current) => ({ ...current, desktop: "saved" }));
        updateToast(toastId, {
          tone: "success",
          title: "Saved to desktop",
          body: `${work.title} sent ${result.pins.length} file${result.pins.length === 1 ? "" : "s"} to this computer.`,
        });
      } else {
        const hasPairedDevice = bridge.relayDevices.length > 0;
        if (!hasPairedDevice) {
          throw new Error(
            "Desktop app isn't connected yet. Open the desktop app, then try again.",
          );
        }

        await bridge.queueWorkToRelay(work);
        patchWorkState(key, (current) => ({ ...current, desktop: "saved" }));
        updateToast(toastId, {
          tone: "success",
          title: "Saved to desktop",
          body: `${work.title} is queued for your linked desktop app.`,
        });
      }

      const permission = await notificationPermissionRef.current.catch(
        () => "unsupported",
      );
      if (permission === "granted") {
        showBrowserNotification(
          "Agorix save complete",
          `${work.title} is pinned on your desktop app now.`,
        );
      }
    } catch (error) {
      patchWorkState(key, (current) => ({ ...current, desktop: "error" }));
      updateToast(toastId, {
        tone: "error",
        title: "Desktop save failed",
        body:
          error instanceof Error
            ? error.message
            : "Couldn't save this work to your desktop app.",
      });
    }
  };

  const saveToHosts = async (
    work: ArchiveSaveWork,
    hostIds?: string[] | null,
    options?: { useAutoPin?: boolean },
  ) => {
    if (!ownerToken) {
      throw new Error("Pinned hosts are not ready yet.");
    }

    const selectedHostIds =
      hostIds && hostIds.length > 0
        ? hostIds
        : options?.useAutoPin
          ? pinHosts.filter((host) => host.autoPin && host.enabled).map((host) => host.id)
          : [];

    if (selectedHostIds.length === 0 && !options?.useAutoPin) {
      throw new Error("Pick at least one host first.");
    }

    const key = workKey(work);
    const pendingHosts = pinHosts.filter((host) =>
      options?.useAutoPin ? host.autoPin && host.enabled : selectedHostIds.includes(host.id),
    );
    const toastId = createToastId("host");

    pushToast({
      id: toastId,
      tone: "pending",
      title: "Pinning to hosts",
      body: `Sending ${work.title} to ${pendingHosts.length} pinned host${pendingHosts.length === 1 ? "" : "s"}.`,
    });

    patchWorkState(key, (current) => ({
      ...current,
      hosts: {
        ...current.hosts,
        ...Object.fromEntries(
          pendingHosts.map((host) => [
            host.id,
            { label: host.label, status: "pending" as const },
          ]),
        ),
      },
    }));

    try {
      const results = await pinWorkMutation.mutateAsync({
        ownerToken,
        hostIds: hostIds ?? null,
        useAutoPin: options?.useAutoPin,
        work,
      });

      patchWorkState(key, (current) => ({
        ...current,
        hosts: {
          ...current.hosts,
          ...Object.fromEntries(
            results.map((result) => [
              result.hostId,
              {
                label:
                  pinHosts.find((host) => host.id === result.hostId)?.label ??
                  result.hostLabel,
                status: result.status === "PINNED" ? "saved" : "error",
              },
            ]),
          ),
        },
      }));

      const successCount = results.filter((result) => result.status === "PINNED").length;
      const failedCount = results.length - successCount;

      updateToast(toastId, {
        tone: failedCount > 0 ? "error" : "success",
        title: failedCount > 0 ? "Some hosts failed" : "Pinned to hosts",
        body:
          failedCount > 0
            ? `${work.title} pinned to ${successCount} host${successCount === 1 ? "" : "s"}, with ${failedCount} failure${failedCount === 1 ? "" : "s"}.`
            : `${work.title} pinned to ${successCount} host${successCount === 1 ? "" : "s"}.`,
      });

      await utils.pinHosts.getWorkStates.invalidate({ ownerToken, works: [work] });
      await utils.pinHosts.list.invalidate({ ownerToken });
    } catch (error) {
      patchWorkState(key, (current) => ({
        ...current,
        hosts: {
          ...current.hosts,
          ...Object.fromEntries(
            pendingHosts.map((host) => [
              host.id,
              { label: host.label, status: "error" as const },
            ]),
          ),
        },
      }));
      updateToast(toastId, {
        tone: "error",
        title: "Host pin failed",
        body:
          error instanceof Error
            ? error.message
            : "Couldn't pin this work to the selected hosts.",
      });
    }
  };

  const saveEverywhere = async (work: ArchiveSaveWork) => {
    const enabledHosts = pinHosts.filter((host) => host.enabled && host.autoPin);
    const tasks = [requestArchiveSave(work)];

    if (bridge.reachable || bridge.relayDevices.length > 0) {
      tasks.push(saveToDesktop(work));
    }

    if (enabledHosts.length > 0 && ownerToken) {
      tasks.push(saveToHosts(work, enabledHosts.map((host) => host.id)));
    }

    await Promise.allSettled(tasks);
  };

  const value: ArchiveSaveContextValue = {
    pinHosts,
    pinHostsReady: Boolean(ownerToken),
    pinHostsLoading: pinHostsQuery.isLoading || pinHostsQuery.isFetching,
    refreshPinHosts,
    upsertPinHost,
    removePinHost,
    requestArchiveSave,
    saveToDesktop,
    saveToHosts,
    saveEverywhere,
    getWorkState: (work) => workStates[workKey(work)] ?? emptyWorkState(),
  };

  return (
    <ArchiveSaveContext.Provider value={value}>
      {children}
      <SaveToastViewport toasts={toasts} onDismiss={(id) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }} />
    </ArchiveSaveContext.Provider>
  );
}

function SaveToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(100vw-2rem,26rem)] flex-col gap-3">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.28, ease: TOAST_EASE }}
            className={cn(
              "pointer-events-auto rounded-2xl border bg-[var(--color-surface)] p-4 shadow-[0_24px_70px_-30px_rgba(17,17,17,0.55)]",
              toast.tone === "error"
                ? "border-[var(--color-err)]/35"
                : toast.tone === "success"
                  ? "border-[var(--color-ok)]/25"
                  : "border-[var(--color-line)]",
            )}
            role={toast.tone === "error" ? "alert" : "status"}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  toast.tone === "error"
                    ? "bg-[var(--tint-err)] text-[var(--color-err)]"
                    : toast.tone === "success"
                      ? "bg-[var(--tint-ok)] text-[var(--color-ok)]"
                      : "bg-[var(--color-surface-alt)] text-[var(--color-ink)]",
                )}
              >
                {toast.tone === "pending" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : toast.tone === "success" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--color-ink)]">
                  {toast.title}
                </p>
                <p className="mt-1 text-sm text-[var(--color-body)]">
                  {toast.body}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-ink)]"
                aria-label="Dismiss save message"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function useArchiveSaveManager() {
  const context = useContext(ArchiveSaveContext);
  if (!context) {
    throw new Error("useArchiveSaveManager must be used inside ArchiveSaveManagerProvider.");
  }
  return context;
}

export function summarizeWorkTargetState(
  optimistic: WorkSaveState,
  remote: PinHostWorkState[] | undefined,
) {
  const hostEntries = new Map<string, { label: string; status: SaveStatus | PinHostWorkState["status"] }>();

  for (const [hostId, entry] of Object.entries(optimistic.hosts)) {
    hostEntries.set(hostId, { label: entry.label, status: entry.status });
  }

  for (const entry of remote ?? []) {
    hostEntries.set(entry.hostId, {
      label: entry.hostLabel,
      status: entry.status,
    });
  }

  const hosts = Array.from(hostEntries.values());
  const savedHosts = hosts.filter(
    (host) => host.status === "saved" || host.status === "PINNED",
  ).length;
  const pendingHosts = hosts.filter(
    (host) => host.status === "pending" || host.status === "PENDING",
  ).length;

  return {
    savedHosts,
    pendingHosts,
    desktopSaved: optimistic.desktop === "saved",
    desktopPending: optimistic.desktop === "pending",
    archiveSaved: optimistic.archive === "saved",
    archivePending: optimistic.archive === "pending",
  };
}
