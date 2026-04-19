import { ImageResponse } from "next/og";

import { resolveProfileFromKey } from "./_data";

export const runtime = "nodejs";
export const alt = "Agorix artist profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// ImageResponse is cached by Next based on route params; pair it with a
// revalidate window so Foundation cover/avatar changes eventually flow
// through without a redeploy.
export const revalidate = 3600;

const IMAGE_FETCH_TIMEOUT_MS = 2_500;

/// Inline a remote image as a data: URI so Satori doesn't have to dial
/// the origin mid-render. Bounded timeout keeps the OG response fast
/// even when Foundation's CDN is slow — on timeout/failure we fall back
/// to the initials + gradient frame.
async function inlineImage(url: string | null | undefined) {
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
    const contentType = response.headers.get("content-type") ?? "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0) return null;
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

async function resolveOgProfile(profile: string) {
  try {
    const key = decodeURIComponent(profile).trim();
    // NB: deliberately skip hydrateProfileFromFoundation — that call does
    // an extra Foundation roundtrip and was the main cause of the route
    // stalling past the Caddy 5s timeout. resolveProfileFromKey already
    // hits Foundation (for username keys) and returns avatar + banner.
    return await resolveProfileFromKey(key);
  } catch {
    return null;
  }
}

function shortAddress(accountAddress: string) {
  return `${accountAddress.slice(0, 6)}…${accountAddress.slice(-4)}`;
}

function firstLine(text: string | null | undefined, max: number) {
  if (!text) return null;
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}…`;
}

function OgFrame({
  bannerUrl,
  avatarUrl,
  avatarInitials,
  displayName,
  handle,
  subtitle,
  bio,
}: {
  bannerUrl: string | null;
  avatarUrl: string | null;
  avatarInitials: string;
  displayName: string;
  handle: string | null;
  subtitle: string | null;
  bio: string | null;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, -apple-system, sans-serif",
        backgroundColor: "#0b0b0b",
        color: "#f5f2ea",
        position: "relative",
      }}
    >
      {/* Banner area (top 55%) */}
      <div
        style={{
          width: "100%",
          height: "345px",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#161414",
          backgroundImage:
            "linear-gradient(135deg, rgba(198,162,88,0.28), transparent 55%), radial-gradient(circle at 30% 10%, rgba(255,255,255,0.08), transparent 60%)",
        }}
      >
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img
            src={bannerUrl}
            width={1200}
            height={345}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : null}
        {/* Vignette so avatar + text stay readable */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(180deg, rgba(11,11,11,0) 40%, rgba(11,11,11,0.7) 100%)",
            display: "flex",
          }}
        />
        {/* Brand */}
        <div
          style={{
            position: "absolute",
            top: 32,
            right: 40,
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "#f5f2ea",
            letterSpacing: "0.32em",
            fontSize: 18,
            textTransform: "uppercase",
            opacity: 0.92,
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              backgroundColor: "#c6a258",
              display: "flex",
            }}
          />
          Agorix
        </div>
      </div>

      {/* Body (lower area) */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-end",
          padding: "0 72px 56px",
          gap: 40,
          position: "relative",
        }}
      >
        {/* Avatar — overlaps banner */}
        <div
          style={{
            width: 220,
            height: 220,
            borderRadius: 999,
            backgroundColor: "#1b1b1b",
            border: "10px solid #0b0b0b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            marginTop: -140,
            flexShrink: 0,
            boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
          }}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img
              src={avatarUrl}
              width={220}
              height={220}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                fontSize: 72,
                fontWeight: 600,
                color: "#c6a258",
              }}
            >
              {avatarInitials}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 18,
              textTransform: "uppercase",
              letterSpacing: "0.22em",
              color: "#c6a258",
              display: "flex",
            }}
          >
            Artist profile
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 600,
              marginTop: 10,
              lineHeight: 1.05,
              display: "flex",
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              marginTop: 12,
              display: "flex",
              flexDirection: "row",
              gap: 16,
              color: "rgba(245,242,234,0.72)",
              fontSize: 28,
            }}
          >
            {handle ? <span>{handle}</span> : null}
            {handle && subtitle ? <span>·</span> : null}
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
          {bio ? (
            <div
              style={{
                marginTop: 22,
                fontSize: 26,
                lineHeight: 1.4,
                color: "rgba(245,242,234,0.88)",
                display: "flex",
              }}
            >
              {bio}
            </div>
          ) : null}

          {/* CTA row */}
          <div
            style={{
              marginTop: 28,
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                backgroundColor: "#c6a258",
                color: "#0b0b0b",
                padding: "14px 22px",
                borderRadius: 999,
                fontSize: 22,
                fontWeight: 600,
              }}
            >
              Explore the archive
              <span style={{ display: "flex", marginLeft: 4 }}>→</span>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 18,
                color: "rgba(245,242,234,0.6)",
                letterSpacing: "0.04em",
              }}
            >
              foundation.agorix.io
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function ProfileOgImage({
  params,
}: {
  params: Promise<{ profile: string }>;
}) {
  const { profile } = await params;
  const resolved = await resolveOgProfile(profile);

  const [bannerDataUrl, avatarDataUrl] = await Promise.all([
    inlineImage(resolved?.coverImageUrl),
    inlineImage(resolved?.profileImageUrl),
  ]);

  const displayName =
    resolved?.name ??
    (resolved?.username ? `@${resolved.username}` : null) ??
    (resolved?.accountAddress ? shortAddress(resolved.accountAddress) : null) ??
    "Artist";
  const handle = resolved?.username ? `@${resolved.username}` : null;
  const subtitle = resolved?.accountAddress
    ? shortAddress(resolved.accountAddress)
    : null;
  const bio = firstLine(
    resolved?.bio ??
      "Their works are being preserved in the Agorix Foundation archive.",
    160,
  );

  const avatarInitials = displayName
    .replace(/^@/, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  return new ImageResponse(
    (
      <OgFrame
        bannerUrl={bannerDataUrl}
        avatarUrl={avatarDataUrl}
        avatarInitials={avatarInitials}
        displayName={displayName}
        handle={handle}
        subtitle={subtitle}
        bio={bio}
      />
    ),
    {
      ...size,
      headers: {
        "cache-control":
          "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
