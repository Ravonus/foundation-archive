import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check } from "lucide-react";

import { DesktopBridgeProvider } from "~/app/_components/desktop-bridge-provider";
import { DesktopShareButton } from "~/app/_components/desktop-share-button";
import { ShareLinkButton } from "~/app/_components/share-link-button";
import { BlurImage, FadeUp } from "~/app/_components/motion";
import { formatDate, shortAddress } from "~/lib/utils";
import { buildArchivePublicPath } from "~/server/archive/ipfs";
import { db } from "~/server/db";
import { type Prisma } from "~/server/prisma-client";

import {
  TechnicalDetails,
  type RootCardItem,
} from "./_technical-details";

export const dynamic = "force-dynamic";

type ArtworkDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata(
  props: ArtworkDetailPageProps,
): Promise<Metadata> {
  const { slug } = await props.params;
  const artwork = await db.artwork.findFirst({
    where: { slug },
    select: {
      title: true,
      description: true,
      artistName: true,
      artistUsername: true,
      collectionName: true,
      staticPreviewUrl: true,
      previewUrl: true,
      mediaKind: true,
      sourceUrl: true,
    },
  });

  if (!artwork) {
    return { title: "Not found · Foundation Archive" };
  }

  const artist =
    artwork.artistName ??
    (artwork.artistUsername ? `@${artwork.artistUsername}` : "Unknown artist");
  const title = `${artwork.title} by ${artist}`;
  const description =
    artwork.description ??
    `Preserved on the Foundation Archive. ${artwork.collectionName ? `Part of ${artwork.collectionName}. ` : ""}A free, open archive of Foundation artists' work.`;
  const image =
    artwork.staticPreviewUrl ??
    artwork.previewUrl ??
    (artwork.mediaKind === "IMAGE" ? artwork.sourceUrl : null);

  return {
    title: `${title} · Foundation Archive`,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      images: image ? [{ url: image, alt: title }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

type Health = "preserved" | "partial" | "pending" | "failed" | "missing";

type ArtworkWithRelations = Prisma.ArtworkGetPayload<{
  include: {
    contract: true;
    metadataRoot: true;
    mediaRoot: true;
    backups: true;
  };
}>;

type IpfsRoot = NonNullable<ArtworkWithRelations["metadataRoot"]>;

type DerivedView = {
  localMediaUrl: string | null;
  localMetadataUrl: string | null;
  imagePreviewUrl: string | null;
  canRenderLocalVideo: boolean;
  hasShareableRoots: boolean;
  health: Health;
  copy: ReturnType<typeof healthCopy>;
};

type SectionProps = { artwork: ArtworkWithRelations; view: DerivedView };

function isLocalStatus(s: string): boolean {
  return s === "DOWNLOADED" || s === "PINNED";
}

function localUrlFor(root: IpfsRoot | null, status: string): string | null {
  if (!root || !isLocalStatus(status)) return null;
  return buildArchivePublicPath(root.cid, root.relativePath);
}

function pickImagePreviewUrl(
  artwork: ArtworkWithRelations,
  localMediaUrl: string | null,
): string | null {
  if (artwork.staticPreviewUrl) return artwork.staticPreviewUrl;
  if (artwork.previewUrl) return artwork.previewUrl;
  if (artwork.mediaKind !== "IMAGE") return null;
  return localMediaUrl ?? artwork.sourceUrl;
}

function artistDisplay(artwork: ArtworkWithRelations): string {
  if (artwork.artistName) return artwork.artistName;
  if (artwork.artistUsername) return `@${artwork.artistUsername}`;
  return "Unknown artist";
}

function healthOf(input: {
  hasMetadataRoot: boolean;
  hasMediaRoot: boolean;
  metaStatus: string;
  mediaStatus: string;
}): Health {
  const tracked = Number(input.hasMetadataRoot) + Number(input.hasMediaRoot);
  const pinned = (s: string) => s === "PINNED";
  const downloaded = (s: string) => s === "DOWNLOADED" || pinned(s);
  const failed = (s: string) => s === "FAILED";

  if (tracked === 0) return "missing";
  if (failed(input.metaStatus) || failed(input.mediaStatus)) return "failed";
  if (
    (!input.hasMetadataRoot || pinned(input.metaStatus)) &&
    (!input.hasMediaRoot || pinned(input.mediaStatus))
  ) {
    return "preserved";
  }
  if (
    (!input.hasMetadataRoot || downloaded(input.metaStatus)) &&
    (!input.hasMediaRoot || downloaded(input.mediaStatus))
  ) {
    return "partial";
  }
  return "pending";
}

function healthCopy(h: Health) {
  switch (h) {
    case "preserved":
      return {
        label: "Saved",
        body: "This work is fully saved to the archive.",
        cls: "bg-[var(--tint-ok)] text-[var(--color-ok)]",
      };
    case "partial":
      return {
        label: "Almost saved",
        body: "The files are saved. The final backup step is still finishing.",
        cls: "bg-[var(--tint-info)] text-[var(--color-info)]",
      };
    case "pending":
      return {
        label: "In line",
        body: "Waiting in line to be saved. This usually happens automatically.",
        cls: "bg-[var(--tint-warn)] text-[var(--color-warn)]",
      };
    case "failed":
      return {
        label: "Retrying",
        body: "The last save attempt didn't finish. It will be retried automatically.",
        cls: "bg-[var(--tint-err)] text-[var(--color-err)]",
      };
    case "missing":
      return {
        label: "Not saved yet",
        body: "This work is tracked but its files haven't been saved yet.",
        cls: "bg-[var(--tint-muted)] text-[var(--color-muted)]",
      };
  }
}

function deriveView(artwork: ArtworkWithRelations): DerivedView {
  const localMediaUrl = localUrlFor(artwork.mediaRoot, artwork.mediaStatus);
  const localMetadataUrl = localUrlFor(
    artwork.metadataRoot,
    artwork.metadataStatus,
  );
  const imagePreviewUrl = pickImagePreviewUrl(artwork, localMediaUrl);
  const health = healthOf({
    hasMetadataRoot: Boolean(artwork.metadataRoot),
    hasMediaRoot: Boolean(artwork.mediaRoot),
    metaStatus: artwork.metadataStatus,
    mediaStatus: artwork.mediaStatus,
  });
  return {
    localMediaUrl,
    localMetadataUrl,
    imagePreviewUrl,
    canRenderLocalVideo:
      Boolean(localMediaUrl) && artwork.mediaKind === "VIDEO",
    hasShareableRoots: Boolean(
      artwork.metadataRoot?.cid ?? artwork.mediaRoot?.cid,
    ),
    health,
    copy: healthCopy(health),
  };
}

export default async function ArtworkDetailPage(props: ArtworkDetailPageProps) {
  const { slug } = await props.params;

  const artwork = await db.artwork.findFirst({
    where: {
      slug,
      OR: [{ metadataRootId: { not: null } }, { mediaRootId: { not: null } }],
    },
    include: {
      contract: true,
      metadataRoot: true,
      mediaRoot: true,
      backups: { orderBy: { createdAt: "desc" }, take: 12 },
    },
  });

  if (!artwork) {
    notFound();
  }

  const view = deriveView(artwork);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pt-8 pb-16">
      <BackLink />
      <div className="mt-6 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <MediaPreview artwork={artwork} view={view} />
        <div>
          <ArtworkHeader artwork={artwork} view={view} />
          <MetadataPanel artwork={artwork} />
          <ActionRow artwork={artwork} view={view} />
          <DesktopSharePanel artwork={artwork} view={view} />
        </div>
      </div>
      <TechnicalDetails
        rootItems={rootCardItems({ artwork, view })}
        backups={artwork.backups}
      />
    </main>
  );
}

function BackLink() {
  return (
    <FadeUp duration={0.4}>
      <Link
        href="/archive"
        className="group inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="arrow-slide h-3.5 w-3.5 [transform:translateX(0)] group-hover:[transform:translateX(-3px)]" />
        <span className="link-editorial">Back to archive</span>
      </Link>
    </FadeUp>
  );
}

function renderPreviewInner({ artwork, view }: SectionProps) {
  if (view.canRenderLocalVideo) {
    return (
      <video
        src={view.localMediaUrl ?? undefined}
        poster={artwork.staticPreviewUrl ?? undefined}
        controls
        loop
        muted
        playsInline
        className="aspect-square w-full bg-black object-contain"
      />
    );
  }
  if (view.imagePreviewUrl) {
    return (
      <BlurImage
        src={view.imagePreviewUrl}
        alt={artwork.title}
        className="aspect-square w-full object-contain"
      />
    );
  }
  return (
    <div className="flex aspect-square items-center justify-center p-8 text-[var(--color-subtle)]">
      No preview available
    </div>
  );
}

function MediaPreview(props: SectionProps) {
  return (
    <FadeUp duration={0.8} y={16}>
      <div className="overflow-hidden rounded-sm bg-[var(--color-placeholder)]">
        {renderPreviewInner(props)}
      </div>
    </FadeUp>
  );
}

function ArtworkHeader({ artwork, view }: SectionProps) {
  const { copy, health } = view;
  return (
    <>
      <FadeUp delay={0.2} duration={0.6}>
        <p className="font-mono text-[0.65rem] tracking-[0.28em] text-[var(--color-muted)] uppercase">
          {artistDisplay(artwork)}
          {artwork.collectionName ? ` · ${artwork.collectionName}` : ""}
        </p>
      </FadeUp>
      <FadeUp delay={0.3} duration={0.7}>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-[var(--color-ink)] sm:text-5xl">
          {artwork.title}
        </h1>
      </FadeUp>
      <FadeUp delay={0.45} duration={0.6}>
        <div
          className={`mt-6 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${copy.cls}`}
        >
          {health === "preserved" ? <Check className="h-4 w-4" /> : null}
          {health === "pending" ? (
            <span
              aria-hidden
              className="dot-pulse inline-block h-1.5 w-1.5 rounded-full bg-current"
            />
          ) : null}
          {copy.label}
        </div>
        <p className="mt-3 max-w-md text-[var(--color-body)]">{copy.body}</p>
      </FadeUp>
      {artwork.description ? (
        <FadeUp delay={0.55} duration={0.6}>
          <p className="mt-6 border-l-2 border-[var(--color-line-strong)] pl-4 leading-relaxed text-[var(--color-body)]">
            {artwork.description}
          </p>
        </FadeUp>
      ) : null}
    </>
  );
}

function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className="mt-1 text-[var(--color-ink)]">{children}</dd>
    </div>
  );
}

function MetadataPanel({ artwork }: { artwork: ArtworkWithRelations }) {
  return (
    <FadeUp delay={0.65} duration={0.6} className="block">
      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
        <MetaItem label="Contract">
          <span className="font-mono">
            {shortAddress(artwork.contractAddress)}
          </span>
        </MetaItem>
        <MetaItem label="Token">
          <span className="font-mono">#{artwork.tokenId}</span>
        </MetaItem>
        <MetaItem label="Media">{artwork.mediaKind.toLowerCase()}</MetaItem>
        <MetaItem label="Last indexed">
          {formatDate(artwork.lastIndexedAt)}
        </MetaItem>
      </dl>
    </FadeUp>
  );
}

const PILL_CLS =
  "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)]";

function ActionPill(props: {
  href: string | null | undefined;
  label: string;
  rel?: string;
}) {
  if (!props.href) return null;
  return (
    <Link
      href={props.href}
      target="_blank"
      rel={props.rel}
      className={PILL_CLS}
    >
      {props.label}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function ActionRow({ artwork, view }: SectionProps) {
  const slugPath = artwork.slug ? `/archive/${artwork.slug}` : null;
  return (
    <FadeUp delay={0.75} duration={0.6} className="block">
      <div className="mt-8 flex flex-wrap gap-2">
        <ActionPill href={artwork.foundationUrl} label="View on Foundation" />
        <ActionPill
          href={artwork.metadataUrl}
          label="View original metadata"
          rel="noreferrer"
        />
        <ActionPill
          href={artwork.sourceUrl}
          label="View original media"
          rel="noreferrer"
        />
        <ActionPill href={view.localMetadataUrl} label="Open server metadata" />
        <ActionPill href={view.localMediaUrl} label="Open server media" />
        {slugPath ? (
          <ShareLinkButton title={artwork.title} path={slugPath} />
        ) : null}
      </div>
    </FadeUp>
  );
}

function DesktopSharePanel({ artwork, view }: SectionProps) {
  const { hasShareableRoots } = view;
  return (
    <FadeUp delay={0.85} duration={0.6} className="block">
      <div className="mt-8 rounded-sm border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <p className="font-medium text-[var(--color-ink)]">
          {hasShareableRoots
            ? "Optional: keep a copy on your own computer"
            : "Not ready for your own copy yet"}
        </p>
        <p className="mt-2 text-sm text-[var(--color-body)]">
          {hasShareableRoots
            ? "This work is already saved in the archive. If you'd like to keep an extra copy on your own computer, you can use the desktop app."
            : "We haven't captured the files for this work yet, so there's nothing to send to the desktop app at the moment."}
        </p>
        {hasShareableRoots ? (
          <div className="mt-4">
            <DesktopBridgeProvider>
              <DesktopShareButton
                work={{
                  title: artwork.title,
                  contractAddress: artwork.contractAddress,
                  tokenId: artwork.tokenId,
                  foundationUrl: artwork.foundationUrl,
                  artistUsername: artwork.artistUsername,
                  metadataCid: artwork.metadataRoot?.cid,
                  mediaCid: artwork.mediaRoot?.cid,
                }}
              />
            </DesktopBridgeProvider>
          </div>
        ) : null}
      </div>
    </FadeUp>
  );
}

function rootCardItems({ artwork, view }: SectionProps): RootCardItem[] {
  return [
    {
      label: "Metadata",
      root: artwork.metadataRoot,
      status: artwork.metadataStatus,
      localUrl: view.localMetadataUrl,
      originalUrl: artwork.metadataUrl,
    },
    {
      label: "Media",
      root: artwork.mediaRoot,
      status: artwork.mediaStatus,
      localUrl: view.localMediaUrl,
      originalUrl: artwork.sourceUrl,
    },
  ];
}
