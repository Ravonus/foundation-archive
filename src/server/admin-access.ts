const LAN_PREFIX = "192.168.1.";

function firstHeaderValue(
  headers: Pick<Headers, "get">,
  name: string,
): string | null {
  const value = headers.get(name)?.trim();
  return value ?? null;
}

function parseForwardedHeader(forwarded: string | null): string | null {
  if (!forwarded) return null;

  for (const segment of forwarded.split(",")) {
    const match = /for=(?:"?\[?)([^\];",]+)(?:\]?"?)/i.exec(segment);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function normalizeIp(candidate: string | null): string | null {
  if (!candidate) return null;

  const first = candidate.split(",")[0]?.trim();
  if (!first) return null;

  const unwrapped = first.startsWith("[") && first.endsWith("]")
    ? first.slice(1, -1)
    : first;
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

export function getRequestIp(headers: Pick<Headers, "get">): string | null {
  const direct =
    firstHeaderValue(headers, "x-forwarded-for") ??
    firstHeaderValue(headers, "x-real-ip") ??
    parseForwardedHeader(firstHeaderValue(headers, "forwarded"));

  return normalizeIp(direct);
}

export function isAllowedAdminRequest(headers: Pick<Headers, "get">) {
  const ip = getRequestIp(headers);

  if (!ip) {
    return false;
  }

  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith(LAN_PREFIX)
  );
}
