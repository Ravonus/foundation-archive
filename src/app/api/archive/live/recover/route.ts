import { getArchiveLiveSnapshot } from "~/server/archive/dashboard";
import { maybeRecoverArchivePipeline } from "~/server/archive/watchdog";
import { db } from "~/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await maybeRecoverArchivePipeline(db);
  const snapshot = await getArchiveLiveSnapshot(db);
  return Response.json(snapshot);
}
