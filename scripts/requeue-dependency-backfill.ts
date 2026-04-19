import "dotenv/config";

import { queueArtworkBackup } from "~/server/archive/jobs";
import { db } from "~/server/db";
import { BackupStatus } from "~/server/prisma-client";

function readNumericFlag(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = Number(process.argv[index + 1] ?? "");
  return Number.isFinite(value) ? value : null;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function loadCandidateBatch(args: {
  cursor: string | null;
  take: number;
  remaining: number | null;
}) {
  const take = args.remaining === null ? args.take : Math.min(args.take, args.remaining);

  return db.artwork.findMany({
    where: {
      OR: [
        {
          metadataRootId: { not: null },
          metadataStatus: {
            in: [BackupStatus.DOWNLOADED, BackupStatus.PINNED],
          },
        },
        {
          mediaRootId: { not: null },
          mediaStatus: {
            in: [BackupStatus.DOWNLOADED, BackupStatus.PINNED],
          },
        },
      ],
      ...(args.cursor ? { id: { gt: args.cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take,
    select: {
      id: true,
    },
  });
}

async function main() {
  const batchSize = readNumericFlag("--batch-size") ?? 200;
  const limit = readNumericFlag("--limit");
  const dryRun = hasFlag("--dry-run");

  let cursor: string | null = null;
  let attempted = 0;
  let queued = 0;

  for (;;) {
    const batch = await loadCandidateBatch({
      cursor,
      take: batchSize,
      remaining: limit === null ? null : limit - attempted,
    });

    if (batch.length === 0) {
      break;
    }

    cursor = batch[batch.length - 1]?.id ?? null;

    if (dryRun) {
      attempted += batch.length;
      if (limit !== null && attempted >= limit) {
        break;
      }
      continue;
    }

    const jobs = await Promise.all(
      batch.map((artwork) =>
        queueArtworkBackup({
          client: db,
          artworkId: artwork.id,
        }),
      ),
    );

    attempted += batch.length;
    queued += jobs.length;

    if (limit !== null && attempted >= limit) {
      break;
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        attempted,
        queued,
        batchSize,
        limit,
      },
      null,
      2,
    ),
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
