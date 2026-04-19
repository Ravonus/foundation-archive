import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "~/env";
import { db } from "~/server/db";
import { enqueueRelayJob } from "~/server/relay/service";
import { RelayJobKind } from "~/server/prisma-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const configSchema = z.object({
  download_root_dir: z.string().min(1).optional().nullable(),
  sync_enabled: z.boolean().optional().nullable(),
  local_gateway_base_url: z.string().min(1).optional().nullable(),
  public_gateway_base_url: z.string().min(1).optional().nullable(),
  relay_enabled: z.boolean().optional().nullable(),
  relay_server_url: z.string().min(1).optional().nullable(),
  relay_device_name: z.string().min(1).optional().nullable(),
  tunnel_enabled: z.boolean().optional().nullable(),
});

const schema = z.discriminatedUnion("kind", [
  z.object({
    ownerToken: z.string().min(16),
    deviceId: z.string().min(1),
    kind: z.literal("UPDATE_CONFIG"),
    payload: configSchema,
  }),
  z.object({
    ownerToken: z.string().min(16),
    deviceId: z.string().min(1),
    kind: z.literal("REPAIR_PINS"),
    payload: z.object({}),
  }),
  z.object({
    ownerToken: z.string().min(16),
    deviceId: z.string().min(1),
    kind: z.literal("SYNC_PINS"),
    payload: z.object({}),
  }),
]);

const relayJobKindMap = {
  UPDATE_CONFIG: RelayJobKind.UPDATE_CONFIG,
  REPAIR_PINS: RelayJobKind.REPAIR_PINS,
  SYNC_PINS: RelayJobKind.SYNC_PINS,
} as const;

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const job = await enqueueRelayJob(db, {
      ownerToken: input.ownerToken,
      deviceId: input.deviceId,
      kind: relayJobKindMap[input.kind],
      payload: input.payload,
    });

    const socketDispatchUrl = `${env.ARCHIVE_SOCKET_INTERNAL_URL}/relay/internal/dispatch`;
    void fetch(socketDispatchUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        deviceId: input.deviceId,
      }),
    }).catch(() => null);

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to queue relay device action.",
      },
      { status: 400 },
    );
  }
}
