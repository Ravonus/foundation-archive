import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROUTE_REF_PATTERN =
  /^\/\/\/ <reference path="\.\/\.next(?:-dev(?:-\d+)?|-prod)?\/types\/routes\.d\.ts" \/>\n?/gm;
const PORT_SPECIFIC_TYPE_INCLUDE_PATTERN =
  /^\s*"\.next-dev-\d+\/types\/\*\*\/\*\.ts",?\n/gm;

export function normalizeNextGeneratedFiles(rootDir = process.cwd()) {
  const tsconfigPath = join(rootDir, "tsconfig.json");
  if (existsSync(tsconfigPath)) {
    const tsconfig = readFileSync(tsconfigPath, "utf8");
    const normalizedTsconfig = tsconfig.replace(
      PORT_SPECIFIC_TYPE_INCLUDE_PATTERN,
      "",
    );

    if (normalizedTsconfig !== tsconfig) {
      writeFileSync(tsconfigPath, normalizedTsconfig);
    }
  }

  const nextEnvPath = join(rootDir, "next-env.d.ts");
  if (existsSync(nextEnvPath)) {
    const nextEnv = readFileSync(nextEnvPath, "utf8");
    const normalizedNextEnv = nextEnv.replace(ROUTE_REF_PATTERN, "");

    if (normalizedNextEnv !== nextEnv) {
      writeFileSync(nextEnvPath, normalizedNextEnv);
    }
  }
}
