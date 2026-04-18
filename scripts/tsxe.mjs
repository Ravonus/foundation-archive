import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

function usage() {
  console.error(
    "Usage: pnpm tsxe -- \"<module code>\" or pnpm tsxe -- -e \"<module code>\"",
  );
}

const args = process.argv.slice(2);
const normalizedArgs = args[0] === "--" ? args.slice(1) : args;

let code = "";

if (normalizedArgs[0] === "-e" || normalizedArgs[0] === "--eval") {
  code = normalizedArgs[1] ?? "";
} else if (normalizedArgs.length > 0) {
  code = normalizedArgs.join(" ");
}

if (!code.trim()) {
  usage();
  process.exit(1);
}

const tempFile = path.join(
  process.cwd(),
  `.foundation-archive-tsxe-${process.pid}-${Date.now()}.mjs`,
);

try {
  await writeFile(tempFile, code, "utf8");
  await import(pathToFileURL(tempFile).href);
} finally {
  await rm(tempFile, { force: true });
}
