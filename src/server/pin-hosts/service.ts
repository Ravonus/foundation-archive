/* eslint-disable max-lines-per-function, complexity */

import {
  HostedPinStatus,
  PinHostAuthMode,
  PinHostKind,
  RootKind,
  type PrismaClient,
} from "~/server/prisma-client";
import { pinHostPresetById } from "~/lib/pin-host-presets";

type DbClient = PrismaClient;

type SavedRootInput = {
  cid: string;
  kind: RootKind;
};

type PinHostInput = {
  ownerToken: string;
  hostId?: string | null;
  label: string;
  presetKey: string;
  kind: PinHostKind;
  endpointUrl: string;
  publicGatewayUrl?: string | null;
  authMode: PinHostAuthMode;
  authToken?: string | null;
  authUsername?: string | null;
  authPassword?: string | null;
  authHeaderName?: string | null;
  enabled?: boolean;
  autoPin?: boolean;
};

type HostedWorkInput = {
  title: string;
  chainId: number;
  contractAddress: string;
  tokenId: string;
  metadataCid?: string | null;
  mediaCid?: string | null;
};

type PinHostSecretRecord = {
  id: string;
  label: string;
  kind: PinHostKind;
  endpointUrl: string;
  authMode: PinHostAuthMode;
  authTokenRaw: string | null;
  authUsernameRaw: string | null;
  authPasswordRaw: string | null;
  authHeaderNameRaw: string | null;
};

function trimNullable(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEndpointUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function normalizeGatewayUrl(value: string | null | undefined) {
  const trimmed = trimNullable(value);
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

function summarizeToken(token: string | null | undefined) {
  const value = trimNullable(token);
  if (!value) return null;
  if (value.length <= 8) return "Configured";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function buildHeaders(input: {
  authMode: PinHostAuthMode;
  authToken: string | null;
  authUsername: string | null;
  authPassword: string | null;
  authHeaderName: string | null;
}) {
  const headers = new Headers();
  headers.set("Accept", "application/json");

  if (input.authMode === PinHostAuthMode.BEARER && input.authToken) {
    headers.set("Authorization", `Bearer ${input.authToken}`);
  }

  if (
    input.authMode === PinHostAuthMode.BASIC &&
    input.authUsername &&
    input.authPassword
  ) {
    const token = Buffer.from(
      `${input.authUsername}:${input.authPassword}`,
    ).toString("base64");
    headers.set("Authorization", `Basic ${token}`);
  }

  if (
    input.authMode === PinHostAuthMode.CUSTOM_HEADER &&
    input.authToken &&
    input.authHeaderName
  ) {
    headers.set(input.authHeaderName, input.authToken);
  }

  return headers;
}

function normalizeRoots(work: HostedWorkInput): SavedRootInput[] {
  const roots: SavedRootInput[] = [];
  if (work.metadataCid?.trim()) {
    roots.push({ cid: work.metadataCid.trim(), kind: RootKind.METADATA });
  }
  if (work.mediaCid?.trim()) {
    roots.push({ cid: work.mediaCid.trim(), kind: RootKind.MEDIA });
  }
  return roots;
}

function workKey(input: {
  chainId: number;
  contractAddress: string;
  tokenId: string;
}) {
  return `${input.chainId}:${input.contractAddress.toLowerCase()}:${input.tokenId}`;
}

function pinName(work: HostedWorkInput, root: SavedRootInput) {
  const suffix =
    root.kind === RootKind.METADATA
      ? "metadata"
      : root.kind === RootKind.MEDIA
        ? "media"
        : "root";
  return `${work.title} · ${suffix}`;
}

async function parseError(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");
  if (!text) return fallback;
  try {
    const payload = JSON.parse(text) as {
      error?: { reason?: string };
      message?: string;
      errorMessage?: string;
    };
    return (
      payload.error?.reason ?? payload.message ?? payload.errorMessage ?? fallback
    );
  } catch {
    return `${fallback} ${text.slice(0, 160)}`.trim();
  }
}

async function pinWithPsa(args: {
  endpointUrl: string;
  headers: Headers;
  work: HostedWorkInput;
  root: SavedRootInput;
}) {
  const baseUrl = normalizeEndpointUrl(args.endpointUrl);
  const url = baseUrl.endsWith("/pins") ? baseUrl : `${baseUrl}/pins`;
  const headers = new Headers(args.headers);
  headers.set("Content-Type", "application/json");

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      cid: args.root.cid,
      name: pinName(args.work, args.root),
    }),
  });

  if (response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | {
          requestid?: string;
          pin?: { cid?: string };
        }
      | null;
    return payload?.requestid ?? args.root.cid;
  }

  if (response.status === 409) {
    return args.root.cid;
  }

  throw new Error(await parseError(response, "Host pin request failed."));
}

async function pinWithKubo(args: {
  endpointUrl: string;
  headers: Headers;
  root: SavedRootInput;
}) {
  const url = new URL("/api/v0/pin/add", normalizeEndpointUrl(args.endpointUrl));
  url.searchParams.set("arg", args.root.cid);
  url.searchParams.set("recursive", "true");

  const response = await fetch(url, {
    method: "POST",
    headers: args.headers,
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Kubo pin request failed."));
  }

  const payload = (await response.json().catch(() => null)) as
    | { Pins?: string[] }
    | null;
  return payload?.Pins?.[0] ?? args.root.cid;
}

async function pinRootToHost(args: {
  host: PinHostSecretRecord;
  work: HostedWorkInput;
  root: SavedRootInput;
}) {
  const headers = buildHeaders({
    authMode: args.host.authMode,
    authToken: args.host.authTokenRaw,
    authUsername: args.host.authUsernameRaw,
    authPassword: args.host.authPasswordRaw,
    authHeaderName: args.host.authHeaderNameRaw,
  });

  if (args.host.kind === PinHostKind.KUBO_RPC) {
    return pinWithKubo({
      endpointUrl: args.host.endpointUrl,
      headers,
      root: args.root,
    });
  }

  return pinWithPsa({
    endpointUrl: args.host.endpointUrl,
    headers,
    work: args.work,
    root: args.root,
  });
}

export async function listPinHosts(db: DbClient, ownerToken: string) {
  const hosts = await db.pinHost.findMany({
    where: { ownerToken },
    orderBy: [{ autoPin: "desc" }, { createdAt: "asc" }],
  });

  return hosts.map((host) => ({
    id: host.id,
    label: host.label,
    presetKey: host.presetKey,
    kind: host.kind,
    endpointUrl: host.endpointUrl,
    publicGatewayUrl: host.publicGatewayUrl,
    authMode: host.authMode,
    authHeaderName: host.authHeaderName,
    enabled: host.enabled,
    autoPin: host.autoPin,
    lastPinnedAt: host.lastPinnedAt,
    lastError: host.lastError,
    createdAt: host.createdAt,
    updatedAt: host.updatedAt,
    authConfigured:
      Boolean(host.authToken) ||
      (Boolean(host.authUsername) && Boolean(host.authPassword)),
    authSummary:
      host.authMode === PinHostAuthMode.BASIC
        ? trimNullable(host.authUsername)
        : summarizeToken(host.authToken),
    presetLabel: pinHostPresetById(host.presetKey)?.label ?? host.label,
  }));
}

async function getPinHostForUpdate(
  db: DbClient,
  ownerToken: string,
  hostId: string,
) {
  const host = await db.pinHost.findFirst({
    where: { id: hostId, ownerToken },
  });

  if (!host) {
    throw new Error("Pinned host was not found.");
  }

  return host;
}

export async function upsertPinHost(db: DbClient, input: PinHostInput) {
  const label = input.label.trim();
  if (label.length === 0) {
    throw new Error("Host label is required.");
  }

  const endpointUrl = normalizeEndpointUrl(input.endpointUrl);
  if (endpointUrl.length === 0) {
    throw new Error("Host API URL is required.");
  }

  const payload = {
    label,
    presetKey: input.presetKey.trim() || "generic-psa",
    kind: input.kind,
    endpointUrl,
    publicGatewayUrl: normalizeGatewayUrl(input.publicGatewayUrl),
    authMode: input.authMode,
    authToken: trimNullable(input.authToken),
    authUsername: trimNullable(input.authUsername),
    authPassword: trimNullable(input.authPassword),
    authHeaderName: trimNullable(input.authHeaderName),
    enabled: input.enabled ?? true,
    autoPin: input.autoPin ?? true,
  };

  if (input.hostId) {
    const existing = await getPinHostForUpdate(db, input.ownerToken, input.hostId);
    const updated = await db.pinHost.update({
      where: { id: existing.id },
      data: {
        ...payload,
        authToken: payload.authToken ?? existing.authToken,
        authUsername: payload.authUsername ?? existing.authUsername,
        authPassword: payload.authPassword ?? existing.authPassword,
      },
    });

    return updated.id;
  }

  const created = await db.pinHost.create({
    data: {
      ownerToken: input.ownerToken,
      ...payload,
    },
  });

  return created.id;
}

export async function removePinHost(
  db: DbClient,
  input: { ownerToken: string; hostId: string },
) {
  const host = await getPinHostForUpdate(db, input.ownerToken, input.hostId);
  await db.pinHost.delete({ where: { id: host.id } });
  return { removed: true as const };
}

export async function getPinnedWorkStates(
  db: DbClient,
  input: { ownerToken: string; works: HostedWorkInput[] },
) {
  const cidToKeys = new Map<string, string[]>();
  const keys = input.works.map((work) => workKey(work));

  input.works.forEach((work) => {
    const key = workKey(work);
    for (const root of normalizeRoots(work)) {
      const next = cidToKeys.get(root.cid) ?? [];
      next.push(key);
      cidToKeys.set(root.cid, next);
    }
  });

  const rootCids = Array.from(cidToKeys.keys());
  if (rootCids.length === 0) {
    return Object.fromEntries(keys.map((key) => [key, []])) as Record<
      string,
      Array<{
        hostId: string;
        hostLabel: string;
        status: "PINNED" | "PENDING" | "FAILED" | "PARTIAL";
      }>
    >;
  }

  const matches = await db.hostedPin.findMany({
    where: {
      ownerToken: input.ownerToken,
      rootCid: { in: rootCids },
    },
    include: {
      host: true,
    },
  });

  const workStatus = new Map<
    string,
    Map<
      string,
      {
        hostId: string;
        hostLabel: string;
        statuses: HostedPinStatus[];
      }
    >
  >();

  for (const match of matches) {
    for (const key of cidToKeys.get(match.rootCid) ?? []) {
      const hostMap =
        workStatus.get(key) ??
        new Map<
          string,
          {
            hostId: string;
            hostLabel: string;
            statuses: HostedPinStatus[];
          }
        >();
      const current = hostMap.get(match.hostId) ?? {
        hostId: match.hostId,
        hostLabel: match.host.label,
        statuses: [] as HostedPinStatus[],
      };
      current.statuses.push(match.status);
      hostMap.set(match.hostId, current);
      workStatus.set(key, hostMap);
    }
  }

  return Object.fromEntries(
    keys.map((key) => {
      const hostMap =
        workStatus.get(key) ??
        new Map<
          string,
          {
            hostId: string;
            hostLabel: string;
            statuses: HostedPinStatus[];
          }
        >();
      const statuses = Array.from(hostMap.values()).map((entry) => ({
        hostId: entry.hostId,
        hostLabel: entry.hostLabel,
        status: entry.statuses.every(
          (status: HostedPinStatus) => status === HostedPinStatus.PINNED,
        )
          ? "PINNED"
          : entry.statuses.some(
              (status: HostedPinStatus) => status === HostedPinStatus.PENDING,
            )
            ? "PENDING"
            : entry.statuses.some(
                (status: HostedPinStatus) => status === HostedPinStatus.PINNED,
              )
              ? "PARTIAL"
              : "FAILED",
      }));
      return [key, statuses];
    }),
  ) as Record<
    string,
    Array<{
      hostId: string;
      hostLabel: string;
      status: "PINNED" | "PENDING" | "FAILED" | "PARTIAL";
    }>
  >;
}

export async function pinWorkToHosts(
  db: DbClient,
  input: {
    ownerToken: string;
    work: HostedWorkInput;
    hostIds?: string[] | null;
    useAutoPin?: boolean;
  },
) {
  const roots = normalizeRoots(input.work);
  if (roots.length === 0) {
    throw new Error("This work does not expose any IPFS roots to pin.");
  }

  const requestedHostIds = Array.from(
    new Set((input.hostIds ?? []).map((hostId) => hostId.trim()).filter(Boolean)),
  );
  const hosts = await db.pinHost.findMany({
    where: {
      ownerToken: input.ownerToken,
      enabled: true,
      ...(requestedHostIds.length > 0
        ? { id: { in: requestedHostIds } }
        : input.useAutoPin
          ? { autoPin: true }
          : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  if (hosts.length === 0) {
    throw new Error("No enabled pinned hosts are ready yet.");
  }

  const results: Array<{
    hostId: string;
    hostLabel: string;
    status: "PINNED" | "FAILED";
    pinnedRoots: number;
    failedRoots: number;
    message: string | null;
  }> = [];

  for (const host of hosts) {
    let pinnedRoots = 0;
    let failedRoots = 0;
    let firstError: string | null = null;

    for (const root of roots) {
      await db.hostedPin.upsert({
        where: {
          hostId_rootCid: {
            hostId: host.id,
            rootCid: root.cid,
          },
        },
        create: {
          ownerToken: input.ownerToken,
          hostId: host.id,
          chainId: input.work.chainId,
          contractAddress: input.work.contractAddress.toLowerCase(),
          tokenId: input.work.tokenId,
          rootCid: root.cid,
          rootKind: root.kind,
          title: input.work.title,
          status: HostedPinStatus.PENDING,
        },
        update: {
          chainId: input.work.chainId,
          contractAddress: input.work.contractAddress.toLowerCase(),
          tokenId: input.work.tokenId,
          rootKind: root.kind,
          title: input.work.title,
          status: HostedPinStatus.PENDING,
          errorMessage: null,
        },
      });

      try {
        const reference = await pinRootToHost({
          host: {
            ...host,
            authTokenRaw: host.authToken,
            authUsernameRaw: host.authUsername,
            authPasswordRaw: host.authPassword,
            authHeaderNameRaw: host.authHeaderName,
          },
          work: input.work,
          root,
        });

        pinnedRoots += 1;
        await db.hostedPin.update({
          where: {
            hostId_rootCid: {
              hostId: host.id,
              rootCid: root.cid,
            },
          },
          data: {
            status: HostedPinStatus.PINNED,
            pinReference: reference,
            errorMessage: null,
            completedAt: new Date(),
          },
        });
      } catch (error) {
        failedRoots += 1;
        const message =
          error instanceof Error ? error.message : "Host pin failed.";
        firstError ??= message;

        await db.hostedPin.update({
          where: {
            hostId_rootCid: {
              hostId: host.id,
              rootCid: root.cid,
            },
          },
          data: {
            status: HostedPinStatus.FAILED,
            errorMessage: message,
            completedAt: new Date(),
          },
        });
      }
    }

    await db.pinHost.update({
      where: { id: host.id },
      data: {
        lastPinnedAt: pinnedRoots > 0 ? new Date() : host.lastPinnedAt,
        lastError: firstError,
      },
    });

    results.push({
      hostId: host.id,
      hostLabel: host.label,
      status: failedRoots > 0 ? "FAILED" : "PINNED",
      pinnedRoots,
      failedRoots,
      message: firstError,
    });
  }

  return results;
}
