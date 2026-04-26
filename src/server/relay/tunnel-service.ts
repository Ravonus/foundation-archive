/* eslint-disable complexity, max-lines-per-function */

import { randomBytes } from "crypto";

import type { PrismaClient } from "~/server/prisma-client";
import {
  createNamedTunnel,
  createTunnelDnsRecord,
  deleteDnsRecord,
  deleteTunnel,
  setTunnelIngress,
  tunnelDomain,
} from "~/server/cloudflare/api";

type DbClient = PrismaClient;

const DEFAULT_LOCAL_SERVICE = "http://localhost:43128";
const SUBDOMAIN_PREFIX = "bridge-";
const LIBP2P_SUBDOMAIN_PREFIX = "libp2p-";
/// Default local TCP port Kubo will bind its WebSocket listener to — the
/// cloudflared ingress for the libp2p subdomain forwards WSS here.
const DEFAULT_LIBP2P_WS_PORT = 4002;

export type TunnelStatus = {
  enabled: boolean;
  hostname: string | null;
  subdomain: string | null;
  provisionedAt: Date | null;
  lastError: string | null;
  libp2pHostname: string | null;
  libp2pSubdomain: string | null;
};

function generateSubdomain(prefix: string): string {
  return `${prefix}${randomBytes(5).toString("hex")}`;
}

async function findOwnedDevice(
  db: DbClient,
  input: { ownerToken: string; deviceId: string },
) {
  const device = await db.relayDevice.findFirst({
    where: { id: input.deviceId, ownerToken: input.ownerToken },
  });
  if (!device) throw new Error("Linked desktop device was not found.");
  return device;
}

export async function getTunnelStatusForOwner(
  db: DbClient,
  input: { ownerToken: string; deviceId: string },
): Promise<TunnelStatus> {
  const device = await findOwnedDevice(db, input);
  return {
    enabled: device.tunnelEnabled,
    hostname: device.tunnelHostname,
    subdomain: device.tunnelSubdomain,
    provisionedAt: device.tunnelProvisionedAt,
    lastError: device.tunnelLastError,
    libp2pHostname: device.libp2pHostname,
    libp2pSubdomain: device.libp2pSubdomain,
  };
}

export async function provisionTunnelForDevice(
  db: DbClient,
  input: {
    ownerToken: string;
    deviceId: string;
    localService?: string;
  },
): Promise<{
  status: TunnelStatus;
  token: string;
}> {
  const device = await findOwnedDevice(db, input);

  // Short-circuit: already fully provisioned with both gateway + libp2p
  // ingress? Hand back the existing creds. This is what the bridge hits on
  // every boot to re-fetch the token.
  if (
    device.tunnelEnabled &&
    device.tunnelHostname &&
    device.tunnelToken &&
    device.libp2pHostname
  ) {
    return {
      token: device.tunnelToken,
      status: {
        enabled: true,
        hostname: device.tunnelHostname,
        subdomain: device.tunnelSubdomain,
        provisionedAt: device.tunnelProvisionedAt,
        lastError: null,
        libp2pHostname: device.libp2pHostname,
        libp2pSubdomain: device.libp2pSubdomain,
      },
    };
  }

  const domain = tunnelDomain();
  const gatewaySubdomain =
    device.tunnelSubdomain ??
    (await allocateSubdomain(db, SUBDOMAIN_PREFIX, "tunnelSubdomain"));
  const gatewayHostname = `${gatewaySubdomain}.${domain}`;
  const libp2pSubdomain =
    device.libp2pSubdomain ??
    (await allocateSubdomain(db, LIBP2P_SUBDOMAIN_PREFIX, "libp2pSubdomain"));
  const libp2pHostname = `${libp2pSubdomain}.${domain}`;
  const gatewayService = input.localService?.trim() ?? DEFAULT_LOCAL_SERVICE;
  const libp2pService = `http://localhost:${DEFAULT_LIBP2P_WS_PORT}`;

  let tunnelId = device.tunnelId;
  let tunnelToken = device.tunnelToken;
  let dnsRecordId = device.tunnelDnsRecordId;
  let libp2pDnsRecordId = device.libp2pDnsRecordId;

  try {
    if (!tunnelId || !tunnelToken) {
      const created = await createNamedTunnel(`fa-${device.id}`);
      tunnelId = created.id;
      tunnelToken = created.token;
    }

    // Set BOTH ingress rules in a single tunnel config PUT so we don't
    // race the first rule out of existence while adding the second.
    await setTunnelIngress(tunnelId, [
      { hostname: gatewayHostname, service: gatewayService },
      { hostname: libp2pHostname, service: libp2pService },
    ]);

    if (!dnsRecordId) {
      const record = await createTunnelDnsRecord(gatewaySubdomain, tunnelId);
      dnsRecordId = record.id;
    }
    if (!libp2pDnsRecordId) {
      const record = await createTunnelDnsRecord(libp2pSubdomain, tunnelId);
      libp2pDnsRecordId = record.id;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tunnel provisioning failed.";
    await db.relayDevice.update({
      where: { id: device.id },
      data: { tunnelLastError: message },
    });
    throw error;
  }

  const updated = await db.relayDevice.update({
    where: { id: device.id },
    data: {
      tunnelEnabled: true,
      tunnelId,
      tunnelHostname: gatewayHostname,
      tunnelSubdomain: gatewaySubdomain,
      tunnelDnsRecordId: dnsRecordId,
      tunnelToken,
      tunnelProvisionedAt: new Date(),
      tunnelLastError: null,
      libp2pHostname,
      libp2pSubdomain,
      libp2pDnsRecordId,
    },
  });

  return {
    token: tunnelToken,
    status: {
      enabled: updated.tunnelEnabled,
      hostname: updated.tunnelHostname,
      subdomain: updated.tunnelSubdomain,
      provisionedAt: updated.tunnelProvisionedAt,
      lastError: updated.tunnelLastError,
      libp2pHostname: updated.libp2pHostname,
      libp2pSubdomain: updated.libp2pSubdomain,
    },
  };
}

export async function revokeTunnelForDevice(
  db: DbClient,
  input: { ownerToken: string; deviceId: string },
): Promise<TunnelStatus> {
  const device = await findOwnedDevice(db, input);

  const errors: string[] = [];

  for (const recordId of [device.tunnelDnsRecordId, device.libp2pDnsRecordId]) {
    if (!recordId) continue;
    try {
      await deleteDnsRecord(recordId);
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "DNS delete failed.",
      );
    }
  }

  if (device.tunnelId) {
    try {
      await deleteTunnel(device.tunnelId);
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Tunnel delete failed.",
      );
    }
  }

  const updated = await db.relayDevice.update({
    where: { id: device.id },
    data: {
      tunnelEnabled: false,
      tunnelId: null,
      tunnelHostname: null,
      tunnelSubdomain: null,
      tunnelDnsRecordId: null,
      tunnelToken: null,
      tunnelProvisionedAt: null,
      tunnelLastError: errors.length ? errors.join("; ") : null,
      libp2pHostname: null,
      libp2pSubdomain: null,
      libp2pDnsRecordId: null,
    },
  });

  return {
    enabled: updated.tunnelEnabled,
    hostname: updated.tunnelHostname,
    subdomain: updated.tunnelSubdomain,
    provisionedAt: updated.tunnelProvisionedAt,
    lastError: updated.tunnelLastError,
    libp2pHostname: updated.libp2pHostname,
    libp2pSubdomain: updated.libp2pSubdomain,
  };
}

export async function getTunnelTokenForDevice(
  db: DbClient,
  deviceToken: string,
): Promise<{
  enabled: boolean;
  hostname: string | null;
  token: string | null;
  localService: string;
}> {
  const device = await db.relayDevice.findUnique({
    where: { deviceSecret: deviceToken },
  });
  if (!device) throw new Error("Desktop device token was not recognized.");

  return {
    enabled: device.tunnelEnabled,
    hostname: device.tunnelHostname,
    token: device.tunnelToken,
    localService: DEFAULT_LOCAL_SERVICE,
  };
}

async function allocateSubdomain(
  db: DbClient,
  prefix: string,
  column: "tunnelSubdomain" | "libp2pSubdomain",
): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = generateSubdomain(prefix);
    const existing = await db.relayDevice.findFirst({
      where: { [column]: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error("Unable to allocate a unique tunnel subdomain.");
}
