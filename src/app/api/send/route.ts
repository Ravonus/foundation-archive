import { proxyUmamiCollect } from "~/server/analytics/umami-proxy";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-origin": "*",
    },
  });
}

export function POST(request: Request) {
  return proxyUmamiCollect(request);
}
