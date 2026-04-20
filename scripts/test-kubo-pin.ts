/* eslint-disable @typescript-eslint/no-require-imports */
/// Local-only smoke test for the plain-ipfs-add pin path. Targets the
/// foundation-share-kubo container at 127.0.0.1:5001. Builds synthetic
/// cold-storage trees, feeds them through pinCidWithKubo, and checks:
///   1. The success path produces a matching CID and deletes the tree.
///   2. The partial-directory path returns skipped + keeps the tree.
///   3. The file-exists-elsewhere path works with nested directories.
///
/// Usage: pnpm tsx scripts/test-kubo-pin.ts

process.env.KUBO_API_URL ??= "http://127.0.0.1:5001";
process.env.DATABASE_URL ??= "postgresql://noop@127.0.0.1:5432/noop";
process.env.SKIP_ENV_VALIDATION ??= "1";

import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.ARCHIVE_STORAGE_DIR = await mkdtemp(
  path.join(tmpdir(), "agorix-test-cold-"),
);
process.env.ARCHIVE_HOT_STORAGE_DIR = await mkdtemp(
  path.join(tmpdir(), "agorix-test-hot-"),
);

const storage = await import("~/server/archive/storage");
const { pinCidWithKubo, getCidDirectory } = storage;

function label(name: string) {
  console.log(`\n=== ${name} ===`);
}

function ipfsCli(args: string[]): string {
  return execFileSync(
    "docker",
    ["exec", "foundation-share-kubo", "ipfs", ...args],
    { encoding: "utf8" },
  ).trim();
}

/// Docker-cp's the directory into the running local kubo container
/// and asks kubo to compute the CID without actually storing it. This
/// sidesteps needing a separate `ipfs init` for the expected-CID
/// calculation.
function ipfsAddOnlyHashViaCp(hostDir: string): string {
  const stagingPath = `/tmp/agorix-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  execFileSync("docker", [
    "exec",
    "foundation-share-kubo",
    "mkdir",
    "-p",
    stagingPath,
  ]);
  try {
    execFileSync("docker", [
      "cp",
      `${hostDir}/.`,
      `foundation-share-kubo:${stagingPath}`,
    ]);
    return ipfsCli(["add", "--only-hash", "-r", "-Q", stagingPath]);
  } finally {
    execFileSync("docker", [
      "exec",
      "foundation-share-kubo",
      "rm",
      "-rf",
      stagingPath,
    ]);
  }
}

async function writeTree(
  root: string,
  entries: Record<string, string>,
): Promise<void> {
  await mkdir(root, { recursive: true });
  for (const [relative, body] of Object.entries(entries)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }
}

function tempCidPath(cid: string): string {
  return path.join(process.env.ARCHIVE_STORAGE_DIR!, "ipfs", cid);
}

async function copyTreeUnderCid(sourceDir: string, cid: string): Promise<void> {
  const targetDir = tempCidPath(cid);
  await mkdir(path.dirname(targetDir), { recursive: true });
  execFileSync("cp", ["-R", sourceDir, targetDir]);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listKuboPins(): Promise<Set<string>> {
  const out = ipfsCli(["pin", "ls", "--type=recursive", "--quiet"]);
  return new Set(out.split("\n").filter(Boolean));
}

async function withFreshStagingDir<T>(
  make: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "agorix-test-src-"));
  return make(dir);
}

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`   ok: ${message}`);
    passCount += 1;
  } else {
    console.log(`   FAIL: ${message}`);
    failCount += 1;
  }
}

// ----------------------------------------------------------------------
label("Test 1: single-file dir, matching CID, expect pin + delete");

await withFreshStagingDir(async (staging) => {
  const dirName = "staged";
  const treeDir = path.join(staging, dirName);
  await writeTree(treeDir, { "hello.txt": "hi from agorix test\n" });

  const hostExpectedCid = ipfsAddOnlyHashViaCp(treeDir);

  console.log(`   expected CID: ${hostExpectedCid}`);

  await copyTreeUnderCid(treeDir, hostExpectedCid);
  const cidDir = getCidDirectory(hostExpectedCid);
  assert(await pathExists(cidDir), "cold-storage tree exists before pin");

  const result = await pinCidWithKubo(hostExpectedCid);
  console.log(`   result: ${JSON.stringify(result)}`);

  assert(result.pinned === true, "result.pinned is true");
  assert(result.reference === hostExpectedCid, "result.reference matches CID");
  assert(!(await pathExists(cidDir)), "cold-storage tree deleted after pin");
  const pins = await listKuboPins();
  assert(pins.has(hostExpectedCid), "kubo pinset contains the CID");
});

// ----------------------------------------------------------------------
label("Test 2: multi-file dir, matching CID, expect pin + delete");

await withFreshStagingDir(async (staging) => {
  const treeDir = path.join(staging, "multi");
  await writeTree(treeDir, {
    "a.txt": "alpha\n",
    "b.txt": "beta\n",
    "sub/c.txt": "charlie\n",
  });

  const hostExpectedCid = ipfsAddOnlyHashViaCp(treeDir);

  console.log(`   expected CID: ${hostExpectedCid}`);

  await copyTreeUnderCid(treeDir, hostExpectedCid);
  const cidDir = getCidDirectory(hostExpectedCid);

  const result = await pinCidWithKubo(hostExpectedCid);
  console.log(`   result: ${JSON.stringify(result)}`);

  assert(result.pinned === true, "multi-file dir pinned");
  assert(!(await pathExists(cidDir)), "multi-file cold-storage tree deleted");
  const pins = await listKuboPins();
  assert(pins.has(hostExpectedCid), "multi-file CID present in kubo pinset");
});

// ----------------------------------------------------------------------
label("Test 3: partial directory, mismatched CID, expect skip + keep");

await withFreshStagingDir(async (staging) => {
  const completeDir = path.join(staging, "complete");
  await writeTree(completeDir, {
    "1.json": JSON.stringify({ n: 1 }),
    "2.json": JSON.stringify({ n: 2 }),
    "3.json": JSON.stringify({ n: 3 }),
  });
  const completeCid = ipfsAddOnlyHashViaCp(completeDir);
  console.log(`   expected (complete) CID: ${completeCid}`);

  // Build a partial version — only 1.json — and layout it under the
  // COMPLETE CID's directory name, simulating what cold-storage looks
  // like after we only downloaded one file of a multi-file dir.
  const partialDir = path.join(staging, "partial");
  await writeTree(partialDir, { "1.json": JSON.stringify({ n: 1 }) });
  await copyTreeUnderCid(partialDir, completeCid);
  const cidDir = getCidDirectory(completeCid);

  const pinsBefore = await listKuboPins();

  const result = await pinCidWithKubo(completeCid);
  console.log(`   result: ${JSON.stringify(result)}`);

  assert(result.pinned === false, "mismatched CID returns pinned=false");
  assert(
    result.provider === "skipped-cid-mismatch",
    `provider is skipped-cid-mismatch (got ${result.provider})`,
  );
  assert(
    typeof result.reference === "string" && result.reference !== completeCid,
    "reference is a different CID",
  );
  assert(await pathExists(cidDir), "cold-storage tree preserved on skip");

  const pinsAfter = await listKuboPins();
  const stray = [...pinsAfter].filter((p) => !pinsBefore.has(p));
  assert(
    stray.length === 0,
    `no stray pins left (diff=${JSON.stringify(stray)})`,
  );
});

// ----------------------------------------------------------------------
console.log(`\n=== summary ===`);
console.log(`pass: ${passCount}`);
console.log(`fail: ${failCount}`);
process.exit(failCount > 0 ? 1 : 0);
