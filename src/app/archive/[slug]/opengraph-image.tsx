import { ImageResponse } from "next/og";

import { db } from "~/server/db";
import { fetchFoundationUserByUsername } from "~/server/archive/foundation-api";
import { resolveArchivedLocalUrl } from "~/server/archive/dependencies";
import { buildArchivePublicPath } from "~/server/archive/ipfs";
import {
  AGORIX_LOGOS,
  OG_THEME,
  inlineImage,
  loadOgFonts,
} from "~/app/_components/og/helpers";

export const runtime = "nodejs";
export const alt = "Agorix archive item";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

const SITE_URL = (() => {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw && /^https?:/.test(raw)) return raw.replace(/\/$/, "");
  return "https://foundation.agorix.io";
})();

function absoluteUrl(path: string | null | undefined) {
  if (!path) return null;
  if (/^https?:/.test(path)) return path;
  if (path.startsWith("/")) return `${SITE_URL}${path}`;
  return `${SITE_URL}/${path}`;
}

function firstLine(text: string | null | undefined, max: number) {
  if (!text) return null;
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}…`;
}

async function loadArchiveOgData(slug: string) {
  const artwork = await db.artwork.findFirst({
    where: { slug },
    select: {
      title: true,
      description: true,
      artistName: true,
      artistUsername: true,
      artistWallet: true,
      collectionName: true,
      staticPreviewUrl: true,
      previewUrl: true,
      mediaKind: true,
      mediaStatus: true,
      mediaRoot: {
        select: {
          cid: true,
          relativePath: true,
        },
      },
    },
  });
  if (!artwork) return null;

  const localMediaUrl =
    artwork.mediaRoot && isLocal(artwork.mediaStatus)
      ? buildArchivePublicPath(
          artwork.mediaRoot.cid,
          artwork.mediaRoot.relativePath,
        )
      : null;
  const localPreview = await resolveArchivedLocalUrl([
    artwork.staticPreviewUrl,
    artwork.previewUrl,
  ]);

  const previewCandidate =
    artwork.mediaKind === "IMAGE"
      ? (localMediaUrl ?? localPreview ?? artwork.previewUrl)
      : (localPreview ?? artwork.staticPreviewUrl ?? artwork.previewUrl);

  const artistProfile = artwork.artistUsername
    ? await fetchFoundationUserByUsername(artwork.artistUsername).catch(
        () => null,
      )
    : null;

  return { artwork, previewCandidate, artistProfile };
}

function isLocal(status: string | null | undefined) {
  return status === "DOWNLOADED" || status === "PINNED";
}

function shortAddress(accountAddress: string) {
  return `${accountAddress.slice(0, 6)}…${accountAddress.slice(-4)}`;
}

function ArchiveOgFrame({
  previewUrl,
  title,
  artistLabel,
  artistHandle,
  artistAvatarUrl,
  artistInitials,
  collectionName,
  description,
}: {
  previewUrl: string | null;
  title: string;
  artistLabel: string;
  artistHandle: string | null;
  artistAvatarUrl: string | null;
  artistInitials: string;
  collectionName: string | null;
  description: string | null;
}) {
  const logoSrc = AGORIX_LOGOS.dark;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "row",
        fontFamily:
          '"Inter", "Noto Sans Symbols 2", system-ui, -apple-system, sans-serif',
        backgroundColor: OG_THEME.background,
        color: OG_THEME.ink,
      }}
    >
      {/* Left: preview */}
      <div
        style={{
          width: 600,
          height: 630,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: OG_THEME.surfaceAlt,
          backgroundImage: `radial-gradient(circle at 30% 30%, rgba(198,162,88,0.22), transparent 60%), linear-gradient(180deg, ${OG_THEME.surfaceAlt}, ${OG_THEME.placeholder})`,
          position: "relative",
          overflow: "hidden",
          borderRight: `1px solid ${OG_THEME.line}`,
        }}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img
            src={previewUrl}
            width={600}
            height={630}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              fontSize: 24,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: OG_THEME.subtle,
              display: "flex",
            }}
          >
            No preview
          </div>
        )}
      </div>

      {/* Right: text info */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "64px 56px",
          position: "relative",
          backgroundColor: OG_THEME.background,
        }}
      >
        {/* Brand corner */}
        <div
          style={{
            position: "absolute",
            top: 24,
            right: 32,
            display: "flex",
            alignItems: "center",
            gap: 14,
            backgroundColor: OG_THEME.surface,
            border: `1px solid ${OG_THEME.line}`,
            color: OG_THEME.ink,
            padding: "10px 22px 10px 14px",
            borderRadius: 999,
          }}
        >
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
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

        {collectionName ? (
          <div
            style={{
              fontSize: 18,
              textTransform: "uppercase",
              letterSpacing: "0.22em",
              color: OG_THEME.gold,
              display: "flex",
            }}
          >
            {collectionName}
          </div>
        ) : null}

        <div
          style={{
            fontFamily:
              '"Fraunces", "Inter", system-ui, Georgia, serif',
            fontSize: 58,
            fontWeight: 600,
            marginTop: 12,
            lineHeight: 1.02,
            color: OG_THEME.ink,
            display: "flex",
          }}
        >
          {title}
        </div>

        {description ? (
          <div
            style={{
              fontSize: 22,
              lineHeight: 1.4,
              marginTop: 20,
              color: OG_THEME.body,
              display: "flex",
            }}
          >
            {description}
          </div>
        ) : null}

        {/* CTA */}
        <div
          style={{
            marginTop: 24,
            display: "flex",
            alignItems: "center",
            gap: 10,
            backgroundColor: OG_THEME.ink,
            color: OG_THEME.background,
            padding: "12px 24px",
            borderRadius: 999,
            fontSize: 20,
            fontWeight: 700,
            alignSelf: "flex-start",
          }}
        >
          View the archive
          <span style={{ display: "flex", marginLeft: 4 }}>→</span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1, display: "flex" }} />

        {/* Artist row */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 20,
            paddingTop: 24,
            borderTop: `1px solid ${OG_THEME.line}`,
          }}
        >
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 999,
              backgroundColor: OG_THEME.surfaceAlt,
              border: `3px solid ${OG_THEME.background}`,
              boxShadow: "0 10px 28px rgba(17,17,17,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {artistAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img
                src={artistAvatarUrl}
                width={70}
                height={70}
                style={{
                  width: "70px",
                  height: "70px",
                  borderRadius: 999,
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: OG_THEME.gold,
                  display: "flex",
                }}
              >
                {artistInitials}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 14,
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                color: OG_THEME.muted,
                display: "flex",
              }}
            >
              Artist
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 700,
                marginTop: 4,
                color: OG_THEME.ink,
                display: "flex",
              }}
            >
              {artistLabel}
            </div>
            {artistHandle ? (
              <div
                style={{
                  fontSize: 18,
                  color: OG_THEME.muted,
                  marginTop: 2,
                  display: "flex",
                }}
              >
                {artistHandle}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function ArchiveOgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadArchiveOgData(slug);

  if (!data) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: OG_THEME.background,
            color: OG_THEME.ink,
            fontSize: 48,
            fontWeight: 700,
            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
          }}
        >
          Agorix
        </div>
      ),
      {
        ...size,
        headers: {
          "cache-control":
            "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  }

  const { artwork, previewCandidate, artistProfile } = data;

  const [previewInlined, avatarInlined] = await Promise.all([
    inlineImage(absoluteUrl(previewCandidate)),
    inlineImage(artistProfile?.profileImageUrl),
  ]);

  const title = firstLine(artwork.title, 90) ?? "Untitled";
  const description = firstLine(artwork.description, 160);
  const collectionName = firstLine(artwork.collectionName, 40);

  const artistLabel =
    artistProfile?.name ??
    artwork.artistName ??
    (artwork.artistUsername
      ? `@${artwork.artistUsername}`
      : artwork.artistWallet
        ? shortAddress(artwork.artistWallet)
        : "Unknown artist");

  const artistHandle = artwork.artistUsername
    ? `@${artwork.artistUsername}`
    : null;

  const artistInitials = artistLabel
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
      <ArchiveOgFrame
        previewUrl={previewInlined?.dataUrl ?? null}
        title={title}
        artistLabel={artistLabel}
        artistHandle={artistHandle}
        artistAvatarUrl={avatarInlined?.dataUrl ?? null}
        artistInitials={artistInitials}
        collectionName={collectionName}
        description={description}
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
