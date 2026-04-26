import { readFile, stat } from "node:fs/promises";

import { NextResponse, type NextRequest } from "next/server";

import { db } from "~/server/db";
import { BackupStatus } from "~/server/prisma-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ assetId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { assetId } = await context.params;
  const asset = await db.foundationProfileAsset.findUnique({
    where: { id: assetId },
    select: {
      localPath: true,
      mimeType: true,
      byteSize: true,
      status: true,
      updatedAt: true,
    },
  });

  if (!asset?.localPath || asset.status !== BackupStatus.DOWNLOADED) {
    return NextResponse.json(
      { error: "Profile asset not found" },
      { status: 404 },
    );
  }

  try {
    const [fileStats, buffer] = await Promise.all([
      stat(asset.localPath),
      readFile(asset.localPath),
    ]);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "content-type": asset.mimeType ?? "application/octet-stream",
        "content-length": String(asset.byteSize ?? fileStats.size),
        "last-modified": asset.updatedAt.toUTCString(),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Profile asset missing" },
      { status: 404 },
    );
  }
}
