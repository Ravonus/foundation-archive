import { env } from "~/env";
import { runWorkerCycle } from "~/server/archive/worker";
import { db } from "~/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const incomingSecret =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (env.INTERNAL_CRON_SECRET && incomingSecret !== env.INTERNAL_CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    limit?: number;
  };

  const result = await runWorkerCycle(db, {
    workerKey: "internal-route-worker",
    label: "Internal route worker",
    limit: body.limit ?? 25,
    mode: "http",
  });

  return Response.json(result);
}
