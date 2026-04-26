/* eslint-disable complexity, @typescript-eslint/no-unnecessary-condition */

import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const IMAGE_FETCH_TIMEOUT_MS = 4_000;
// Artists routinely ship multi-MB banner PNGs and animated GIF avatars
// straight off imgix. Sharp downscales to MAX_IMAGE_DIMENSION anyway, so
// the cap here is really just a ceiling against pathological inputs —
// keep it generous enough to pass through realistic profile assets.
const IMAGE_MAX_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1024;

/// Read a public asset at build/cold-start time and return it as a
/// data: URI so we don't make an HTTP round-trip back to ourselves mid-
/// render. Returns null if the file is missing.
function readPublicAsDataUrl(relativePath: string, mime: string) {
  try {
    const filePath = path.join(process.cwd(), "public", relativePath);
    const buffer = fs.readFileSync(filePath);
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export const AGORIX_LOGOS = {
  dark: readPublicAsDataUrl("logo-dark.png", "image/png"),
  light: readPublicAsDataUrl("logo-light.png", "image/png"),
};

/// Shared visual language for Agorix OG cards — light theme matching the
/// site's cream/paper surfaces so /profile/* and /archive/* cards read as
/// the same brand on X/iMessage/Slack previews.
export const OG_THEME = {
  background: "#fafaf7",
  surface: "#ffffff",
  surfaceAlt: "#f4f1ea",
  placeholder: "#ece8e0",
  ink: "#111111",
  body: "#2a2a2a",
  muted: "#6a6a66",
  subtle: "#989892",
  line: "#e2ddd2",
  gold: "#c6a258",
  green: "#2d704a",
} as const;

export function loadOgFonts() {
  return Promise.resolve<
    [ArrayBuffer | null, ArrayBuffer | null, ArrayBuffer | null, ArrayBuffer | null]
  >([null, null, null, null]);
}

export type InlinedImage = {
  dataUrl: string;
  /// Mean luma 0..255 of the resized PNG. Used to pick a contrasting
  /// text palette on top of the banner.
  brightness: number;
};

export type AnimatedSource = {
  buffer: Buffer;
  width: number;
  height: number;
  frameCount: number;
};

/// Fetch an image and, if it's an animated GIF (or WebP with >1 page),
/// return its raw bytes + metadata. Used by OG routes that want to
/// preserve animation on Discord/iMessage instead of flattening to a
/// first-frame PNG. Returns null for static images or failures so the
/// caller can drop to the PNG path.
export async function fetchAnimatedSource(
  url: string | null | undefined,
): Promise<AnimatedSource | null> {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Agorix OG Bot/1.0" },
    });
    clearTimeout(timer);
    if (!response.ok) return null;

    const lengthHeader = response.headers.get("content-length");
    if (lengthHeader && Number(lengthHeader) > IMAGE_MAX_BYTES) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > IMAGE_MAX_BYTES) {
      return null;
    }

    const metadata = await sharp(buffer, { animated: true }).metadata();
    const pages = metadata.pages ?? 1;
    if (pages <= 1) return null;

    return {
      buffer,
      width: metadata.width ?? 0,
      height: metadata.pageHeight ?? metadata.height ?? 0,
      frameCount: pages,
    };
  } catch {
    return null;
  }
}

/// Fetch a remote image and normalize it to PNG via sharp. Handles GIF
/// (takes the first frame), WebP, and oversized images. Satori only
/// reliably renders PNG and JPEG, so every foreign image goes through
/// this bottleneck. Bounded timeout + size cap keep the OG response fast.
/// Also returns the mean luma so the caller can pick readable text colors
/// over the image.
export async function inlineImage(
  url: string | null | undefined,
): Promise<InlinedImage | null> {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Agorix OG Bot/1.0" },
    });
    clearTimeout(timer);
    if (!response.ok) return null;

    const lengthHeader = response.headers.get("content-length");
    if (lengthHeader && Number(lengthHeader) > IMAGE_MAX_BYTES) return null;

    const rawBuffer = Buffer.from(await response.arrayBuffer());
    if (rawBuffer.byteLength === 0 || rawBuffer.byteLength > IMAGE_MAX_BYTES) {
      return null;
    }

    const pipeline = sharp(rawBuffer, {
      pages: 1,
      animated: false,
    }).resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });

    const normalized = await pipeline
      .clone()
      .png({ compressionLevel: 9, effort: 7 })
      .toBuffer();

    let brightness = 128;
    try {
      const stats = await pipeline.clone().removeAlpha().greyscale().stats();
      const channel = stats.channels[0];
      if (channel) brightness = Math.round(channel.mean);
    } catch {
      // Fall back to the neutral default; the card picks a safe palette.
    }

    return {
      dataUrl: `data:image/png;base64,${normalized.toString("base64")}`,
      brightness,
    };
  } catch {
    return null;
  }
}

/// Pick a contrasting text/overlay palette for a banner based on its
/// mean luma. Brightness in the 80..175 mid-band gets a stronger
/// scrim so mixed-contrast banners stay readable.
export function palettesFor(brightness: number) {
  const isDark = brightness < 128;
  return {
    isDark,
    eyebrow: isDark ? "#f5d48a" : OG_THEME.gold,
    heading: isDark ? "#ffffff" : OG_THEME.ink,
    body: isDark ? "rgba(255,255,255,0.92)" : OG_THEME.body,
    muted: isDark ? "rgba(255,255,255,0.76)" : OG_THEME.muted,
    /// Scrim gradient overlayed on the banner so the text sitting on
    /// top of it stays readable even when the banner is loud.
    scrim: isDark
      ? "linear-gradient(180deg, rgba(0,0,0,0) 25%, rgba(0,0,0,0.55) 100%)"
      : "linear-gradient(180deg, rgba(250,250,247,0) 40%, rgba(250,250,247,0.75) 100%)",
    surface: isDark ? "#131210" : OG_THEME.background,
    surfaceAlt: isDark ? "#1b1a16" : OG_THEME.surfaceAlt,
    avatarRing: isDark ? "#131210" : OG_THEME.background,
    ctaBg: isDark ? OG_THEME.gold : OG_THEME.ink,
    ctaText: isDark ? OG_THEME.ink : OG_THEME.background,
    brandBg: isDark ? "rgba(19,18,16,0.78)" : OG_THEME.surface,
    brandBorder: isDark ? "rgba(255,255,255,0.18)" : OG_THEME.line,
    line: isDark ? "rgba(255,255,255,0.18)" : OG_THEME.line,
  };
}
