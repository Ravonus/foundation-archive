function isLoopback(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost";
}

const FOUNDATION_SITE_HOSTNAME = "foundation.agorix.io";
const FOUNDATION_SOCKET_HOSTNAME = "socket-foundation.agorix.io";

function resolveTransportSocketHostname(configuredHostname: string) {
  if (configuredHostname === FOUNDATION_SITE_HOSTNAME) {
    return FOUNDATION_SOCKET_HOSTNAME;
  }

  return configuredHostname;
}

function rewriteConfiguredSocketUrl(configured: URL) {
  const configuredLoopback = isLoopback(configured.hostname);
  const currentLoopback = isLoopback(window.location.hostname);

  if (configuredLoopback && !currentLoopback) {
    const port = configured.port ? configured.port : "43129";
    return `${window.location.protocol}//${window.location.hostname}:${port}`;
  }

  if (!configuredLoopback && !currentLoopback) {
    const transportUrl = new URL(configured.toString());
    transportUrl.hostname = resolveTransportSocketHostname(
      transportUrl.hostname,
    );
    return transportUrl.toString();
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

export function resolveSocketIoTransportOptions(socketUrl: string) {
  try {
    const url = new URL(socketUrl);

    if (url.hostname === FOUNDATION_SOCKET_HOSTNAME) {
      return {
        transports: ["polling"],
        upgrade: false,
        rememberUpgrade: false,
      };
    }
  } catch {
    // Fall back to the websocket-first defaults below.
  }

  return {
    transports: ["websocket"],
    upgrade: false,
    rememberUpgrade: true,
  };
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
