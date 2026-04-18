import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "~/server/db";
import { createRelayPairing } from "~/server/relay/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  ownerToken: z.string().min(16),
  label: z.string().max(120).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const pairing = await createRelayPairing(db, input);

    return NextResponse.json({
      id: pairing.id,
      pairingCode: pairing.pairingCode,
      expiresAt: pairing.expiresAt,
      label: pairing.label,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create pairing code.",
      },
      { status: 400 },
    );
  }
}
