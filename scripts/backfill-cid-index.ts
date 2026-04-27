import "dotenv/config";

import {
  indexDependencyManifestCids,
  indexKuboDagCids,
} from "~/server/archive/cid-index";
import { readDependencyManifest } from "~/server/archive/dependencies";
import { db } from "~/server/db";

const ROOT_SOURCE_TYPE = "root";
const DEFAULT_BATCH_SIZE = 1_000;

function numberArg(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanRelativePath(relativePath: string | null | undefined) {
  return relativePath?.replace(/^\/+|\/+$/g, "") ?? "";
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const batchSize = numberArg("batch", DEFAULT_BATCH_SIZE);
  const limit = numberArg("limit", Number.POSITIVE_INFINITY);
  const includeDag = hasFlag("dag");
  let cursor = "";
  let processed = 0;
  let rootRows = 0;
  let manifestRows = 0;
  let dagRows = 0;

  while (processed < limit) {
    const take = Math.min(batchSize, limit - processed);
    const artworks = await db.artwork.findMany({
      where: {
        id: cursor ? { gt: cursor } : undefined,
        OR: [{ metadataRootId: { not: null } }, { mediaRootId: { not: null } }],
      },
      orderBy: { id: "asc" },
      take,
      select: {
        id: true,
        metadataRoot: {
          select: {
            id: true,
            cid: true,
            kind: true,
            relativePath: true,
          },
        },
        mediaRoot: {
          select: {
            id: true,
            cid: true,
            kind: true,
            relativePath: true,
          },
        },
      },
    });

    if (artworks.length === 0) break;

    cursor = artworks[artworks.length - 1]?.id ?? cursor;
    processed += artworks.length;

    const rows = artworks.flatMap((artwork) =>
      [artwork.metadataRoot, artwork.mediaRoot]
        .filter((root): root is NonNullable<typeof root> => Boolean(root))
        .map((root) => ({
          cid: root.cid,
          relativePath: cleanRelativePath(root.relativePath),
          rootId: root.id,
          artworkId: artwork.id,
          rootKind: root.kind,
          sourceType: ROOT_SOURCE_TYPE,
          discoveredFrom: ROOT_SOURCE_TYPE,
          depth: 0,
        })),
    );

    if (rows.length > 0) {
      const created = await db.ipfsCidIndex.createMany({
        data: rows,
        skipDuplicates: true,
      });
      rootRows += created.count;
    }

    for (const artwork of artworks) {
      for (const root of [artwork.metadataRoot, artwork.mediaRoot]) {
        if (!root) continue;
        const manifest = await readDependencyManifest(
          root.cid,
          root.relativePath,
        );
        if (manifest) {
          const indexed = await indexDependencyManifestCids({
            client: db,
            artworkId: artwork.id,
            rootId: root.id,
            rootKind: root.kind,
            manifest,
          });
          manifestRows += indexed.indexed;
        }

        if (includeDag) {
          const dagIndexed = await indexKuboDagCids({
            client: db,
            artworkId: artwork.id,
            rootId: root.id,
            rootKind: root.kind,
            rootCid: root.cid,
          }).catch((error) => {
            console.warn(
              `[cid-index] DAG indexing skipped for ${root.cid}: ${error instanceof Error ? error.message : String(error)}`,
            );
            return { indexed: 0 };
          });
          dagRows += dagIndexed.indexed;
        }
      }
    }

    console.log(
      `[cid-index] processed=${processed} rootRows=${rootRows} manifestRows=${manifestRows} dagRows=${dagRows} cursor=${cursor}`,
    );
  }

  console.log(
    `[cid-index] Done. processed=${processed} rootRows=${rootRows} manifestRows=${manifestRows} dagRows=${dagRows}`,
  );
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
