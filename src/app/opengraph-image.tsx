import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt =
  "Agorix: a public Foundation archive and preservation network";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86_400;

export default function RootOgImage() {
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
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: "#0b0b0b",
          color: "#f5f2ea",
          backgroundImage:
            "radial-gradient(circle at 18% 20%, rgba(198,162,88,0.22), transparent 55%), radial-gradient(circle at 85% 85%, rgba(198,162,88,0.10), transparent 60%)",
        }}
      >
        {/* Brand row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            fontSize: 20,
            opacity: 0.92,
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              backgroundColor: "#c6a258",
              display: "flex",
            }}
          />
          Agorix
        </div>

        {/* Headline + supporting copy */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              textTransform: "uppercase",
              letterSpacing: "0.24em",
              color: "#c6a258",
            }}
          >
            A public Foundation archive
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 88,
              fontWeight: 600,
              lineHeight: 1.02,
              marginTop: 24,
              letterSpacing: "-0.02em",
            }}
          >
            Preserving Foundation,
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 88,
              fontWeight: 600,
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
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
              color: "rgba(245,242,234,0.78)",
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
            borderTop: "1px solid rgba(245,242,234,0.18)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              backgroundColor: "#f5f2ea",
              color: "#0b0b0b",
              padding: "18px 28px",
              borderRadius: 999,
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            Search the archive
            <span
              style={{
                display: "flex",
                fontSize: 28,
                fontWeight: 500,
              }}
            >
              →
            </span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgba(245,242,234,0.62)",
            }}
          >
            foundation.agorix.io
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      headers: {
        "cache-control":
          "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
