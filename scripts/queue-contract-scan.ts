import "dotenv/config";

import { enqueueContractScan, processQueuedJobs } from "~/server/archive/jobs";
import { db } from "~/server/db";

function valueAfterFlag(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const contractAddress = valueAfterFlag(args, "--contract");
  const label = valueAfterFlag(args, "--label");
  const foundationContractType = valueAfterFlag(args, "--type");
  const startTokenId = valueAfterFlag(args, "--start");
  const endTokenId = valueAfterFlag(args, "--end");
  const fromBlock = valueAfterFlag(args, "--from-block");
  const toBlock = valueAfterFlag(args, "--to-block");
  const drain = args.includes("--drain");

  if (!contractAddress) {
    throw new Error("Pass --contract 0x... to queue a contract scan.");
  }

  await enqueueContractScan(db, {
    contractAddress,
    label,
    foundationContractType,
    startTokenId,
    endTokenId,
    fromBlock,
    toBlock,
  });

  if (drain) {
    let processed = 0;
    for (;;) {
      const result = await processQueuedJobs(db, 25);
      processed += result.processed;
      if (result.processed === 0) break;
    }

    console.log(JSON.stringify({ queued: 1, processed }, null, 2));
    return;
  }

  console.log(JSON.stringify({ queued: 1 }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
