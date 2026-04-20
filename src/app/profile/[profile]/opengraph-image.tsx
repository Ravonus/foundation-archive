import { ImageResponse } from "next/og";
import { getAddress } from "viem";

import { db } from "~/server/db";
import { fetchFoundationUserByUsername } from "~/server/archive/foundation-api";
import {
  AGORIX_LOGOS,
  OG_THEME,
  inlineImage,
  loadOgFonts,
  palettesFor,
} from "~/app/_components/og/helpers";

export const runtime = "nodejs";
export const alt = "Agorix artist profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// ImageResponse is cached by Next based on route params; pair it with a
// revalidate window so Foundation cover/avatar changes eventually flow
// through without a redeploy.
export const revalidate = 3600;


type OgProfile = {
  username: string | null;
  name: string | null;
  profileImageUrl: string | null;
  coverImageUrl: string | null;
  bio: string | null;
  accountAddress: string | null;
};

const FOUNDATION_LOOKUP_TIMEOUT_MS = 1_800;

/// Lean profile lookup for the OG route — skips the
/// `resolveProfileFromKey` path used by the full page render because its
/// discovery fallback can take >5 s and blow past Caddy's timeout. We
/// race a direct Foundation user lookup against a hard timeout and fall
/// back to DB-only data (name + username from any artwork row) so the
/// card always renders quickly.
async function resolveOgProfile(profile: string): Promise<OgProfile | null> {
  const key = decodeURIComponent(profile).trim();
  if (!key) return null;

  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(key);
  const normalizedUsername = isAddress ? null : key.replace(/^@+/, "");
  const normalizedAddress = isAddress
    ? safeGetAddress(key)?.toLowerCase() ?? null
    : null;

  let foundationProfile: Awaited<
    ReturnType<typeof fetchFoundationUserByUsername>
  > | null = null;
  if (normalizedUsername) {
    foundationProfile = await withTimeout(
      fetchFoundationUserByUsername(normalizedUsername),
      FOUNDATION_LOOKUP_TIMEOUT_MS,
    ).catch(() => null);
  }

  if (foundationProfile) {
    const addressFromFoundation = foundationProfile.accountAddress
      ? safeGetAddress(foundationProfile.accountAddress)?.toLowerCase() ?? null
      : null;
    return {
      username: foundationProfile.username ?? normalizedUsername,
      name: foundationProfile.name ?? null,
      profileImageUrl: foundationProfile.profileImageUrl ?? null,
      coverImageUrl: foundationProfile.coverImageUrl ?? null,
      bio: foundationProfile.bio ?? null,
      accountAddress: addressFromFoundation ?? normalizedAddress,
    };
  }

  // DB fallback — populate at least name/username/address so the card
  // always has headline text even when Foundation is unreachable.
  const archived = await db.artwork
    .findFirst({
      where: normalizedUsername
        ? {
            artistUsername: { equals: normalizedUsername, mode: "insensitive" },
          }
        : { artistWallet: normalizedAddress ?? key },
      orderBy: [{ lastIndexedAt: "desc" }, { updatedAt: "desc" }],
      select: {
        artistName: true,
        artistUsername: true,
        artistWallet: true,
      },
    })
    .catch(() => null);

  if (!archived) {
    return {
      username: normalizedUsername,
      name: null,
      profileImageUrl: null,
      coverImageUrl: null,
      bio: null,
      accountAddress: normalizedAddress,
    };
  }

  const archivedWalletAddress = archived.artistWallet
    ? (safeGetAddress(archived.artistWallet)?.toLowerCase() ?? null)
    : null;

  return {
    username: archived.artistUsername ?? normalizedUsername,
    name: archived.artistName,
    profileImageUrl: null,
    coverImageUrl: null,
    bio: null,
    accountAddress: archivedWalletAddress ?? normalizedAddress,
  };
}

function safeGetAddress(value: string) {
  try {
    return getAddress(value);
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
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
  bannerBrightness,
  avatarUrl,
  avatarInitials,
  displayName,
  handle,
  subtitle,
  bio,
}: {
  bannerUrl: string | null;
  bannerBrightness: number;
  avatarUrl: string | null;
  avatarInitials: string;
  displayName: string;
  handle: string | null;
  subtitle: string | null;
  bio: string | null;
}) {
  const palette = palettesFor(bannerBrightness);
  const logoSrc = palette.isDark ? AGORIX_LOGOS.light : AGORIX_LOGOS.dark;

  // Layout geometry — banner shrunk to 240px so the body (390px) has room
  // for heading + handle + bio + CTA without pushing the @handle line up
  // into the banner. Avatar overlaps the seam by 80px.
  const BANNER_H = 240;
  const AVATAR_OVERLAP = 80;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily:
          '"Inter", "Noto Sans Symbols 2", system-ui, -apple-system, sans-serif',
        backgroundColor: palette.surface,
        color: palette.heading,
        position: "relative",
      }}
    >
      {/* Banner area */}
      <div
        style={{
          width: "100%",
          height: `${BANNER_H}px`,
          display: "flex",
          position: "relative",
          overflow: "hidden",
          backgroundColor: palette.surfaceAlt,
          backgroundImage: `linear-gradient(135deg, rgba(198,162,88,0.22), transparent 55%), linear-gradient(180deg, ${palette.surfaceAlt}, ${palette.surface})`,
          borderBottom: `1px solid ${palette.line}`,
        }}
      >
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img
            src={bannerUrl}
            width={1200}
            height={BANNER_H}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: palette.scrim,
            display: "flex",
          }}
        />
        {/* Brand */}
        <div
          style={{
            position: "absolute",
            top: 24,
            right: 32,
            display: "flex",
            alignItems: "center",
            gap: 12,
            backgroundColor: palette.brandBg,
            border: `1px solid ${palette.brandBorder}`,
            color: palette.heading,
            letterSpacing: "0.3em",
            fontSize: 16,
            textTransform: "uppercase",
            fontWeight: 600,
            padding: "8px 18px 8px 12px",
            borderRadius: 999,
          }}
        >
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img
              src={logoSrc}
              width={28}
              height={28}
              style={{ width: 28, height: 28, display: "flex" }}
            />
          ) : (
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                backgroundColor: OG_THEME.gold,
                display: "flex",
              }}
            />
          )}
          Agorix
        </div>
      </div>

      {/* Body (lower area) */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          padding: "36px 72px 48px",
          gap: 40,
          position: "relative",
          backgroundColor: palette.surface,
        }}
      >
        {/* Avatar — overlaps banner seam by AVATAR_OVERLAP */}
        <div
          style={{
            width: 200,
            height: 200,
            borderRadius: 999,
            backgroundColor: palette.surfaceAlt,
            border: `8px solid ${palette.avatarRing}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            marginTop: -AVATAR_OVERLAP,
            flexShrink: 0,
            boxShadow: "0 24px 60px rgba(17,17,17,0.15)",
          }}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img
              src={avatarUrl}
              width={184}
              height={184}
              style={{
                width: "184px",
                height: "184px",
                borderRadius: 999,
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                fontSize: 68,
                fontWeight: 700,
                color: OG_THEME.gold,
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
              fontSize: 16,
              textTransform: "uppercase",
              letterSpacing: "0.22em",
              fontWeight: 600,
              color: palette.eyebrow,
              display: "flex",
            }}
          >
            Artist profile
          </div>
          <div
            style={{
              fontFamily:
                '"Fraunces", "Inter", system-ui, Georgia, serif',
              fontSize: 64,
              fontWeight: 600,
              marginTop: 8,
              lineHeight: 1.02,
              color: palette.heading,
              display: "flex",
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexDirection: "row",
              gap: 14,
              color: palette.muted,
              fontSize: 24,
            }}
          >
            {handle ? <span>{handle}</span> : null}
            {handle && subtitle ? <span>·</span> : null}
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
          {bio ? (
            <div
              style={{
                marginTop: 16,
                fontSize: 22,
                lineHeight: 1.4,
                color: palette.body,
                display: "flex",
              }}
            >
              {bio}
            </div>
          ) : null}

          {/* CTA row */}
          <div
            style={{
              marginTop: 20,
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
                backgroundColor: palette.ctaBg,
                color: palette.ctaText,
                padding: "12px 22px",
                borderRadius: 999,
                fontSize: 20,
                fontWeight: 600,
              }}
            >
              Explore the archive
              <span style={{ display: "flex", marginLeft: 4 }}>→</span>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 16,
                color: palette.muted,
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

  const [bannerInlined, avatarInlined] = await Promise.all([
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
  ].filter(
    (font): font is NonNullable<typeof font> => Boolean(font),
  );

  return new ImageResponse(
    (
      <OgFrame
        bannerUrl={bannerInlined?.dataUrl ?? null}
        bannerBrightness={bannerInlined?.brightness ?? 255}
        avatarUrl={avatarInlined?.dataUrl ?? null}
        avatarInitials={avatarInitials}
        displayName={displayName}
        handle={handle}
        subtitle={subtitle}
        bio={bio}
      />
    ),
    {
      ...size,
      fonts: fonts.length > 0 ? fonts : undefined,
      headers: {
        "cache-control":
          "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
