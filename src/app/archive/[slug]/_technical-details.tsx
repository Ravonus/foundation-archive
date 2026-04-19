"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, ChevronDown } from "lucide-react";

import { CopyButton } from "~/app/_components/copy-button";
import { formatDate } from "~/lib/utils";
import { parseIpfsReference } from "~/server/archive/ipfs";
import type { Prisma } from "~/server/prisma-client";

const EASE = [0.22, 1, 0.36, 1] as const;

type ArtworkWithRelations = Prisma.ArtworkGetPayload<{
  include: {
    contract: true;
    metadataRoot: true;
    mediaRoot: true;
    backups: true;
  };
}>;

type IpfsRoot = NonNullable<ArtworkWithRelations["metadataRoot"]>;
type BackupRun = ArtworkWithRelations["backups"][number];

export type RootCardItem = {
  label: string;
  root: IpfsRoot | null;
  status: string;
  localUrl: string | null;
  originalUrl: string | null;
};

export type DependencyFlowItem = {
  key: string;
  relativePath: string;
  localUrl: string;
  gatewayUrl: string;
  sourceType: string;
  discoveredFrom: string;
  depth: number;
  status: string;
};

export type DependencyFlowCard = {
  label: string;
  state: "verified" | "needs-check" | "needs-attention";
  summary: string;
  items: DependencyFlowItem[];
};

const SMALL_PILL_STRONG =
  "inline-flex items-center gap-1 rounded-full border border-[var(--color-line-strong)] px-3 py-1 text-xs text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)]";
const SMALL_PILL_MUTED =
  "inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] px-3 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]";

function SmallPill(props: {
  href: string | null;
  label: string;
  className: string;
  rel?: string;
}) {
  if (!props.href) return null;
  return (
    <Link
      href={props.href}
      target="_blank"
      rel={props.rel}
      className={props.className}
    >
      {props.label}
      <ArrowUpRight aria-hidden className="h-3 w-3" />
    </Link>
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

function RootCardDetails({
  root,
  localUrl,
}: {
  root: IpfsRoot;
  localUrl: string | null;
}) {
  const originalReference = root.originalUrl
    ? parseIpfsReference(root.originalUrl, root.kind)
    : null;
  return (
    <dl className="mt-4 space-y-3 text-sm">
      <div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-[var(--color-muted)]">CID</dt>
          <CopyButton value={root.cid} label="Copy" copiedLabel="Copied" />
        </div>
        <dd className="mt-1 font-mono text-xs break-all text-[var(--color-ink)]">
          {root.cid}
        </dd>
      </div>
      {originalReference ? (
        <div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Original CID</dt>
            <CopyButton
              value={originalReference.originalCid}
              label="Copy"
              copiedLabel="Copied"
            />
          </div>
          <dd className="mt-1 font-mono text-xs break-all text-[var(--color-ink)]">
            {originalReference.originalCid}
          </dd>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <MetaItem label="Version">v{root.cidVersion}</MetaItem>
        <div>
          <dt className="text-[var(--color-muted)]">Path</dt>
          <dd className="mt-1 truncate text-[var(--color-ink)]">
            {root.relativePath ?? "None"}
          </dd>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
        <SmallPill
          href={localUrl}
          label="Agorix gateway"
          className={SMALL_PILL_STRONG}
        />
        <SmallPill
          href={root.gatewayUrl}
          label="Public IPFS"
          className={SMALL_PILL_MUTED}
          rel="noreferrer"
        />
      </div>
    </dl>
  );
}

function RootCard({ item }: { item: RootCardItem }) {
  return (
    <div className="rounded-sm border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-[var(--color-ink)]">
          {item.label} root
        </h3>
        <span className="text-xs text-[var(--color-muted)]">
          {item.status.toLowerCase()}
        </span>
      </div>
      {item.root ? (
        <RootCardDetails root={item.root} localUrl={item.localUrl} />
      ) : (
        <div className="mt-4 space-y-3 text-sm text-[var(--color-muted)]">
          <p>No IPFS root discovered.</p>
          <SmallPill
            href={item.originalUrl}
            label={`Open original ${item.label.toLowerCase()}`}
            className={SMALL_PILL_MUTED}
            rel="noreferrer"
          />
        </div>
      )}
    </div>
  );
}

function BackupRow({ run }: { run: BackupRun }) {
  return (
    <tr className="border-t border-[var(--color-line)] bg-[var(--color-surface)]">
      <td className="px-4 py-2.5 text-[var(--color-ink)]">{run.action}</td>
      <td className="px-4 py-2.5 text-[var(--color-body)]">
        {run.status.toLowerCase()}
      </td>
      <td className="px-4 py-2.5 text-[var(--color-body)]">
        {run.provider.toLowerCase()}
      </td>
      <td className="px-4 py-2.5 text-[var(--color-muted)]">
        {formatDate(run.finishedAt)}
      </td>
    </tr>
  );
}

function BackupHistory({ backups }: { backups: BackupRun[] }) {
  if (backups.length === 0) return null;
  return (
    <div className="mt-8">
      <h3 className="font-medium text-[var(--color-ink)]">Backup history</h3>
      <div className="mt-3 overflow-hidden rounded-sm border border-[var(--color-line)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-alt)] text-left text-xs tracking-wide text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Provider</th>
              <th className="px-4 py-2 font-medium">Finished</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((run) => (
              <BackupRow key={run.id} run={run} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function flowStateClass(state: DependencyFlowCard["state"]) {
  switch (state) {
    case "verified":
      return "text-[var(--color-ok)]";
    case "needs-attention":
      return "text-[var(--color-err)]";
    case "needs-check":
      return "text-[var(--color-warn)]";
  }
}

function DependencyFlowPanel({ flow }: { flow: DependencyFlowCard }) {
  return (
    <div className="rounded-sm border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-[var(--color-ink)]">
          {flow.label} flow
        </h3>
        <span className={`text-xs ${flowStateClass(flow.state)}`}>
          {flow.state === "verified"
            ? "verified"
            : flow.state === "needs-attention"
              ? "needs attention"
              : "needs check"}
        </span>
      </div>
      <p className="mt-3 text-sm text-[var(--color-body)]">{flow.summary}</p>
      {flow.items.length > 0 ? (
        <div className="mt-4 space-y-2">
          {flow.items.map((item) => (
            <div
              key={item.key}
              className="rounded-sm border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm"
              style={{ marginLeft: `${item.depth * 10}px` }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <code className="min-w-0 truncate text-xs text-[var(--color-ink)]">
                  {item.relativePath}
                </code>
                <span className="text-[0.7rem] text-[var(--color-muted)]">
                  {item.status.toLowerCase()}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.7rem] text-[var(--color-muted)]">
                <span>{item.sourceType}</span>
                <span>from {item.discoveredFrom}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <SmallPill
                  href={item.localUrl}
                  label="Agorix gateway"
                  className={SMALL_PILL_STRONG}
                />
                <SmallPill
                  href={item.gatewayUrl}
                  label="Public IPFS"
                  className={SMALL_PILL_MUTED}
                  rel="noreferrer"
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          No linked files were discovered for this root.
        </p>
      )}
    </div>
  );
}

export function TechnicalDetails({
  rootItems,
  backups,
  dependencyFlows,
  historySlot,
  defaultOpen = false,
}: {
  rootItems: RootCardItem[];
  backups: BackupRun[];
  dependencyFlows: DependencyFlowCard[];
  historySlot?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mt-16 border-t border-[var(--color-line)] pt-8">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="group inline-flex items-center gap-2 text-sm text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
      >
        <span>{open ? "Hide details" : "More details"}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="inline-flex"
          aria-hidden
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="technical-details"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{
              opacity: { duration: 0.35, ease: EASE },
              height: { duration: 0.5, ease: EASE },
            }}
            className="overflow-hidden"
          >
            <div className="pt-6">
              {historySlot}
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                {rootItems.map((item) => (
                  <RootCard key={item.label} item={item} />
                ))}
              </div>
              {dependencyFlows.length > 0 ? (
                <div className="mt-6 grid gap-6 md:grid-cols-2">
                  {dependencyFlows.map((flow) => (
                    <DependencyFlowPanel key={flow.label} flow={flow} />
                  ))}
                </div>
              ) : null}
              <BackupHistory backups={backups} />
              <p className="mt-8 text-xs text-[var(--color-muted)]">
                These links are just for previewing the file. What&apos;s
                actually saved is the original file, which lives on IPFS and can
                always be fetched using its content ID (CID).
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
