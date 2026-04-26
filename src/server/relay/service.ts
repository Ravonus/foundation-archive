import {
  Prisma,
  QueueJobStatus,
  RelayJobKind,
  type PrismaClient,
} from "~/server/prisma-client";
import { randomInt, randomUUID } from "crypto";

type DbClient = PrismaClient;

const LIVE_DEVICE_WINDOW_MS = 90_000;

export type RelayShareWorkPayload = {
  title: string;
  contractAddress: string;
  tokenId: string;
  foundationUrl: string | null;
  artistUsername: string | null;
  metadataCid: string | null;
  mediaCid: string | null;
  metadataUrl: string | null;
  sourceUrl: string | null;
  mediaUrl: string | null;
};

export type RelayUpdateConfigPayload = {
  download_root_dir?: string | null;
  sync_enabled?: boolean | null;
  local_gateway_base_url?: string | null;
  public_gateway_base_url?: string | null;
  relay_enabled?: boolean | null;
  relay_server_url?: string | null;
  relay_device_name?: string | null;
  tunnel_enabled?: boolean | null;
};

function createPairingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: 8 },
    () => alphabet[randomInt(0, alphabet.length)],
  ).join("");
}

async function generateUniquePairingCode(db: DbClient) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = createPairingCode();
    const exists = await db.relayPairing.findUnique({
      where: {
        pairingCode: code,
      },
      select: {
        id: true,
      },
    });

    if (!exists) return code;
  }

  throw new Error("Unable to generate a unique pairing code.");
}

export async function createRelayPairing(
  db: DbClient,
  input: {
    ownerToken: string;
    label?: string | null;
  },
) {
  const pairingCode = await generateUniquePairingCode(db);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  return db.relayPairing.create({
    data: {
      ownerToken: input.ownerToken,
      pairingCode,
      label: input.label ?? null,
      expiresAt,
    },
  });
}

export async function listRelayDevices(db: DbClient, ownerToken: string) {
  const now = Date.now();
  const devices = await db.relayDevice.findMany({
    where: {
      ownerToken,
    },
    orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
    include: {
      jobs: {
        orderBy: {
          createdAt: "desc",
        },
        take: 3,
      },
    },
  });

  return devices.map((device) => ({
    id: device.id,
    deviceLabel: device.deviceLabel,
    relayEnabled: device.relayEnabled,
    connected:
      device.relayEnabled &&
      Boolean(
        device.lastSeenAt &&
        now - new Date(device.lastSeenAt).getTime() < LIVE_DEVICE_WINDOW_MS,
      ),
    lastSeenAt: device.lastSeenAt,
    lastError: device.lastError,
    lastCompletedJobAt: device.lastCompletedJobAt,
    createdAt: device.createdAt,
    pendingJobCount: device.jobs.filter((job) => job.status === "PENDING")
      .length,
    recentJobs: device.jobs.map((job) => ({
      id: job.id,
      kind: job.kind,
      status: job.status,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
    })),
  }));
}

export async function getRelayDeviceByToken(db: DbClient, deviceToken: string) {
  return db.relayDevice.findUnique({
    where: {
      deviceSecret: deviceToken,
    },
  });
}

export async function requireRelayDeviceByToken(
  db: DbClient,
  deviceToken: string,
) {
  const device = await getRelayDeviceByToken(db, deviceToken);

  if (!device) {
    throw new Error("Desktop device token was not recognized.");
  }

  if (!device.relayEnabled) {
    throw new Error("Desktop device has been disconnected from this archive.");
  }

  return device;
}

export async function touchRelayDevice(
  db: DbClient,
  input: { deviceId: string; error?: string | null },
) {
  const now = new Date();
  return db.relayDevice.update({
    where: {
      id: input.deviceId,
    },
    data: {
      lastSeenAt: now,
      lastError: input.error ?? null,
    },
  });
}

export async function claimRelayPairing(
  db: DbClient,
  input: {
    pairingCode: string;
    deviceLabel: string;
  },
) {
  try {
    return await db.$transaction(
      async (tx) => {
        const pairing = await tx.relayPairing.findUnique({
          where: {
            pairingCode: input.pairingCode,
          },
        });

        if (!pairing) {
          throw new Error("Pairing code was not found.");
        }

        if (pairing.claimedAt) {
          throw new Error("Pairing code was already used.");
        }

        if (pairing.expiresAt.getTime() < Date.now()) {
          throw new Error("Pairing code has expired.");
        }

        const deviceSecret = randomUUID();
        const createdDevice = await tx.relayDevice.create({
          data: {
            ownerToken: pairing.ownerToken,
            deviceLabel: input.deviceLabel,
            deviceSecret,
            relayEnabled: true,
            lastSeenAt: new Date(),
          },
        });

        const claim = await tx.relayPairing.updateMany({
          where: {
            id: pairing.id,
            claimedAt: null,
          },
          data: {
            claimedAt: new Date(),
            claimedByDeviceId: createdDevice.id,
          },
        });

        if (claim.count !== 1) {
          throw new Error("Pairing code was already used.");
        }

        return {
          deviceId: createdDevice.id,
          deviceLabel: createdDevice.deviceLabel,
          deviceToken: createdDevice.deviceSecret,
          ownerToken: createdDevice.ownerToken,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      throw new Error("Pairing code was already used.");
    }

    throw error;
  }
}

export async function enqueueRelayShareWork(
  db: DbClient,
  input: {
    ownerToken: string;
    deviceId: string;
    work: RelayShareWorkPayload;
  },
) {
  const device = await db.relayDevice.findFirst({
    where: {
      id: input.deviceId,
      ownerToken: input.ownerToken,
    },
  });

  if (!device) {
    throw new Error("Linked desktop device was not found.");
  }

  return enqueueRelayJob(db, {
    ownerToken: input.ownerToken,
    deviceId: input.deviceId,
    kind: RelayJobKind.SHARE_WORK,
    payload: input.work,
  });
}

export async function enqueueRelayJob(
  db: DbClient,
  input: {
    ownerToken: string;
    deviceId: string;
    kind: RelayJobKind;
    payload: unknown;
  },
) {
  const device = await db.relayDevice.findFirst({
    where: {
      id: input.deviceId,
      ownerToken: input.ownerToken,
    },
  });

  if (!device) {
    throw new Error("Linked desktop device was not found.");
  }

  return db.relayJob.create({
    data: {
      ownerToken: input.ownerToken,
      deviceId: input.deviceId,
      kind: input.kind,
      status: QueueJobStatus.PENDING,
      payload: JSON.stringify(input.payload ?? {}),
    },
  });
}

export async function claimRelayJobsForDeviceId(
  db: DbClient,
  input: {
    deviceId: string;
    maxJobs?: number;
  },
) {
  const device = await db.relayDevice.findUnique({
    where: {
      id: input.deviceId,
    },
  });

  if (!device) {
    throw new Error("Desktop device was not found.");
  }

  if (!device.relayEnabled) {
    throw new Error("Desktop device has been disconnected from this archive.");
  }

  const now = new Date();
  const maxJobs = Math.min(Math.max(input.maxJobs ?? 5, 1), 20);

  const jobs = await db.$transaction(async (tx) => {
    await tx.relayDevice.update({
      where: {
        id: device.id,
      },
      data: {
        lastSeenAt: now,
        lastError: null,
      },
    });

    const pendingJobs = await tx.relayJob.findMany({
      where: {
        deviceId: device.id,
        status: QueueJobStatus.PENDING,
        availableAt: {
          lte: now,
        },
      },
      orderBy: [{ createdAt: "asc" }],
      take: maxJobs,
    });

    for (const job of pendingJobs) {
      await tx.relayJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: QueueJobStatus.RUNNING,
          startedAt: now,
        },
      });
    }

    return pendingJobs;
  });

  return {
    device: {
      id: device.id,
      ownerToken: device.ownerToken,
      deviceLabel: device.deviceLabel,
      lastSeenAt: now,
    },
    jobs: jobs.map((job) => ({
      id: job.id,
      kind: job.kind,
      payload: job.payload,
      createdAt: job.createdAt,
    })),
  };
}

export async function pollRelayJobs(
  db: DbClient,
  input: {
    deviceToken: string;
    maxJobs?: number;
  },
) {
  const device = await requireRelayDeviceByToken(db, input.deviceToken);
  const payload = await claimRelayJobsForDeviceId(db, {
    deviceId: device.id,
    maxJobs: input.maxJobs,
  });

  return {
    device: {
      id: payload.device.id,
      deviceLabel: payload.device.deviceLabel,
      lastSeenAt: payload.device.lastSeenAt,
    },
    jobs: payload.jobs,
  };
}

export async function reportRelayJobResult(
  db: DbClient,
  input: {
    deviceToken: string;
    jobId: string;
    status: "COMPLETED" | "FAILED";
    resultPayload?: string | null;
    errorMessage?: string | null;
  },
) {
  const device = await db.relayDevice.findUnique({
    where: {
      deviceSecret: input.deviceToken,
    },
  });

  if (!device) {
    throw new Error("Desktop device token was not recognized.");
  }

  const job = await db.relayJob.findFirst({
    where: {
      id: input.jobId,
      deviceId: device.id,
    },
  });

  if (!job) {
    throw new Error("Relay job was not found for this device.");
  }

  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.relayJob.update({
      where: {
        id: input.jobId,
      },
      data: {
        status:
          input.status === "COMPLETED"
            ? QueueJobStatus.COMPLETED
            : QueueJobStatus.FAILED,
        resultPayload: input.resultPayload ?? null,
        errorMessage: input.errorMessage ?? null,
        finishedAt: now,
      },
    });

    await tx.relayDevice.update({
      where: {
        id: device.id,
      },
      data: {
        lastSeenAt: now,
        lastCompletedJobAt:
          input.status === "COMPLETED" ? now : device.lastCompletedJobAt,
        lastError:
          input.status === "FAILED"
            ? (input.errorMessage ?? "Relay job failed.")
            : null,
      },
    });
  });

  return {
    ok: true,
  };
}

export async function removeRelayDeviceByOwner(
  db: DbClient,
  input: {
    ownerToken: string;
    deviceId: string;
  },
) {
  const device = await db.relayDevice.findFirst({
    where: {
      id: input.deviceId,
      ownerToken: input.ownerToken,
    },
  });

  if (!device) {
    throw new Error("Linked desktop device was not found.");
  }

  await db.$transaction(async (tx) => {
    // Older production rows may predate the current FK actions, so clear
    // dependents explicitly before deleting the device record.
    await tx.relayPairing.updateMany({
      where: {
        claimedByDeviceId: device.id,
      },
      data: {
        claimedByDeviceId: null,
      },
    });

    await tx.relayJob.deleteMany({
      where: {
        deviceId: device.id,
      },
    });

    await tx.relayDevice.delete({
      where: {
        id: device.id,
      },
    });
  });

  return {
    id: device.id,
    ownerToken: device.ownerToken,
  };
}

export async function disconnectRelayDeviceByToken(
  db: DbClient,
  input: {
    deviceToken: string;
  },
) {
  const device = await db.relayDevice.findUnique({
    where: {
      deviceSecret: input.deviceToken,
    },
  });

  if (!device) {
    throw new Error("Desktop device token was not recognized.");
  }

  await db.relayDevice.update({
    where: {
      id: device.id,
    },
    data: {
      relayEnabled: false,
      lastError: null,
    },
  });

  return {
    id: device.id,
    ownerToken: device.ownerToken,
  };
}
