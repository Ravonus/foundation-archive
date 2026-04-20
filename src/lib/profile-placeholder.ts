/// Deterministic placeholder art for artists without a Foundation cover
/// or avatar. Seeds a hue from the artist's handle so each profile reads
/// slightly distinct, while gold/green brand washes keep it anchored to
/// the site palette. The same helpers feed both the on-page hero and the
/// server-generated OG card, so a freshly-minted profile's social
/// preview matches its live page without any image round-trip.

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0; // FNV-1a 32-bit
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hueFor(seed: string): number {
  if (!seed) return 32; // stable warm default when we really have nothing
  return hashSeed(seed) % 360;
}

/// Cream banner with gold/green brand washes + a per-artist hue accent,
/// expressed as a single `background-image` string so it works in both
/// Tailwind inline styles and next/og (Satori). Mean luma stays bright
/// enough that the OG palette picker chooses the light/ink text scheme.
export function placeholderBannerBackground(seed: string): string {
  const hue = hueFor(seed);
  const accent = `hsla(${hue}, 62%, 62%, 0.32)`;
  const accentSecondary = `hsla(${(hue + 38) % 360}, 58%, 60%, 0.22)`;
  return [
    "radial-gradient(circle at 14% 22%, rgba(198, 162, 88, 0.38), transparent 55%)",
    "radial-gradient(circle at 82% 72%, rgba(45, 112, 74, 0.24), transparent 62%)",
    `radial-gradient(circle at 62% 28%, ${accent}, transparent 48%)`,
    `radial-gradient(circle at 28% 82%, ${accentSecondary}, transparent 55%)`,
    "linear-gradient(135deg, #f4f1ea 0%, #ece8e0 58%, #f8f5ee 100%)",
  ].join(", ");
}

/// Paired avatar gradient — same seed produces a coherent-feeling
/// banner/avatar pair. Slightly saturated vs. the banner so the initials
/// (ink on top) still read against it.
export function placeholderAvatarBackground(seed: string): string {
  const hue = hueFor(seed);
  const top = `hsla(${hue}, 58%, 70%, 0.88)`;
  const mid = `hsla(${(hue + 28) % 360}, 55%, 54%, 0.75)`;
  return [
    `radial-gradient(circle at 30% 28%, ${top}, transparent 62%)`,
    `radial-gradient(circle at 72% 72%, ${mid}, transparent 58%)`,
    "linear-gradient(135deg, #f4f1ea, #ece8e0)",
  ].join(", ");
}

/// Approximate mean luma of the placeholder banner, used by OG routes so
/// `palettesFor()` picks the ink-on-cream text scheme rather than the
/// dark-banner scheme.
export const PLACEHOLDER_BANNER_BRIGHTNESS = 228;
