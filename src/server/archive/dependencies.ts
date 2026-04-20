/* eslint-disable max-lines */
import {
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { RootKind } from "~/server/prisma-client";

import {
  buildArchivePublicPath,
  buildGatewayUrl,
  parseIpfsReference,
} from "./ipfs";
import {
  archivedAssetExists,
  downloadFileToArchive,
  getArchiveStorageRoot,
  getArchivedFilePath,
} from "./storage";

const DEPENDENCY_MANIFEST_VERSION = 1;
const DEPENDENCY_MANIFEST_DIR = ".agorix-dependencies";
const MAX_DEPENDENCY_DEPTH = 4;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const GLB_MAGIC = 0x46546c67;
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".gltf",
  ".htm",
  ".html",
  ".json",
  ".mjs",
  ".js",
  ".md",
  ".svg",
  ".txt",
  ".xml",
]);

const JSON_REFERENCE_KEYS = new Set([
  "animation",
  "animation_url",
  "artifacturi",
  "artifact_uri",
  "content",
  "displayuri",
  "display_uri",
  "href",
  "image",
  "image_url",
  "poster",
  "previewurl",
  "preview_url",
  "sourceurl",
  "source_url",
  "src",
  "thumbnailuri",
  "thumbnail_uri",
  "uri",
  "url",
  "videostaticurl",
  "video_static_url",
  "modelstaticurl",
  "model_static_url",
]);

const MARKUP_REFERENCE_PATTERN =
  /(?:href|xlink:href|src|poster|data)\s*=\s*["']([^"']+)["']/gi;
const CSS_URL_PATTERN = /url\(([^)]+)\)/gi;
const ABSOLUTE_URL_PATTERN = /(?:ipfs:\/\/|https?:\/\/|\/ipfs\/)[^\s"'<>`]+/gi;

export type DependencyStatus = "PENDING" | "DOWNLOADED" | "FAILED";

export type DependencyNode = {
  key: string;
  parentKey: string | null;
  cid: string;
  relativePath: string;
  localUrl: string;
  gatewayUrl: string;
  originalUrl: string;
  sourceType: string;
  discoveredFrom: string;
  depth: number;
  status: DependencyStatus;
  mimeType: string | null;
  byteSize: number | null;
  lastError: string | null;
};

export type DependencyManifest = {
  version: number;
  rootKey: string;
  rootCid: string;
  rootRelativePath: string | null;
  rootKind: string;
  verifiedAt: string | null;
  nodes: DependencyNode[];
};

type RootWithDependencyContext = {
  cid: string;
  relativePath: string | null;
  kind: string;
};

type ArtworkDependencyContext = {
  previewUrl: string | null;
  staticPreviewUrl: string | null;
};

type DiscoveredReference = {
  cid: string;
  relativePath: string;
  gatewayUrl: string;
  originalUrl: string;
  sourceType: string;
  discoveredFrom: string;
};

function cleanRelativePath(relativePath: string | null | undefined) {
  return relativePath?.replace(/^\/+|\/+$/g, "") ?? "";
}

function dependencyKey(cid: string, relativePath: string | null | undefined) {
  const cleaned = cleanRelativePath(relativePath);
  return `${cid}:${cleaned || "__root__"}`;
}

function manifestFileName(relativePath: string | null | undefined) {
  const encoded = Buffer.from(relativePath ?? "__root__", "utf8").toString(
    "base64url",
  );
  return `${encoded}.json`;
}

function dependencyManifestPath(
  cid: string,
  relativePath: string | null | undefined,
) {
  return path.join(
    getArchiveStorageRoot(),
    DEPENDENCY_MANIFEST_DIR,
    cid,
    manifestFileName(relativePath),
  );
}

function dedupeReferences(values: DiscoveredReference[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = dependencyKey(value.cid, value.relativePath);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function trimWrapperQuotes(value: string) {
  const trimmed = value.trim();
  return trimmed.replace(/^['"]|['"]$/g, "");
}

function stripQueryAndHash(value: string) {
  return value.replace(/[?#].*$/u, "");
}

function isSkippableReference(value: string) {
  const lowered = value.toLowerCase();
  return (
    !value ||
    lowered === "." ||
    lowered === "./" ||
    lowered.startsWith("#") ||
    lowered.startsWith("data:") ||
    lowered.startsWith("blob:") ||
    lowered.startsWith("mailto:") ||
    lowered.startsWith("tel:") ||
    lowered.startsWith("javascript:")
  );
}

function parseAbsoluteReference(value: string) {
  if (value.startsWith("/ipfs/")) {
    return parseIpfsReference(`https://archive.local${value}`, RootKind.UNKNOWN);
  }

  if (value.startsWith("ipfs://") || value.startsWith("http://") || value.startsWith("https://")) {
    return parseIpfsReference(value, RootKind.UNKNOWN);
  }

  return null;
}

function isLikelyRelativeReference(value: string) {
  if (value.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  return value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || !value.includes(" ");
}

function resolveRelativeReference(
  root: RootWithDependencyContext,
  value: string,
) {
  const basePath = cleanRelativePath(root.relativePath);
  const normalizedInput = stripQueryAndHash(value);

  if (!normalizedInput) return null;

  const resolved = normalizedInput.startsWith("/")
    ? normalizedInput.replace(/^\/+/u, "")
    : path.posix.normalize(
        path.posix.join(path.posix.dirname(basePath || "."), normalizedInput),
      );

  if (
    !resolved ||
    resolved === "." ||
    resolved === "__root__" ||
    resolved.startsWith("../") ||
    resolved === ".."
  ) {
    return null;
  }

  return {
    cid: root.cid,
    relativePath: resolved.replace(/^\/+/u, ""),
    gatewayUrl: buildGatewayUrl(root.cid, resolved),
    originalUrl: buildGatewayUrl(root.cid, resolved),
  };
}

function toReferenceCandidate(args: {
  root: RootWithDependencyContext;
  value: string;
  sourceType: string;
  discoveredFrom: string;
}): DiscoveredReference | null {
  const cleaned = trimWrapperQuotes(stripQueryAndHash(args.value.trim()));
  if (isSkippableReference(cleaned)) return null;

  const absolute = parseAbsoluteReference(cleaned);
  if (absolute) {
    return {
      cid: absolute.cid,
      relativePath: cleanRelativePath(absolute.relativePath),
      gatewayUrl: absolute.gatewayUrl,
      originalUrl: absolute.originalUrl,
      sourceType: args.sourceType,
      discoveredFrom: args.discoveredFrom,
    };
  }

  if (!isLikelyRelativeReference(cleaned)) {
    return null;
  }

  const relative = resolveRelativeReference(args.root, cleaned);
  if (!relative) return null;

  return {
    ...relative,
    sourceType: args.sourceType,
    discoveredFrom: args.discoveredFrom,
  };
}

function collectJsonReferenceValues(
  value: unknown,
  parentKey: string | null,
  output: Array<{ value: string; sourceType: string }>,
) {
  const key = parentKey?.toLowerCase() ?? null;

  if (typeof value === "string") {
    if (shouldTrackJsonString(value, key)) {
      output.push({
        value,
        sourceType: key ? `json:${key}` : "json:string",
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    collectJsonArrayReferences(value, parentKey, output);
    return;
  }

  collectJsonObjectReferences(value, output);
}

function shouldTrackJsonString(value: string, key: string | null) {
  return (
    (key !== null && JSON_REFERENCE_KEYS.has(key)) ||
    value.includes("ipfs://") ||
    value.includes("/ipfs/")
  );
}

function collectJsonArrayReferences(
  values: unknown[],
  parentKey: string | null,
  output: Array<{ value: string; sourceType: string }>,
) {
  for (const entry of values) {
    collectJsonReferenceValues(entry, parentKey, output);
  }
}

function collectJsonObjectReferences(
  value: unknown,
  output: Array<{ value: string; sourceType: string }>,
) {
  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    collectJsonReferenceValues(nested, key, output);
  }
}

function extractGlbJson(buffer: Buffer) {
  if (buffer.length < GLB_HEADER_BYTES) return null;
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) return null;

  let offset = GLB_HEADER_BYTES;
  while (offset + GLB_CHUNK_HEADER_BYTES <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + GLB_CHUNK_HEADER_BYTES;
    const chunkEnd = chunkStart + chunkLength;

    if (chunkEnd > buffer.length) {
      return null;
    }

    if (chunkType === JSON_CHUNK_TYPE) {
      return buffer.subarray(chunkStart, chunkEnd).toString("utf8").replace(/\0+$/u, "");
    }

    offset = chunkEnd;
  }

  return null;
}

function collectMarkupReferenceValues(text: string) {
  const output: Array<{ value: string; sourceType: string }> = [];

  for (const match of text.matchAll(MARKUP_REFERENCE_PATTERN)) {
    const value = match[1];
    if (!value) continue;
    output.push({ value, sourceType: "markup:attr" });
  }

  for (const match of text.matchAll(CSS_URL_PATTERN)) {
    const value = match[1];
    if (!value) continue;
    output.push({ value, sourceType: "markup:css-url" });
  }

  for (const match of text.matchAll(ABSOLUTE_URL_PATTERN)) {
    const value = match[0];
    if (!value) continue;
    output.push({ value, sourceType: "markup:absolute" });
  }

  return output;
}

function collectTextReferenceValues(text: string) {
  return [...text.matchAll(ABSOLUTE_URL_PATTERN)].flatMap((match) => {
    const value = match[0];
    return value ? [{ value, sourceType: "text:absolute" }] : [];
  });
}

async function discoverReferencesFromArchivedAsset(
  root: RootWithDependencyContext,
  absolutePath: string,
) {
  const extension = path.extname(absolutePath).toLowerCase();
  if (extension === ".glb") {
    return discoverGlbReferences(root, absolutePath);
  }

  if (!TEXT_EXTENSIONS.has(extension)) {
    return [];
  }

  return discoverTextReferences(root, absolutePath, extension);
}

function referenceValuesForJsonText(text: string) {
  const values: Array<{ value: string; sourceType: string }> = [];
  try {
    collectJsonReferenceValues(JSON.parse(text) as unknown, null, values);
  } catch {
    values.push(...collectTextReferenceValues(text));
  }
  return values;
}

function referenceValuesForTextByExtension(text: string, extension: string) {
  if (extension === ".json" || extension === ".gltf") {
    return referenceValuesForJsonText(text);
  }

  if (
    extension === ".css" ||
    extension === ".html" ||
    extension === ".htm" ||
    extension === ".svg" ||
    extension === ".xml"
  ) {
    return collectMarkupReferenceValues(text);
  }

  return collectTextReferenceValues(text);
}

function toDiscoveredReferences(args: {
  root: RootWithDependencyContext;
  values: Array<{ value: string; sourceType: string }>;
}) {
  const discoveredFrom = cleanRelativePath(args.root.relativePath) || "__root__";

  return dedupeReferences(
    args.values
      .map((value) =>
        toReferenceCandidate({
          root: args.root,
          value: value.value,
          sourceType: value.sourceType,
          discoveredFrom,
        }),
      )
      .filter((value): value is DiscoveredReference => Boolean(value)),
  );
}

async function discoverGlbReferences(
  root: RootWithDependencyContext,
  absolutePath: string,
) {
  const buffer = await readFile(absolutePath);
  const glbJson = extractGlbJson(buffer);
  if (!glbJson) return [];

  return toDiscoveredReferences({
    root,
    values: referenceValuesForJsonText(glbJson),
  });
}

async function discoverTextReferences(
  root: RootWithDependencyContext,
  absolutePath: string,
  extension: string,
) {
  const text = await readFile(absolutePath, "utf8");
  return toDiscoveredReferences({
    root,
    values: referenceValuesForTextByExtension(text, extension),
  });
}

function manifestTemplate(root: RootWithDependencyContext): DependencyManifest {
  return {
    version: DEPENDENCY_MANIFEST_VERSION,
    rootKey: dependencyKey(root.cid, root.relativePath),
    rootCid: root.cid,
    rootRelativePath: root.relativePath,
    rootKind: root.kind,
    verifiedAt: null,
    nodes: [],
  };
}

function upsertNode(
  manifest: DependencyManifest,
  node: DependencyNode,
): DependencyNode {
  const index = manifest.nodes.findIndex((entry) => entry.key === node.key);
  if (index === -1) {
    manifest.nodes.push(node);
    return node;
  }

  const updatedNode: DependencyNode = {
    ...manifest.nodes[index],
    ...node,
  };
  manifest.nodes[index] = updatedNode;
  return updatedNode;
}

async function writeDependencyManifest(
  root: RootWithDependencyContext,
  manifest: DependencyManifest,
) {
  const targetPath = dependencyManifestPath(root.cid, root.relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(manifest, null, 2), "utf8");
}

async function archiveDependencyTree(args: {
  root: RootWithDependencyContext;
  manifest: DependencyManifest;
  references: DiscoveredReference[];
  parentKey: string;
  depth: number;
  visited: Set<string>;
}) {
  const { root, manifest, parentKey, visited } = args;
  const nextDepth = args.depth + 1;
  if (nextDepth > MAX_DEPENDENCY_DEPTH) {
    return;
  }

  for (const reference of dedupeReferences(args.references)) {
    const key = dependencyKey(reference.cid, reference.relativePath);
    if (key === manifest.rootKey) {
      continue;
    }

    const localUrl = buildArchivePublicPath(reference.cid, reference.relativePath);
    const node = upsertNode(manifest, {
      key,
      parentKey,
      cid: reference.cid,
      relativePath: reference.relativePath,
      localUrl,
      gatewayUrl: reference.gatewayUrl,
      originalUrl: reference.originalUrl,
      sourceType: reference.sourceType,
      discoveredFrom: reference.discoveredFrom,
      depth: nextDepth,
      status: "PENDING",
      mimeType: null,
      byteSize: null,
      lastError: null,
    });

    try {
      const download = await downloadFileToArchive({
        cid: reference.cid,
        relativePath: reference.relativePath,
        gatewayUrl: reference.gatewayUrl,
        originalUrl: reference.originalUrl,
      });
      const fileStats = await stat(download.absolutePath);

      node.status = "DOWNLOADED";
      node.byteSize = fileStats.size;
      node.mimeType = download.mimeType ?? null;
      node.lastError = null;

      if (visited.has(key)) {
        continue;
      }
      visited.add(key);

      const nested = await discoverReferencesFromArchivedAsset(
        {
          cid: reference.cid,
          relativePath: reference.relativePath,
          kind: root.kind,
        },
        download.absolutePath,
      );

      await archiveDependencyTree({
        root,
        manifest,
        references: nested,
        parentKey: key,
        depth: nextDepth,
        visited,
      });
    } catch (error) {
      node.status = "FAILED";
      node.lastError =
        error instanceof Error ? error.message : "Unknown dependency failure";
      console.warn(
        `[archive] Dependency ${reference.cid}${reference.relativePath ? "/" + reference.relativePath : ""} failed:`,
        node.lastError,
      );
    }
  }
}

function artworkSeedReferences(args: {
  artwork: ArtworkDependencyContext;
  root: RootWithDependencyContext;
}) {
  if (args.root.kind !== "MEDIA") {
    return [] as DiscoveredReference[];
  }

  return dedupeReferences(
    [args.artwork.staticPreviewUrl, args.artwork.previewUrl]
      .flatMap((value) =>
        value
          ? [
              toReferenceCandidate({
                root: args.root,
                value,
                sourceType: "artwork:preview",
                discoveredFrom: "artwork",
              }),
            ]
          : [],
      )
      .filter((value): value is DiscoveredReference => Boolean(value)),
  );
}

export async function readDependencyManifest(
  cid: string,
  relativePath: string | null | undefined,
) {
  try {
    const raw = await readFile(
      dependencyManifestPath(cid, relativePath),
      "utf8",
    );
    return JSON.parse(raw) as DependencyManifest;
  } catch {
    return null;
  }
}

export async function dependencyManifestIsCurrent(
  root: RootWithDependencyContext,
) {
  const manifest = await readDependencyManifest(root.cid, root.relativePath);
  return (
    manifest?.version === DEPENDENCY_MANIFEST_VERSION &&
    Boolean(manifest.verifiedAt)
  );
}

export async function verifyArchivedRootDependencies(args: {
  root: RootWithDependencyContext;
  artwork: ArtworkDependencyContext;
}) {
  const { root, artwork } = args;
  const manifest = manifestTemplate(root);
  const rootKey = manifest.rootKey;
  const rootLocalUrl = buildArchivePublicPath(root.cid, root.relativePath);
  const rootAbsolutePath = getArchivedFilePath(root.cid, root.relativePath);
  const rootStats = await stat(rootAbsolutePath);

  upsertNode(manifest, {
    key: rootKey,
    parentKey: null,
    cid: root.cid,
    relativePath: cleanRelativePath(root.relativePath),
    localUrl: rootLocalUrl,
    gatewayUrl: buildGatewayUrl(root.cid, cleanRelativePath(root.relativePath)),
    originalUrl: buildGatewayUrl(root.cid, cleanRelativePath(root.relativePath)),
    sourceType: "root",
    discoveredFrom: "root",
    depth: 0,
    status: "DOWNLOADED",
    mimeType: null,
    byteSize: rootStats.size,
    lastError: null,
  });

  const discoveredFromRoot = await discoverReferencesFromArchivedAsset(
    root,
    rootAbsolutePath,
  );
  const seeds = artworkSeedReferences({ artwork, root });
  const visited = new Set<string>([rootKey]);

  await archiveDependencyTree({
    root,
    manifest,
    references: [...seeds, ...discoveredFromRoot],
    parentKey: rootKey,
    depth: 0,
    visited,
  });
  manifest.verifiedAt = new Date().toISOString();
  await writeDependencyManifest(root, manifest);
  return manifest;
}

export async function resolveArchivedLocalUrl(
  candidates: Array<string | null | undefined>,
) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = parseIpfsReference(candidate, RootKind.UNKNOWN);
    if (!parsed) continue;
    if (!(await archivedAssetExists(parsed.cid, parsed.relativePath))) {
      continue;
    }
    return buildArchivePublicPath(parsed.cid, parsed.relativePath);
  }

  return null;
}
