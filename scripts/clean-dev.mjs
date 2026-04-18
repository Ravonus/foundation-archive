import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { normalizeNextGeneratedFiles } from "./normalize-next-generated-files.mjs";

const entries = readdirSync(process.cwd(), { withFileTypes: true });

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  if (entry.name !== ".next-dev" && !entry.name.startsWith(".next-dev-")) {
    continue;
  }

  rmSync(join(process.cwd(), entry.name), { recursive: true, force: true });
}

normalizeNextGeneratedFiles();
