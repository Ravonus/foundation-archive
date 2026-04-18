import { env } from "~/env";

const LAN_PREFIX = "192.168.1.";

function firstHeaderValue(
  headers: Pick<Headers, "get">,
  name: string,
): string | null {
  const value = headers.get(name)?.trim();
  return value ?? null;
}

function splitHeaderValues(value: string | null): string[] {
  if (!value) return [];

  return value
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseForwardedHeader(forwarded: string | null): string[] {
  if (!forwarded) return [];

  const matches = [
    ...forwarded.matchAll(/for=(?:"?\[?)([^\];",]+)(?:\]?"?)/gi),
  ];

  return matches
    .map((match) => match[1]?.trim() ?? null)
    .filter((value): value is string => Boolean(value));
}

function normalizeIp(candidate: string | null): string | null {
  if (!candidate) return null;

  const unwrapped =
    candidate.startsWith("[") && candidate.endsWith("]")
      ? candidate.slice(1, -1)
      : candidate;
  const withoutMappedPrefix = unwrapped.startsWith("::ffff:")
    ? unwrapped.slice(7)
    : unwrapped;

  if (
    withoutMappedPrefix.includes(":") &&
    withoutMappedPrefix.indexOf(":") === withoutMappedPrefix.lastIndexOf(":") &&
    withoutMappedPrefix.includes(".")
  ) {
    return withoutMappedPrefix.split(":")[0] ?? null;
  }

  return withoutMappedPrefix;
}

function normalizeHost(candidate: string | null): string | null {
  if (!candidate) return null;

  const trimmed = candidate.trim();
  const host = trimmed.startsWith("[")
    ? trimmed.slice(1, trimmed.indexOf("]"))
    : (trimmed.split(":")[0] ?? null);
  const normalized = host?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

function isAllowedIp(ip: string | null) {
  return Boolean(
    ip && (ip === "127.0.0.1" || ip === "::1" || ip.startsWith(LAN_PREFIX)),
  );
}

function isAllowedHost(host: string | null) {
  const configuredSiteHost = getConfiguredSiteHost();

  return Boolean(
    host &&
    (host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === configuredSiteHost ||
      host.startsWith(LAN_PREFIX)),
  );
}

function getConfiguredSiteHost() {
  try {
    return normalizeHost(new URL(env.NEXT_PUBLIC_SITE_URL).host);
  } catch {
    return null;
  }
}

export function getRequestIps(headers: Pick<Headers, "get">): string[] {
  const candidates = [
    ...splitHeaderValues(firstHeaderValue(headers, "x-forwarded-for")),
    ...splitHeaderValues(firstHeaderValue(headers, "x-real-ip")),
    ...splitHeaderValues(firstHeaderValue(headers, "cf-connecting-ip")),
    ...splitHeaderValues(firstHeaderValue(headers, "x-client-ip")),
    ...parseForwardedHeader(firstHeaderValue(headers, "forwarded")),
  ];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const candidate of candidates) {
    const ip = normalizeIp(candidate);
    if (!ip || seen.has(ip)) continue;
    seen.add(ip);
    normalized.push(ip);
  }

  return normalized;
}

export function getRequestIp(headers: Pick<Headers, "get">): string | null {
  return getRequestIps(headers)[0] ?? null;
}

export function isAllowedAdminRequest(headers: Pick<Headers, "get">) {
  const ips = getRequestIps(headers);
  if (ips.some((ip) => isAllowedIp(ip))) {
    return true;
  }

  const host = normalizeHost(
    firstHeaderValue(headers, "x-forwarded-host") ??
      firstHeaderValue(headers, "host"),
  );

  return isAllowedHost(host);
}
