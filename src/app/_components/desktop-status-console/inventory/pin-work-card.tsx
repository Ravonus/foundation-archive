"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ImageIcon,
  Loader2,
  Radio,
} from "lucide-react";

import type {
  BridgePinInventoryItem,
  PinVerificationResult,
} from "~/app/_components/desktop-bridge-provider";
import { cn, formatDate, shortAddress } from "~/lib/utils";

import { itemContext, itemLabel, type PinMatch } from "../types";

export type PinHealth = "saved" | "unreachable" | "checking" | "missing";

const EASE = [0.22, 1, 0.36, 1] as const;

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
  verification: PinVerificationResult | null,
) {
  switch (health) {
    case "saved":
      return verification && verification.providerCount > 0
        ? `${verification.providerCount} on network`
        : "Saved";
    case "unreachable":
      return "Not on network";
    case "checking":
      return "Checking network…";
    case "missing":
      return "Needs saving";
  }
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
  verification: PinVerificationResult | null,
  verifying: boolean,
): PinHealth {
  if (!item.pinned) return "missing";
  if (verifying && !verification) return "checking";
  if (!verification) return "saved";
  if (verification.reachable && verification.providerCount > 0) return "saved";
  return "unreachable";
}

function CardPoster({
  title,
  candidates,
}: {
  title: string;
  candidates: string[];
}) {
  const candidateSeed = candidates.join("\u0001");
  const [candidateState, setCandidateState] = useState(() => ({
    seed: candidateSeed,
    index: 0,
  }));
  const index =
    candidateState.seed === candidateSeed ? candidateState.index : 0;

  const active = candidates[index] ?? null;

  if (!active) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[var(--color-subtle)]">
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={active}
      alt={title}
      loading="lazy"
      onError={() =>
        setCandidateState((current) => ({
          seed: candidateSeed,
          index: current.seed === candidateSeed ? current.index + 1 : index + 1,
        }))
      }
      className="h-full w-full object-cover transition-[filter,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:[filter:brightness(1.02)]"
    />
  );
}

function HealthBadge({
  health,
  verification,
}: {
  health: PinHealth;
  verification: PinVerificationResult | null;
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
): string[] {
  return Array.from(
    new Set(
      [
        primaryMatch?.posterUrl ?? null,
        item.localGatewayUrl ?? null,
        item.publicGatewayUrl ?? null,
      ].filter((value): value is string => Boolean(value)),
    ),
  );
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

function cardVariants(largeGrid: boolean) {
  return {
    hidden: largeGrid ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: largeGrid ? 0.2 : 0.6,
        ease: EASE,
      },
    },
  };
}

function CardMetaRow({
  item,
  primaryMatch,
  verification,
}: {
  item: BridgePinInventoryItem;
  primaryMatch: PinMatch | null;
  verification: PinVerificationResult | null;
}) {
  const verifiedAt = verification?.checkedAt ?? item.lastVerifiedAt ?? null;

  return (
    <div className="mt-3 space-y-1 text-xs text-[var(--color-muted)]">
      <p className="font-mono text-[0.7rem] break-all">
        {item.cid.slice(0, 14)}…{item.cid.slice(-6)}
      </p>
      {verifiedAt ? <p>Checked {formatDate(verifiedAt)}</p> : null}
      {primaryMatch ? (
        <p>
          {shortAddress(primaryMatch.contractAddress)} #{primaryMatch.tokenId}
        </p>
      ) : null}
      {item.lastError ? (
        <p className="line-clamp-1 text-[var(--color-err)]/90">
          {item.lastError}
        </p>
      ) : null}
    </div>
  );
}

function CardActions({
  item,
  primaryMatch,
}: {
  item: BridgePinInventoryItem;
  primaryMatch: PinMatch | null;
}) {
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
      ? { href: item.publicGatewayUrl, label: "Public", external: true }
      : null,
  ].filter((value): value is NonNullable<typeof value> => Boolean(value));

  if (pills.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-1.5 text-[0.72rem]">
      {pills.map((pill) => (
        <Link
          key={pill.label}
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
  largeGrid = false,
}: {
  item: BridgePinInventoryItem;
  matches: PinMatch[];
  verification: PinVerificationResult | null;
  verifying: boolean;
  largeGrid?: boolean;
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
    <motion.article
      variants={cardVariants(largeGrid)}
      className="group flex flex-col"
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "420px 540px",
      }}
    >
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
    </motion.article>
  );
}
