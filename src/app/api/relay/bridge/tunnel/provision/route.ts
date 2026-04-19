import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "~/server/db";
import { requireRelayDeviceByToken } from "~/server/relay/service";
import { provisionTunnelForDevice } from "~/server/relay/tunnel-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  deviceToken: z.string().min(16),
  localService: z.string().url().optional(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const device = await requireRelayDeviceByToken(db, input.deviceToken);
    const result = await provisionTunnelForDevice(db, {
      ownerToken: device.ownerToken,
      deviceId: device.id,
      localService: input.localService,
    });

    return NextResponse.json({
      hostname: result.status.hostname,
      subdomain: result.status.subdomain,
      tunnelToken: result.token,
      provisionedAt: result.status.provisionedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to provision tunnel.",
      },
      { status: 400 },
    );
  }
}
