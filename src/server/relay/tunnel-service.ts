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

export type TunnelStatus = {
  enabled: boolean;
  hostname: string | null;
  subdomain: string | null;
  provisionedAt: Date | null;
  lastError: string | null;
};

function generateSubdomain(): string {
  return `${SUBDOMAIN_PREFIX}${randomBytes(5).toString("hex")}`;
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

  if (device.tunnelEnabled && device.tunnelHostname && device.tunnelToken) {
    return {
      token: device.tunnelToken,
      status: {
        enabled: true,
        hostname: device.tunnelHostname,
        subdomain: device.tunnelSubdomain,
        provisionedAt: device.tunnelProvisionedAt,
        lastError: null,
      },
    };
  }

  const domain = tunnelDomain();
  const subdomain = device.tunnelSubdomain ?? (await allocateSubdomain(db));
  const hostname = `${subdomain}.${domain}`;
  const localService = input.localService?.trim() || DEFAULT_LOCAL_SERVICE;

  let tunnelId = device.tunnelId;
  let tunnelToken = device.tunnelToken;
  let dnsRecordId = device.tunnelDnsRecordId;

  try {
    if (!tunnelId || !tunnelToken) {
      const created = await createNamedTunnel(`fa-${device.id}`);
      tunnelId = created.id;
      tunnelToken = created.token;
    }

    await setTunnelIngress(tunnelId, hostname, localService);

    if (!dnsRecordId) {
      const record = await createTunnelDnsRecord(subdomain, tunnelId);
      dnsRecordId = record.id;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tunnel provisioning failed.";
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
      tunnelHostname: hostname,
      tunnelSubdomain: subdomain,
      tunnelDnsRecordId: dnsRecordId,
      tunnelToken,
      tunnelProvisionedAt: new Date(),
      tunnelLastError: null,
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
    },
  };
}

export async function revokeTunnelForDevice(
  db: DbClient,
  input: { ownerToken: string; deviceId: string },
): Promise<TunnelStatus> {
  const device = await findOwnedDevice(db, input);

  const errors: string[] = [];

  if (device.tunnelDnsRecordId) {
    try {
      await deleteDnsRecord(device.tunnelDnsRecordId);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "DNS delete failed.");
    }
  }

  if (device.tunnelId) {
    try {
      await deleteTunnel(device.tunnelId);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Tunnel delete failed.");
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
    },
  });

  return {
    enabled: updated.tunnelEnabled,
    hostname: updated.tunnelHostname,
    subdomain: updated.tunnelSubdomain,
    provisionedAt: updated.tunnelProvisionedAt,
    lastError: updated.tunnelLastError,
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

async function allocateSubdomain(db: DbClient): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = generateSubdomain();
    const existing = await db.relayDevice.findUnique({
      where: { tunnelSubdomain: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error("Unable to allocate a unique tunnel subdomain.");
}
