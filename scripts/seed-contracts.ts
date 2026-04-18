import "dotenv/config";

import { seedKnownContracts } from "~/server/archive/jobs";
import { db } from "~/server/db";

async function main() {
  const seeded = await seedKnownContracts(db);
  console.log(
    JSON.stringify(
      {
        seeded: seeded.length,
        addresses: seeded.map((contract) => contract.address),
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
