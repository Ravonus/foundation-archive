import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { createServer } from "node:net";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { normalizeNextGeneratedFiles } from "./normalize-next-generated-files.mjs";

const DEFAULT_PORT = 3000;
const MAX_PORT = 65535;
const SIGNAL_EXIT_CODES = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGTERM: 143,
};

function parsePort(value) {
  if (value == null) return null;
  const port = Number.parseInt(String(value), 10);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function stripPortArgs(argv) {
  const forwarded = [];
  let requestedPort = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "-p" || arg === "--port") {
      requestedPort = parsePort(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--port=")) {
      requestedPort = parsePort(arg.slice("--port=".length));
      continue;
    }

    if (arg.startsWith("-p") && arg.length > 2) {
      requestedPort = parsePort(arg.slice(2));
      continue;
    }

    forwarded.push(arg);
  }

  return { forwarded, requestedPort };
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port);
  });
}

async function findOpenPort(startPort) {
  for (let port = startPort; port <= MAX_PORT; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`Unable to find an open port starting at ${startPort}.`);
}

async function main() {
  const argv = process.argv.slice(2);
  const { forwarded, requestedPort } = stripPortArgs(argv);
  const explicitPort = requestedPort ?? parsePort(process.env.PORT);
  const port = explicitPort ?? (await findOpenPort(DEFAULT_PORT));

  if (explicitPort != null && !(await isPortAvailable(port))) {
    throw new Error(
      `Port ${port} is already in use. Stop the other dev server or choose a different port.`,
    );
  }

  const distDir = process.env.NEXT_DIST_DIR ?? `.next-dev-${port}`;

  rmSync(distDir, { recursive: true, force: true });

  const nextArgs = ["dev", ...forwarded];

  if (explicitPort == null) {
    nextArgs.push("--port", String(port));
  } else if (requestedPort != null) {
    nextArgs.push("--port", String(requestedPort));
  }

  const nextBin = fileURLToPath(
    new URL("../node_modules/next/dist/bin/next", import.meta.url),
  );

  const child = spawn(process.execPath, [nextBin, ...nextArgs], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_DIST_DIR: distDir,
      PORT: String(port),
    },
    stdio: "inherit",
  });

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      if (!child.killed) {
        child.kill(signal);
      }
    });
  }

  child.on("exit", (code, signal) => {
    normalizeNextGeneratedFiles();

    if (signal) {
      process.exit(SIGNAL_EXIT_CODES[signal] ?? 1);
    }

    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
