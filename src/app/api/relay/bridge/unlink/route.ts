import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "~/env";
import { db } from "~/server/db";
import { disconnectRelayDeviceByToken } from "~/server/relay/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  deviceToken: z.string().min(16),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const device = await disconnectRelayDeviceByToken(db, input);

    const socketDisconnectUrl = `${env.ARCHIVE_SOCKET_INTERNAL_URL}/relay/internal/disconnect`;
    void fetch(socketDisconnectUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        deviceId: device.id,
        reason: "Disconnected from the desktop helper.",
      }),
    }).catch(() => null);

    return NextResponse.json({
      disconnected: true,
      deviceId: device.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to unlink the desktop device from the archive.",
      },
      { status: 400 },
    );
  }
}
