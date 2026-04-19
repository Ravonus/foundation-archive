import { proxyUmamiScript } from "~/server/analytics/umami-proxy";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return proxyUmamiScript(request);
}
