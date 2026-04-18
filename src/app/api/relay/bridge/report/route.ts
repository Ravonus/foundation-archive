import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "~/server/db";
import { reportRelayJobResult } from "~/server/relay/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  deviceToken: z.string().min(16),
  jobId: z.string().min(1),
  status: z.enum(["COMPLETED", "FAILED"]),
  resultPayload: z.string().optional().nullable(),
  errorMessage: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const payload = await reportRelayJobResult(db, input);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to report relay job result.",
      },
      { status: 400 },
    );
  }
}
