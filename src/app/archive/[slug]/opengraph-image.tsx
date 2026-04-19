import { ImageResponse } from "next/og";

import { db } from "~/server/db";
import { fetchFoundationUserByUsername } from "~/server/archive/foundation-api";
import { resolveArchivedLocalUrl } from "~/server/archive/dependencies";
import { buildArchivePublicPath } from "~/server/archive/ipfs";

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
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "row",
        fontFamily: "system-ui, -apple-system, sans-serif",
        backgroundColor: "#0b0b0b",
        color: "#f5f2ea",
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
          backgroundColor: "#161414",
          backgroundImage:
            "radial-gradient(circle at 30% 30%, rgba(198,162,88,0.18), transparent 60%)",
          position: "relative",
          overflow: "hidden",
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
              color: "rgba(245,242,234,0.5)",
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
        }}
      >
        {/* Brand corner */}
        <div
          style={{
            position: "absolute",
            top: 32,
            right: 56,
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

        {collectionName ? (
          <div
            style={{
              fontSize: 18,
              textTransform: "uppercase",
              letterSpacing: "0.22em",
              color: "#c6a258",
              display: "flex",
            }}
          >
            {collectionName}
          </div>
        ) : null}

        <div
          style={{
            fontSize: 62,
            fontWeight: 600,
            marginTop: 16,
            lineHeight: 1.05,
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
              color: "rgba(245,242,234,0.82)",
              display: "flex",
            }}
          >
            {description}
          </div>
        ) : null}

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
            borderTop: "1px solid rgba(245,242,234,0.18)",
          }}
        >
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 999,
              backgroundColor: "#1b1b1b",
              border: "3px solid #0b0b0b",
              boxShadow: "0 10px 28px rgba(0,0,0,0.55)",
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
                width={76}
                height={76}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 600,
                  color: "#c6a258",
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
                color: "rgba(245,242,234,0.5)",
                display: "flex",
              }}
            >
              Artist
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 600,
                marginTop: 4,
                display: "flex",
              }}
            >
              {artistLabel}
            </div>
            {artistHandle ? (
              <div
                style={{
                  fontSize: 18,
                  color: "rgba(245,242,234,0.72)",
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
            backgroundColor: "#0b0b0b",
            color: "#f5f2ea",
            fontSize: 48,
            fontFamily: "system-ui, -apple-system, sans-serif",
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

  return new ImageResponse(
    (
      <ArchiveOgFrame
        previewUrl={absoluteUrl(previewCandidate)}
        title={title}
        artistLabel={artistLabel}
        artistHandle={artistHandle}
        artistAvatarUrl={artistProfile?.profileImageUrl ?? null}
        artistInitials={artistInitials}
        collectionName={collectionName}
        description={description}
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
