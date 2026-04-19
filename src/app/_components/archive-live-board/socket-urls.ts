function isLoopback(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function rewriteConfiguredSocketUrl(configured: URL) {
  const configuredLoopback = isLoopback(configured.hostname);
  const currentLoopback = isLoopback(window.location.hostname);

  if (configuredLoopback && !currentLoopback) {
    const port = configured.port ? configured.port : "43129";
    return `${window.location.protocol}//${window.location.hostname}:${port}`;
  }

  return configured.toString();
}

export function resolveSocketUrl() {
  const envUrl = process.env.NEXT_PUBLIC_ARCHIVE_SOCKET_URL;

  if (typeof window !== "undefined" && envUrl) {
    try {
      return rewriteConfiguredSocketUrl(new URL(envUrl));
    } catch {
      return envUrl;
    }
  }

  if (typeof window === "undefined") {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    return siteUrl?.length ? siteUrl : "https://foundation.agorix.io";
  }

  if (isLoopback(window.location.hostname)) {
    return `${window.location.protocol}//${window.location.hostname}:43129`;
  }

  return window.location.origin;
}

export function resolveSocketHealthUrl() {
  try {
    const url = new URL(resolveSocketUrl());
    url.pathname = "/health";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
