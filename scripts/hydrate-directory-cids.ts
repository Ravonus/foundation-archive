import "dotenv/config";

import { formatBytes } from "~/lib/utils";
import { hydrateCidDirectory } from "~/server/archive/storage";
import { db } from "~/server/db";
import { BackupStatus } from "~/server/prisma-client";

async function main() {
  const argLimit = Number(process.argv[2]);
  const limit = Number.isFinite(argLimit) && argLimit > 0 ? argLimit : 100;

  const roots = await db.ipfsRoot.findMany({
    where: {
      relativePath: { not: null },
      backupStatus: BackupStatus.DOWNLOADED,
    },
    select: { cid: true, relativePath: true },
    orderBy: { lastDownloadedAt: "desc" },
    take: limit,
  });

  console.log(
    `[hydrate] Considering ${roots.length} directory-style root(s) (limit ${limit}).`,
  );

  let walked = 0;
  let downloadedFiles = 0;
  let totalBytes = 0;
  let truncated = 0;

  const seenCids = new Set<string>();

  for (const root of roots) {
    if (seenCids.has(root.cid)) continue;
    seenCids.add(root.cid);

    const result = await hydrateCidDirectory({
      cid: root.cid,
      skipPath: root.relativePath,
    });

    walked += 1;
    downloadedFiles += result.downloaded;
    totalBytes += result.totalBytes;
    if (result.truncatedByBudget) truncated += 1;

    if (
      result.downloaded > 0 ||
      result.truncatedByBudget ||
      result.attempted > 0
    ) {
      console.log(
        `[hydrate] ${root.cid}: downloaded=${result.downloaded} skipped=${result.skipped} bytes=${formatBytes(result.totalBytes)}${result.truncatedByBudget ? " (truncated)" : ""}`,
      );
    }
  }

  console.log(
    `[hydrate] Done. walked=${walked} downloadedFiles=${downloadedFiles} bytes=${formatBytes(totalBytes)} truncated=${truncated}`,
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
