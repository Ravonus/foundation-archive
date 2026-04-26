/* eslint-disable max-lines-per-function */

import { ImageResponse } from "next/og";

import {
  AGORIX_LOGOS,
  OG_THEME,
  loadOgFonts,
} from "~/app/_components/og/helpers";

export const runtime = "nodejs";
export const alt =
  "Agorix: a public Foundation archive and preservation network";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86_400;

export default async function RootOgImage() {
  const [inter, interSemibold, fraunces, notoSymbols] = await loadOgFonts();
  const fonts = [
    inter
      ? {
          name: "Inter",
          data: inter,
          weight: 400 as const,
          style: "normal" as const,
        }
      : null,
    interSemibold
      ? {
          name: "Inter",
          data: interSemibold,
          weight: 600 as const,
          style: "normal" as const,
        }
      : null,
    fraunces
      ? {
          name: "Fraunces",
          data: fraunces,
          weight: 600 as const,
          style: "normal" as const,
        }
      : null,
    notoSymbols
      ? {
          name: "Noto Sans Symbols 2",
          data: notoSymbols,
          weight: 400 as const,
          style: "normal" as const,
        }
      : null,
  ].filter((font): font is NonNullable<typeof font> => Boolean(font));

  const logoSrc = AGORIX_LOGOS.dark;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          fontFamily:
            '"Inter", "Noto Sans Symbols 2", system-ui, -apple-system, sans-serif',
          backgroundColor: OG_THEME.background,
          color: OG_THEME.ink,
          backgroundImage: `radial-gradient(circle at 18% 20%, rgba(198,162,88,0.18), transparent 55%), radial-gradient(circle at 85% 85%, rgba(198,162,88,0.10), transparent 60%)`,
        }}
      >
        {/* Brand chip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            backgroundColor: OG_THEME.surface,
            border: `1px solid ${OG_THEME.line}`,
            color: OG_THEME.ink,
            padding: "10px 22px 10px 14px",
            borderRadius: 999,
            alignSelf: "flex-start",
          }}
        >
          {logoSrc ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img
              src={logoSrc}
              width={44}
              height={44}
              style={{ width: 44, height: 44, display: "flex" }}
            />
          ) : (
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 999,
                backgroundColor: OG_THEME.gold,
                display: "flex",
              }}
            />
          )}
          <div
            style={{
              fontFamily: '"Fraunces", "Inter", system-ui, Georgia, serif',
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              lineHeight: 1.08,
              display: "flex",
            }}
          >
            Agorix
          </div>
        </div>

        {/* Headline + supporting copy */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              textTransform: "uppercase",
              letterSpacing: "0.24em",
              color: OG_THEME.gold,
              fontWeight: 600,
            }}
          >
            A public Foundation archive
          </div>
          <div
            style={{
              fontFamily: '"Fraunces", "Inter", system-ui, Georgia, serif',
              display: "flex",
              fontSize: 88,
              fontWeight: 600,
              lineHeight: 1.02,
              marginTop: 24,
              letterSpacing: "-0.02em",
              color: OG_THEME.ink,
            }}
          >
            Preserving Foundation,
          </div>
          <div
            style={{
              fontFamily: '"Fraunces", "Inter", system-ui, Georgia, serif',
              display: "flex",
              fontSize: 88,
              fontWeight: 600,
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              color: OG_THEME.ink,
            }}
          >
            before more slips away.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              lineHeight: 1.4,
              marginTop: 28,
              maxWidth: 900,
              color: OG_THEME.body,
            }}
          >
            Search saved works, back up the pieces you care about, and help keep
            them reachable.
          </div>
        </div>

        {/* CTA row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            paddingTop: 28,
            borderTop: `1px solid ${OG_THEME.line}`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              backgroundColor: OG_THEME.ink,
              color: OG_THEME.background,
              padding: "16px 28px",
              borderRadius: 999,
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            Search the archive
            <span
              style={{
                display: "flex",
                fontSize: 26,
                fontWeight: 500,
              }}
            >
              →
            </span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 20,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: OG_THEME.muted,
              fontWeight: 600,
            }}
          >
            foundation.agorix.io
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fonts.length > 0 ? fonts : undefined,
      headers: {
        "cache-control":
          "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
