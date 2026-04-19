"use client";

import Link from "next/link";
import { useMemo } from "react";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";

import { formatDate, shortAddress } from "~/lib/utils";
import type { BridgePinInventoryItem } from "~/app/_components/desktop-bridge-provider";
import { buildPublicUtilityGatewayUrl } from "~/lib/desktop-relay";
import { ChainBadge } from "~/app/_components/chain-badge";

import { InventoryPreview } from "./inventory-preview";
import { itemContext, itemLabel, type PinMatch } from "../types";

function CardHeader({
  title,
  subtitle,
  pinned,
}: {
  title: string;
  subtitle: string;
  pinned: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-serif text-xl text-[var(--color-ink)]">
          {title}
        </p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p>
      </div>
      <span
        className={`inline-flex shrink-0 rounded-full px-3 py-1 text-[0.68rem] tracking-[0.22em] uppercase ${
          pinned
            ? "bg-[var(--tint-ok)] text-[var(--color-ok)]"
            : "bg-[var(--tint-warn)] text-[var(--color-warn)]"
        }`}
      >
        {pinned ? "Saved" : "Needs attention"}
      </span>
    </div>
  );
}

function CardMeta({
  item,
  primaryMatch,
}: {
  item: BridgePinInventoryItem;
  primaryMatch: PinMatch | null;
}) {
  return (
    <div className="mt-4 space-y-2 text-sm text-[var(--color-body)]">
      <p className="font-mono text-[0.78rem] break-all text-[var(--color-muted)]">
        {item.cid}
      </p>
      <p>Verified {formatDate(item.lastVerifiedAt)}</p>
      {item.syncPath ? <p>Saved in {item.syncPath}</p> : null}
      {primaryMatch ? (
        <p className="flex flex-wrap items-center gap-2">
          <ChainBadge chainId={primaryMatch.chainId} />
          <span>
            Foundation: {shortAddress(primaryMatch.contractAddress)} #
            {primaryMatch.tokenId}
          </span>
        </p>
      ) : (
        <p>Independent IPFS root</p>
      )}
      {item.lastError ? (
        <p className="text-[var(--color-err)]/90">{item.lastError}</p>
      ) : null}
    </div>
  );
}

function PillLink({
  href,
  label,
  external,
}: {
  href: string;
  label: string;
  external?: boolean;
}) {
  const classes =
    "inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[var(--color-body)] hover:text-[var(--color-ink)]";

  if (external) {
    return (
      <Link href={href} target="_blank" rel="noreferrer" className={classes}>
        {label}
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    );
  }

  return (
    <Link href={href} className={classes}>
      {label}
      <ArrowUpRight className="h-3 w-3" />
    </Link>
  );
}

function CardActions({
  item,
  primaryMatch,
}: {
  item: BridgePinInventoryItem;
  primaryMatch: PinMatch | null;
}) {
  const publicUtilityGatewayUrl = buildPublicUtilityGatewayUrl(item.cid);
  const actions = [
    primaryMatch
      ? { href: `/archive/${primaryMatch.slug}`, label: "Archive entry" }
      : null,
    primaryMatch?.foundationUrl
      ? {
          href: primaryMatch.foundationUrl,
          label: "Foundation page",
          external: true,
        }
      : null,
    item.localGatewayUrl
      ? { href: item.localGatewayUrl, label: "Desktop IPFS", external: true }
      : null,
    item.publicGatewayUrl
      ? { href: item.publicGatewayUrl, label: "Pinned IPFS", external: true }
      : null,
    { href: publicUtilityGatewayUrl, label: "Public IPFS", external: true },
  ].filter((value): value is NonNullable<typeof value> => Boolean(value));

  const uniqueActions = Array.from(
    new Map(actions.map((action) => [action.href, action])).values(),
  );

  return (
    <div className="mt-4 flex flex-wrap gap-2 text-xs">
      {uniqueActions.map((action) => (
        <PillLink
          key={action.href}
          href={action.href}
          label={action.label}
          external={action.external}
        />
      ))}
    </div>
  );
}

function useInventoryCardContent(
  item: BridgePinInventoryItem,
  primaryMatch: PinMatch | null,
) {
  const title = primaryMatch?.title ?? itemLabel(item);
  const subtitle = primaryMatch?.artistUsername
    ? `@${primaryMatch.artistUsername}`
    : (primaryMatch?.artistName ?? itemContext(item));
  const previewCandidates = useMemo(
    () =>
      Array.from(
        new Set(
          [
            primaryMatch?.posterUrl ?? null,
            item.previewLocalGatewayUrl ?? null,
            item.previewPublicGatewayUrl ?? null,
            item.mediaCid ? buildPublicUtilityGatewayUrl(item.mediaCid) : null,
            item.localGatewayUrl ?? null,
            item.publicGatewayUrl ?? null,
            buildPublicUtilityGatewayUrl(item.cid),
          ].filter((value): value is string => Boolean(value)),
        ),
      ),
    [
      item.cid,
      item.mediaCid,
      item.localGatewayUrl,
      item.publicGatewayUrl,
      item.previewLocalGatewayUrl,
      item.previewPublicGatewayUrl,
      primaryMatch?.posterUrl,
    ],
  );

  return { title, subtitle, previewCandidates };
}

export function InventoryCard({
  item,
  matches,
}: {
  item: BridgePinInventoryItem;
  matches: PinMatch[];
}) {
  const primaryMatch = matches[0] ?? null;
  const { title, subtitle, previewCandidates } = useInventoryCardContent(
    item,
    primaryMatch,
  );

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="rounded-[1.6rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[0_18px_70px_-50px_rgba(17,17,17,0.45)]"
    >
      <CardHeader title={title} subtitle={subtitle} pinned={item.pinned} />
      <InventoryPreview title={title} previewCandidates={previewCandidates} />
      <CardMeta item={item} primaryMatch={primaryMatch} />
      <CardActions item={item} primaryMatch={primaryMatch} />
    </motion.article>
  );
}
