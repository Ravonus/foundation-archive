import "dotenv/config";

import { processQueuedJobs } from "~/server/archive/jobs";
import { db } from "~/server/db";

async function main() {
  const limit = Number(process.argv[2] ?? "25");
  const result = await processQueuedJobs(db, Number.isFinite(limit) ? limit : 25);
  console.log(JSON.stringify(result, null, 2));
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
