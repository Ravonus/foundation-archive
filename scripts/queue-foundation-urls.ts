import "dotenv/config";

import { enqueueFoundationMintIngest, processQueuedJobs } from "~/server/archive/jobs";
import { db } from "~/server/db";

function parseArgs(args: string[]) {
  const drain = args.includes("--drain");
  const urls = args.filter((value) => !value.startsWith("--"));
  return { drain, urls };
}

async function main() {
  const { drain, urls } = parseArgs(process.argv.slice(2));

  if (urls.length === 0) {
    throw new Error("Pass one or more Foundation mint URLs.");
  }

  for (const url of urls) {
    await enqueueFoundationMintIngest(db, url);
  }

  if (drain) {
    let processed = 0;
    while (true) {
      const result = await processQueuedJobs(db, 25);
      processed += result.processed;
      if (result.processed === 0) break;
    }

    console.log(JSON.stringify({ queued: urls.length, processed }, null, 2));
    return;
  }

  console.log(JSON.stringify({ queued: urls.length }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
