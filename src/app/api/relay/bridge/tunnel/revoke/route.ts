import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "~/server/db";
import { getRelayDeviceByToken } from "~/server/relay/service";
import { revokeTunnelForDevice } from "~/server/relay/tunnel-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  deviceToken: z.string().min(16),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const device = await getRelayDeviceByToken(db, input.deviceToken);
    if (!device) {
      throw new Error("Desktop device token was not recognized.");
    }

    const status = await revokeTunnelForDevice(db, {
      ownerToken: device.ownerToken,
      deviceId: device.id,
    });

    return NextResponse.json({
      hostname: status.hostname,
      enabled: status.enabled,
      lastError: status.lastError,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to revoke tunnel.",
      },
      { status: 400 },
    );
  }
}
