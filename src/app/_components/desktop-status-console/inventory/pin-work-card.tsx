"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ImageIcon,
  Loader2,
  Radio,
} from "lucide-react";

import type { BridgePinInventoryItem } from "~/app/_components/desktop-bridge-provider";
import { ChainBadge } from "~/app/_components/chain-badge";
import { ModelMediaPreview } from "~/app/_components/model-media-preview";
import { buildPublicUtilityGatewayUrl } from "~/lib/desktop-relay";
import { cn, formatDate, shortAddress } from "~/lib/utils";

import {
  buildInventoryPreviewCandidates,
  normalizePreviewKind,
  previewKindFromHints,
  type PreviewCandidate,
} from "./preview-media";
import {
  itemContext,
  itemLabel,
  pinItemCids,
  type PinMatch,
  type PinVerificationSummary,
} from "../types";

export type PinHealth = "saved" | "unreachable" | "checking" | "missing";

function healthClass(health: PinHealth) {
  switch (health) {
    case "saved":
      return "bg-[var(--tint-ok)] text-[var(--color-ok)]";
    case "unreachable":
      return "bg-[var(--tint-warn)] text-[var(--color-warn)]";
    case "checking":
      return "bg-[var(--tint-info)] text-[var(--color-info)]";
    case "missing":
      return "bg-[var(--tint-err)] text-[var(--color-err)]";
  }
}

function healthLabel(
  health: PinHealth,
  verification: PinVerificationSummary | null,
) {
  const multiRootLabel = buildMultiRootHealthLabel(health, verification);

  if (multiRootLabel) return multiRootLabel;

  if (health === "saved") {
    return verification && verification.providerCount > 0
      ? `${verification.providerCount} on network`
      : "Saved";
  }

  if (health === "unreachable") return "Not on network";
  if (health === "checking") return "Checking network…";
  return "Needs saving";
}

function buildMultiRootHealthLabel(
  health: PinHealth,
  verification: PinVerificationSummary | null,
) {
  if (!verification || verification.totalRoots <= 1) return null;

  if (health === "saved") {
    return `${verification.totalRoots}/${verification.totalRoots} live`;
  }

  if (health === "unreachable") {
    return `${verification.reachableRoots}/${verification.totalRoots} live`;
  }

  if (health === "checking") {
    return `Checking ${verification.checkedRoots}/${verification.totalRoots}…`;
  }

  return null;
}

function healthIcon(health: PinHealth) {
  switch (health) {
    case "saved":
      return <Check className="h-3 w-3" />;
    case "unreachable":
      return <Radio className="h-3 w-3" />;
    case "checking":
      return <Loader2 className="h-3 w-3 animate-spin" />;
    case "missing":
      return <AlertTriangle className="h-3 w-3" />;
  }
}

export function pinHealthFor(
  item: BridgePinInventoryItem,
  verification: PinVerificationSummary | null,
  verifying: boolean,
): PinHealth {
  if (!item.pinned) return "missing";
  if (verification?.hasFailure) return "unreachable";
  if (verifying && (!verification || verification.incomplete))
    return "checking";
  if (!verification) return "saved";
  if (
    verification.reachable ||
    (!verification.hasFailure && verification.reachableRoots > 0)
  ) {
    return "saved";
  }
  return "unreachable";
}

function CardPoster({
  title,
  candidates,
}: {
  title: string;
  candidates: PreviewCandidate[];
}) {
  const candidateSeed = candidates
    .map((candidate) => `${candidate.kind}:${candidate.url}`)
    .join("\u0001");
  const [candidateState, setCandidateState] = useState(() => ({
    seed: candidateSeed,
    index: 0,
  }));
  const index =
    candidateState.seed === candidateSeed ? candidateState.index : 0;
  const active = candidates[index] ?? null;
  const fallbackImage =
    candidates.find(
      (candidate) =>
        candidate.kind === "IMAGE" && candidate.url !== active?.url,
    )?.url ?? null;

  const advanceCandidate = () =>
    setCandidateState((current) => ({
      seed: candidateSeed,
      index: current.seed === candidateSeed ? current.index + 1 : index + 1,
    }));

  if (!active) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[var(--color-subtle)]">
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  }

  if (active.kind === "VIDEO") {
    return (
      <video
        src={active.url}
        muted
        playsInline
        autoPlay
        loop
        controls
        poster={fallbackImage ?? undefined}
        preload="metadata"
        onError={advanceCandidate}
        className="h-full w-full object-cover transition-[filter,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:[filter:brightness(1.02)]"
      />
    );
  }

  if (active.kind === "HTML") {
    return (
      <iframe
        src={active.url}
        title={title}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        onError={advanceCandidate}
        className="h-full w-full border-0 bg-[var(--color-surface-alt)]"
      />
    );
  }

  if (active.kind === "AUDIO") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--color-surface-alt)] px-4">
        <audio
          src={active.url}
          controls
          preload="metadata"
          onError={advanceCandidate}
          className="w-full max-w-[16rem]"
        />
      </div>
    );
  }

  if (active.kind === "MODEL") {
    const modelCandidateUrls = candidates
      .filter(
        (candidate) =>
          candidate.kind === "MODEL" && candidate.url !== active.url,
      )
      .map((candidate) => candidate.url);
    return (
      <ModelMediaPreview
        src={active.url}
        candidates={modelCandidateUrls}
        poster={fallbackImage}
        alt={title}
        className="h-full w-full"
      />
    );
  }

  if (active.kind === "UNKNOWN") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--color-surface-alt)] px-4 text-center text-sm text-[var(--color-subtle)]">
        Preview unavailable for this file type.
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={active.url}
      alt={title}
      loading="lazy"
      onError={advanceCandidate}
      className="h-full w-full object-cover transition-[filter,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:[filter:brightness(1.02)]"
    />
  );
}

function HealthBadge({
  health,
  verification,
}: {
  health: PinHealth;
  verification: PinVerificationSummary | null;
}) {
  return (
    <span
      className={cn(
        "absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-medium",
        healthClass(health),
      )}
    >
      {healthIcon(health)}
      {healthLabel(health, verification)}
    </span>
  );
}

function resolveHref(primaryMatch: PinMatch | null) {
  if (primaryMatch?.slug) return `/archive/${primaryMatch.slug}`;
  return primaryMatch?.foundationUrl ?? null;
}

function buildPreviewCandidates(
  item: BridgePinInventoryItem,
  primaryMatch: PinMatch | null,
): PreviewCandidate[] {
  const mediaKind = normalizePreviewKind(item.mediaKind);
  const previewKind =
    mediaKind === "UNKNOWN"
      ? previewKindFromHints(
          item.label,
          item.title,
          item.syncPath,
          primaryMatch?.title,
        )
      : mediaKind;

  return buildInventoryPreviewCandidates({
    mediaKind: previewKind,
    posterUrl: primaryMatch?.posterUrl ?? null,
    previewLocalGatewayUrl: item.previewLocalGatewayUrl,
    previewPublicGatewayUrl: item.previewPublicGatewayUrl,
    localGatewayUrl: item.localGatewayUrl,
    publicGatewayUrl: item.publicGatewayUrl,
    utilityGatewayUrl: buildPublicUtilityGatewayUrl(item.mediaCid ?? item.cid),
  });
}

function buildTitle(
  item: BridgePinInventoryItem,
  primaryMatch: PinMatch | null,
) {
  return primaryMatch?.title ?? itemLabel(item);
}

function buildSubtitle(
  item: BridgePinInventoryItem,
  primaryMatch: PinMatch | null,
) {
  if (primaryMatch?.artistUsername) return `@${primaryMatch.artistUsername}`;
  if (primaryMatch?.artistName) return primaryMatch.artistName;
  return itemContext(item);
}

function CardMetaRow({
  item,
  primaryMatch,
  verification,
}: {
  item: BridgePinInventoryItem;
  primaryMatch: PinMatch | null;
  verification: PinVerificationSummary | null;
}) {
  const detailError = item.lastError ?? verification?.error ?? null;
  const metaLines = buildCardMetaLines({
    item,
    primaryMatch,
    verification,
  });

  return (
    <div className="mt-3 space-y-1 text-xs text-[var(--color-muted)]">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[0.7rem] break-all">
          {item.cid.slice(0, 14)}…{item.cid.slice(-6)}
        </span>
        {primaryMatch ? <ChainBadge chainId={primaryMatch.chainId} /> : null}
      </p>
      {metaLines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {detailError ? (
        <p className="line-clamp-2 text-[var(--color-err)]/90">{detailError}</p>
      ) : null}
    </div>
  );
}

function buildCardMetaLines(input: {
  item: BridgePinInventoryItem;
  primaryMatch: PinMatch | null;
  verification: PinVerificationSummary | null;
}) {
  const verifiedAt =
    input.verification?.checkedAt ?? input.item.lastVerifiedAt ?? null;
  const relatedRoots = pinItemCids(input.item);
  return [
    verifiedAt ? `Checked ${formatDate(verifiedAt)}` : null,
    relatedRoots.length > 1
      ? `${input.verification?.reachableRoots ?? 0}/${relatedRoots.length} linked roots`
      : null,
    input.primaryMatch
      ? `${shortAddress(input.primaryMatch.contractAddress)} #${input.primaryMatch.tokenId}`
      : null,
  ].filter((line): line is string => Boolean(line));
}

function CardActions({
  item,
  primaryMatch,
}: {
  item: BridgePinInventoryItem;
  primaryMatch: PinMatch | null;
}) {
  const utilityGatewayUrl = buildPublicUtilityGatewayUrl(
    item.mediaCid ?? item.cid,
  );
  const pills = [
    primaryMatch?.foundationUrl
      ? {
          href: primaryMatch.foundationUrl,
          label: "Foundation",
          external: true,
        }
      : null,
    item.localGatewayUrl
      ? { href: item.localGatewayUrl, label: "Desktop", external: true }
      : null,
    item.publicGatewayUrl
      ? { href: item.publicGatewayUrl, label: "Pinned", external: true }
      : null,
    utilityGatewayUrl
      ? { href: utilityGatewayUrl, label: "Public", external: true }
      : null,
  ].filter((value): value is NonNullable<typeof value> => Boolean(value));

  const uniquePills = Array.from(
    new Map(pills.map((pill) => [pill.href, pill])).values(),
  );

  if (uniquePills.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-1.5 text-[0.72rem]">
      {uniquePills.map((pill) => (
        <Link
          key={pill.href}
          href={pill.href}
          target={pill.external ? "_blank" : undefined}
          rel={pill.external ? "noreferrer" : undefined}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[var(--color-body)] hover:text-[var(--color-ink)]"
        >
          {pill.label}
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      ))}
    </div>
  );
}

export function PinWorkCard({
  item,
  matches,
  verification,
  verifying,
}: {
  item: BridgePinInventoryItem;
  matches: PinMatch[];
  verification: PinVerificationSummary | null;
  verifying: boolean;
}) {
  const primaryMatch = matches[0] ?? null;
  const title = buildTitle(item, primaryMatch);
  const subtitle = buildSubtitle(item, primaryMatch);
  const candidates = buildPreviewCandidates(item, primaryMatch);
  const health = pinHealthFor(item, verification, verifying);
  const href = resolveHref(primaryMatch);
  const isExternal = Boolean(href && !href.startsWith("/"));

  const poster = (
    <div className="relative block overflow-hidden rounded-sm bg-[var(--color-placeholder)]">
      <div className="relative aspect-square w-full overflow-hidden">
        <CardPoster title={title} candidates={candidates} />
      </div>
      <HealthBadge health={health} verification={verification} />
    </div>
  );

  return (
    <article className="group flex flex-col">
      {href ? (
        <Link
          href={href}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noreferrer" : undefined}
        >
          {poster}
        </Link>
      ) : (
        poster
      )}

      <div className="mt-4">
        <h3 className="truncate font-serif text-lg leading-tight text-[var(--color-ink)]">
          {href ? (
            <Link
              href={href}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noreferrer" : undefined}
              className="link-editorial title-variable"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>
        <p className="mt-1 truncate text-sm text-[var(--color-muted)]">
          {subtitle}
        </p>

        <CardMetaRow
          item={item}
          primaryMatch={primaryMatch}
          verification={verification}
        />
        <CardActions item={item} primaryMatch={primaryMatch} />
      </div>
    </article>
  );
}
