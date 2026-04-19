import path from "node:path";

import { readArchivedAsset } from "~/server/archive/storage";
import { db } from "~/server/db";

type ArchiveRouteProps = {
  params: Promise<{
    cid: string;
    assetPath: string[];
  }>;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  ".aac": "audio/aac",
  ".avi": "video/x-msvideo",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".m4a": "audio/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".oga": "audio/ogg",
  ".ogg": "audio/ogg",
  ".ogv": "video/ogg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".usdz": "model/vnd.usdz+zip",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

function chooseContentType(
  extension: string,
  storedMimeType: string | null | undefined,
) {
  const normalizedStored =
    storedMimeType && storedMimeType !== "application/octet-stream"
      ? storedMimeType
      : null;

  return (
    MIME_BY_EXTENSION[extension] ??
    normalizedStored ??
    storedMimeType ??
    "application/octet-stream"
  );
}

function contentDispositionValue(fileName: string) {
  const fallback = fileName.replace(/["\r\n]/g, "_");
  const encoded = encodeURIComponent(fileName);
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(_request: Request, props: ArchiveRouteProps) {
  const { cid, assetPath } = await props.params;

  try {
    const root = await db.ipfsRoot.findUnique({
      where: { cid },
      select: {
        fileName: true,
        mimeType: true,
        relativePath: true,
      },
    });

    const resolvedAssetPath =
      assetPath.length > 0
        ? assetPath
        : (root?.relativePath?.split("/").filter(Boolean) ?? []);

    const asset = await readArchivedAsset(cid, resolvedAssetPath);
    const extension = path.extname(asset.absolutePath).toLowerCase();
    const fileName =
      assetPath.length > 0
        ? path.basename(asset.absolutePath)
        : (root?.fileName ?? path.basename(asset.absolutePath));

    return new Response(asset.contents, {
      headers: {
        "content-type": chooseContentType(extension, root?.mimeType),
        "content-disposition": contentDispositionValue(fileName),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Archived asset not found.", {
      status: 404,
    });
  }
}
