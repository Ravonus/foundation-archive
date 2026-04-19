import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "~/server/db";
import { getTunnelStatusForOwner } from "~/server/relay/tunnel-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  ownerToken: z.string().min(16),
  deviceId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const status = await getTunnelStatusForOwner(db, input);
    return NextResponse.json({ status });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to read tunnel status.",
      },
      { status: 400 },
    );
  }
}
