import "server-only";

const proxyRequestHeaders = [
  "accept",
  "accept-language",
  "cache-control",
  "content-type",
  "if-modified-since",
  "if-none-match",
  "origin",
  "referer",
  "user-agent",
  "x-client-ip",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "cf-connecting-ip",
] as const;

const proxyResponseHeaders = [
  "access-control-allow-origin",
  "access-control-allow-methods",
  "access-control-allow-headers",
  "cache-control",
  "content-length",
  "content-type",
  "etag",
  "last-modified",
] as const;

function normalizedUmamiServerUrl() {
  const configuredUrl = process.env.UMAMI_SERVER_URL?.trim();
  if (!configuredUrl) return null;
  return configuredUrl.endsWith("/")
    ? configuredUrl.slice(0, -1)
    : configuredUrl;
}

function buildTargetUrl(pathname: string) {
  const baseUrl = normalizedUmamiServerUrl();
  return baseUrl ? `${baseUrl}${pathname}` : null;
}

function copyHeaders(
  source: Headers,
  allowedHeaders: readonly string[],
): Headers {
  const headers = new Headers();

  for (const name of allowedHeaders) {
    const value = source.get(name);
    if (!value) continue;
    headers.set(name, value);
  }

  return headers;
}

function missingConfigResponse() {
  return new Response("UMAMI_SERVER_URL is not configured.", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function proxyUmamiScript(request: Request) {
  const targetUrl = buildTargetUrl("/script.js");
  if (!targetUrl) return missingConfigResponse();

  const response = await fetch(targetUrl, {
    headers: copyHeaders(new Headers(request.headers), proxyRequestHeaders),
    cache: "no-store",
  });

  return new Response(response.body, {
    status: response.status,
    headers: copyHeaders(response.headers, proxyResponseHeaders),
  });
}

export async function proxyUmamiCollect(request: Request) {
  const targetUrl = buildTargetUrl("/api/send");
  if (!targetUrl) return missingConfigResponse();

  const requestBody = await request.arrayBuffer();
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: copyHeaders(new Headers(request.headers), proxyRequestHeaders),
    body: requestBody.byteLength > 0 ? requestBody : undefined,
    cache: "no-store",
  });

  return new Response(response.body, {
    status: response.status,
    headers: copyHeaders(response.headers, proxyResponseHeaders),
  });
}
