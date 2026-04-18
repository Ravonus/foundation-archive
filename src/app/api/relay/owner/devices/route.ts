import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "~/server/db";
import { listRelayDevices } from "~/server/relay/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  ownerToken: z.string().min(16),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const devices = await listRelayDevices(db, input.ownerToken);
    return NextResponse.json({ devices });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load linked devices.",
      },
      { status: 400 },
    );
  }
}
