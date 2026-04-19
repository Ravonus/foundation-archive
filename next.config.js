/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @param {string | number | null | undefined} value */
function parsePort(value) {
  if (value == null) return null;
  const port = Number.parseInt(String(value), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

/** @param {string[]} argv */
function readPortFromArgv(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === "-p" || arg === "--port") {
      return parsePort(argv[index + 1]);
    }

    if (arg.startsWith("--port=")) {
      return parsePort(arg.slice("--port=".length));
    }

    if (arg.startsWith("-p") && arg.length > 2) {
      return parsePort(arg.slice(2));
    }
  }

  return null;
}

/** @returns {string} */
function resolveDistDir() {
  if (process.env.NEXT_DIST_DIR) {
    return process.env.NEXT_DIST_DIR;
  }

  if (process.env.NODE_ENV === "production") {
    return ".next-prod";
  }

  const port = parsePort(process.env.PORT) ?? readPortFromArgv(process.argv);

  return port ? `.next-dev-${port}` : ".next-dev";
}

/** @param {string | undefined} value */
function trimTrailingSlash(value) {
  return value ? value.replace(/\/+$/, "") : "";
}

/** @returns {string} */
function resolveArchiveSocketInternalUrl() {
  return trimTrailingSlash(
    process.env.ARCHIVE_SOCKET_INTERNAL_URL ?? "http://127.0.0.1:43129",
  );
}

/** @type {import("next").NextConfig} */
const config = {
  // Keep production builds separate, and give each dev server its own cache
  // so multiple local app instances can run without clobbering one another.
  distDir: resolveDistDir(),
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  async rewrites() {
    const archiveSocketInternalUrl = resolveArchiveSocketInternalUrl();

    return [
      {
        source: "/socket.io",
        destination: `${archiveSocketInternalUrl}/socket.io/`,
      },
      {
        source: "/socket.io/:path*",
        destination: `${archiveSocketInternalUrl}/socket.io/:path*`,
      },
    ];
  },
};

export default config;
