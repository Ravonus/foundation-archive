import sharp from "sharp";

const IMAGE_FETCH_TIMEOUT_MS = 2_500;
const IMAGE_MAX_BYTES = 6 * 1024 * 1024; // 6 MB raw
const MAX_IMAGE_DIMENSION = 1024;

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

/// Fetch a font once per cold start. Latin-extended + a Symbol 2 subset is
/// enough to cover usernames like "☆Chris☆" without bloating the font
/// download. Falls back to undefined (system font) if fonts.googleapis.com
/// is unavailable.
let cachedNotoSans: Promise<ArrayBuffer | null> | null = null;
let cachedNotoSansBold: Promise<ArrayBuffer | null> | null = null;

async function fetchFont(cssUrl: string): Promise<ArrayBuffer | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    const cssResponse = await fetch(cssUrl, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; AgorixOG/1.0) AppleWebKit/537.36",
      },
    });
    clearTimeout(timer);
    if (!cssResponse.ok) return null;
    const css = await cssResponse.text();
    const match = /url\((https:\/\/[^)]+)\)/.exec(css);
    if (!match?.[1]) return null;
    const fontController = new AbortController();
    const fontTimer = setTimeout(() => fontController.abort(), 3_000);
    const fontResponse = await fetch(match[1], {
      signal: fontController.signal,
    });
    clearTimeout(fontTimer);
    if (!fontResponse.ok) return null;
    return await fontResponse.arrayBuffer();
  } catch {
    return null;
  }
}

export function loadOgFonts() {
  cachedNotoSans ??= fetchFont(
    "https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400&text=" +
      encodeURIComponent(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?@#$%&*()-_+=:;'\"/\\|<>{}[]☆★✦✧✶✹●◆◇◯◎▲△▼▽♥♡♣♤♪♫→←↑↓⇒·…–—",
      ),
  );
  cachedNotoSansBold ??= fetchFont(
    "https://fonts.googleapis.com/css2?family=Noto+Sans:wght@700&text=" +
      encodeURIComponent(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?@#$%&*()-_+=:;'\"/\\|<>{}[]☆★✦✧✶✹●◆◇◯◎▲△▼▽♥♡♣♤♪♫→←↑↓⇒·…–—",
      ),
  );
  return Promise.all([cachedNotoSans, cachedNotoSansBold]);
}

/// Fetch a remote image and normalize it to PNG via sharp. Handles GIF
/// (takes the first frame), WebP, and oversized images. Satori only
/// reliably renders PNG and JPEG, so every foreign image goes through
/// this bottleneck. Bounded timeout + size cap keep the OG response fast.
export async function inlineImage(url: string | null | undefined) {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      IMAGE_FETCH_TIMEOUT_MS,
    );
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

    const normalized = await sharp(rawBuffer, { pages: 1, animated: false })
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9, effort: 7 })
      .toBuffer();

    return `data:image/png;base64,${normalized.toString("base64")}`;
  } catch {
    return null;
  }
}
