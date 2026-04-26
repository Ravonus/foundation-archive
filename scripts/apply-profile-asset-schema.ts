import "dotenv/config";

import { db } from "~/server/db";

const STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS "FoundationProfile" (
      "id" TEXT NOT NULL,
      "accountAddress" TEXT NOT NULL,
      "username" TEXT,
      "name" TEXT,
      "bio" TEXT,
      "foundationUrl" TEXT,
      "profileImageUrl" TEXT,
      "coverImageUrl" TEXT,
      "lastFetchedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "FoundationProfile_pkey" PRIMARY KEY ("id")
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS "FoundationProfileAsset" (
      "id" TEXT NOT NULL,
      "profileId" TEXT NOT NULL,
      "kind" TEXT NOT NULL,
      "sourceUrl" TEXT NOT NULL,
      "localPath" TEXT,
      "mimeType" TEXT,
      "byteSize" INTEGER,
      "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
      "lastDownloadedAt" TIMESTAMP(3),
      "lastError" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "FoundationProfileAsset_pkey" PRIMARY KEY ("id")
    )
  `,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FoundationProfile_accountAddress_key" ON "FoundationProfile"("accountAddress")`,
  `CREATE INDEX IF NOT EXISTS "FoundationProfile_username_idx" ON "FoundationProfile"("username")`,
  `CREATE INDEX IF NOT EXISTS "FoundationProfile_updatedAt_idx" ON "FoundationProfile"("updatedAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FoundationProfileAsset_profileId_kind_sourceUrl_key" ON "FoundationProfileAsset"("profileId", "kind", "sourceUrl")`,
  `CREATE INDEX IF NOT EXISTS "FoundationProfileAsset_kind_idx" ON "FoundationProfileAsset"("kind")`,
  `CREATE INDEX IF NOT EXISTS "FoundationProfileAsset_status_idx" ON "FoundationProfileAsset"("status")`,
  `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'FoundationProfileAsset_profileId_fkey'
      ) THEN
        ALTER TABLE "FoundationProfileAsset"
        ADD CONSTRAINT "FoundationProfileAsset_profileId_fkey"
        FOREIGN KEY ("profileId")
        REFERENCES "FoundationProfile"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE;
      END IF;
    END $$;
  `,
];

async function main() {
  for (const statement of STATEMENTS) {
    await db.$executeRawUnsafe(statement);
  }
  console.log("Foundation profile asset tables are ready.");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
