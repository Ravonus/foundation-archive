import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "~/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  ownerToken: z.string().min(16),
  cids: z.array(z.string().min(1)).max(500),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const uniqueCids = Array.from(new Set(input.cids.map((cid) => cid.trim()).filter(Boolean)));

    const roots = await db.ipfsRoot.findMany({
      where: {
        cid: {
          in: uniqueCids,
        },
      },
      select: {
        cid: true,
        metadataFor: {
          take: 4,
          select: {
            id: true,
            slug: true,
            title: true,
            artistName: true,
            artistUsername: true,
            foundationUrl: true,
            contractAddress: true,
            tokenId: true,
            staticPreviewUrl: true,
            previewUrl: true,
          },
        },
        mediaFor: {
          take: 4,
          select: {
            id: true,
            slug: true,
            title: true,
            artistName: true,
            artistUsername: true,
            foundationUrl: true,
            contractAddress: true,
            tokenId: true,
            staticPreviewUrl: true,
            previewUrl: true,
          },
        },
      },
    });

    const enrichments = roots.map((root) => ({
      cid: root.cid,
      matches: [
        ...root.metadataFor.map((artwork) => ({
          role: "METADATA" as const,
          id: artwork.id,
          slug: artwork.slug,
          title: artwork.title,
          artistName: artwork.artistName,
          artistUsername: artwork.artistUsername,
          foundationUrl: artwork.foundationUrl,
          contractAddress: artwork.contractAddress,
          tokenId: artwork.tokenId,
          posterUrl: artwork.staticPreviewUrl ?? artwork.previewUrl,
        })),
        ...root.mediaFor.map((artwork) => ({
          role: "MEDIA" as const,
          id: artwork.id,
          slug: artwork.slug,
          title: artwork.title,
          artistName: artwork.artistName,
          artistUsername: artwork.artistUsername,
          foundationUrl: artwork.foundationUrl,
          contractAddress: artwork.contractAddress,
          tokenId: artwork.tokenId,
          posterUrl: artwork.staticPreviewUrl ?? artwork.previewUrl,
        })),
      ],
    }));

    return NextResponse.json({
      enrichments,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Foundation pin enrichment.",
      },
      { status: 400 },
    );
  }
}
