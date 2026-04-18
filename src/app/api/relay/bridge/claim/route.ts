import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "~/server/db";
import { claimRelayPairing } from "~/server/relay/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  pairingCode: z.string().min(4).max(32),
  deviceLabel: z.string().min(1).max(120),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const claimed = await claimRelayPairing(db, input);

    return NextResponse.json(claimed);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to claim pairing code.",
      },
      { status: 400 },
    );
  }
}
