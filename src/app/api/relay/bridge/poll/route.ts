import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "~/server/db";
import { pollRelayJobs } from "~/server/relay/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  deviceToken: z.string().min(16),
  maxJobs: z.number().int().min(1).max(20).optional(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const payload = await pollRelayJobs(db, input);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to poll relay jobs.",
      },
      { status: 400 },
    );
  }
}
