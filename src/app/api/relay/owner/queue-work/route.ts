import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "~/env";
import { db } from "~/server/db";
import { enqueueRelayShareWork } from "~/server/relay/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .nullable()
  .optional();

const schema = z.object({
  ownerToken: z.string().min(16),
  deviceId: z.string().min(1),
  work: z.object({
    title: z.string().min(1),
    contractAddress: z.string().min(1),
    tokenId: z.string().min(1),
    foundationUrl: z.string().url().nullable().optional(),
    artistUsername: z.string().nullable().optional(),
    metadataCid: z.string().nullable().optional(),
    mediaCid: z.string().nullable().optional(),
    metadataUrl: contentReferenceSchema,
    sourceUrl: contentReferenceSchema,
    mediaUrl: contentReferenceSchema,
  }),
});

function normalizeContentReference(
  value: string | null | undefined,
  request: Request,
) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return new URL(trimmed, request.url).toString();
  return trimmed;
}

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const job = await enqueueRelayShareWork(db, {
      ownerToken: input.ownerToken,
      deviceId: input.deviceId,
      work: {
        title: input.work.title,
        contractAddress: input.work.contractAddress,
        tokenId: input.work.tokenId,
        foundationUrl: input.work.foundationUrl ?? null,
        artistUsername: input.work.artistUsername ?? null,
        metadataCid: input.work.metadataCid ?? null,
        mediaCid: input.work.mediaCid ?? null,
        metadataUrl: normalizeContentReference(input.work.metadataUrl, request),
        sourceUrl: normalizeContentReference(input.work.sourceUrl, request),
        mediaUrl: normalizeContentReference(input.work.mediaUrl, request),
      },
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
          error instanceof Error ? error.message : "Unable to queue relay job.",
      },
      { status: 400 },
    );
  }
}
