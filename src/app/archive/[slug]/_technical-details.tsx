import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import { CopyButton } from "~/app/_components/copy-button";
import { formatDate } from "~/lib/utils";
import { parseIpfsReference } from "~/server/archive/ipfs";
import type { Prisma } from "~/server/prisma-client";

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
          label="Verify server copy"
          className={SMALL_PILL_STRONG}
        />
        <SmallPill
          href={root.gatewayUrl}
          label="Public gateway"
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

export function TechnicalDetails({
  rootItems,
  backups,
}: {
  rootItems: RootCardItem[];
  backups: BackupRun[];
}) {
  return (
    <details className="mt-16 border-t border-[var(--color-line)] pt-8">
      <summary className="cursor-pointer list-none text-sm text-[var(--color-muted)] select-none hover:text-[var(--color-ink)]">
        <span className="inline-flex items-center gap-2">
          Technical details{" "}
          <ArrowUpRight
            aria-hidden
            className="h-3 w-3 -rotate-45 transition group-open:rotate-0"
          />
        </span>
      </summary>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {rootItems.map((item) => (
          <RootCard key={item.label} item={item} />
        ))}
      </div>
      <BackupHistory backups={backups} />
      <p className="mt-8 text-xs text-[var(--color-muted)]">
        These links are just for previewing the file. What&apos;s actually saved
        is the original file, which lives on IPFS and can always be fetched
        using its content ID (CID).
      </p>
    </details>
  );
}
