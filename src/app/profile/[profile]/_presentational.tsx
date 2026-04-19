import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { ProfileAvatar } from "~/app/_components/profile/profile-avatar";
import { ProfileArchiveRequestButton } from "~/app/_components/profile/profile-archive-request-button";

import { type ProfileItemCounts, type ResolvedProfile } from "./_types";

type ProfileHeaderProps = {
  resolved: ResolvedProfile;
  counts: ProfileItemCounts;
  foundationUrl: string;
  marketSummary?: { listedCount: number; rescuableCount: number };
};

export function ProfileHeader({
  resolved,
  counts,
  foundationUrl,
  marketSummary,
}: ProfileHeaderProps) {
  const {
    accountAddress,
    username,
    name,
    profileImageUrl,
    bio,
    coverImageUrl,
  } = resolved;
  const displayName = name ?? (username ? `@${username}` : shortAddress(accountAddress));

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_30px_90px_-70px_rgba(17,17,17,0.35)] sm:rounded-[2.25rem]">
      {coverImageUrl ? (
        <div className="absolute inset-x-0 top-0 h-40 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverImageUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover opacity-25"
          />
        </div>
      ) : null}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(198,162,88,0.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_42%)]" />

      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,360px)]">
        <div className="min-w-0">
          <div className="flex items-start gap-5">
            <ProfileAvatar
              imageUrl={profileImageUrl}
              label={name ?? username ?? accountAddress}
              className="h-24 w-24 shrink-0 ring-1 ring-white/40"
              textClassName="text-base"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3 text-[0.68rem] uppercase tracking-[0.24em] text-[var(--color-muted)]">
                <span>Artist profile</span>
                <Link
                  href={foundationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[var(--color-ink)]/80 transition hover:text-[var(--color-ink)]"
                >
                  Foundation
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>

              <h1 className="mt-3 font-serif text-4xl leading-tight text-[var(--color-ink)] sm:text-5xl">
                {displayName}
              </h1>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--color-muted)]">
                {username ? (
                  <span className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface-quiet)] px-3 py-1.5">
                    @{username}
                  </span>
                ) : null}
                <span
                  title={accountAddress}
                  className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface-quiet)] px-3 py-1.5"
                >
                  {shortAddress(accountAddress)}
                </span>
              </div>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--color-body)]">
                {bio ??
                  "This page blends the live Foundation profile with archive activity, so works can move from found to syncing to saved without you having to reload."}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[1.6rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <div className="grid grid-cols-2 gap-3">
            <ProfileStat label="On this page" value={counts.total} />
            <ProfileStat label="Saved" value={counts.saved} tone="ok" />
            <ProfileStat label="Syncing" value={counts.syncing} tone="warn" />
            <ProfileStat label="Found now" value={counts.found} tone="info" />
          </div>

          {marketSummary &&
          (marketSummary.listedCount > 0 ||
            marketSummary.rescuableCount > 0) ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[1.1rem] border border-[var(--color-line)] bg-[var(--color-surface-quiet)] px-4 py-3 text-xs text-[var(--color-body)]">
              {marketSummary.listedCount > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-info)]"
                  />
                  {marketSummary.listedCount} currently listed
                </span>
              ) : null}
              {marketSummary.rescuableCount > 0 ? (
                <>
                  {marketSummary.listedCount > 0 ? (
                    <span aria-hidden className="text-[var(--color-muted)]">
                      ·
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5 text-[var(--color-brand-green)]">
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-1.5 rounded-full bg-current"
                    />
                    {marketSummary.rescuableCount} awaiting rescue
                  </span>
                </>
              ) : null}
            </div>
          ) : null}

          <p className="mt-4 text-sm leading-relaxed text-[var(--color-muted)]">
            Saved works, in-flight archive jobs, and newly found Foundation pieces all stay in one feed here.
          </p>

          <div className="mt-5">
            <ProfileArchiveRequestButton
              accountAddress={accountAddress}
              username={username}
              label={name ?? username}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function shortAddress(accountAddress: string) {
  return `${accountAddress.slice(0, 6)}...${accountAddress.slice(-4)}`;
}

function ProfileStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "ok" | "warn" | "info";
}) {
  const toneClass =
    tone === "ok"
      ? "text-[var(--color-ok)]"
      : tone === "warn"
        ? "text-[var(--color-warn)]"
        : tone === "info"
          ? "text-[var(--color-info)]"
          : "text-[var(--color-ink)]";

  return (
    <div className="rounded-[1.1rem] border border-[var(--color-line)] bg-[var(--color-surface-quiet)] px-4 py-3">
      <p className="text-[0.68rem] uppercase tracking-[0.2em] text-[var(--color-muted)]">
        {label}
      </p>
      <p className={`mt-2 font-serif text-3xl ${toneClass}`}>{value}</p>
    </div>
  );
}

type ViewTabsProps = {
  profile: string;
  view: string;
  counts: ProfileItemCounts;
};

export function ViewTabs({
  profile,
  view,
  counts,
}: ViewTabsProps) {
  const options = [
    {
      value: "all",
      label: `All works (${counts.total})`,
      hint: "Everything currently visible for this artist.",
    },
    {
      value: "saved",
      label: `Saved (${counts.saved})`,
      hint: "Fully preserved on the archive server.",
    },
    {
      value: "syncing",
      label: `Syncing (${counts.syncing})`,
      hint: "Already in the archive pipeline or waiting on final steps.",
    },
    {
      value: "found",
      label: `Found here (${counts.found})`,
      hint: "Seen on Foundation right now but not yet pulled into the archive.",
    },
  ];
  const activeClass =
    "rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)] shadow-[0_12px_30px_-24px_rgba(17,17,17,0.9)]";
  const inactiveClass =
    "rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-muted)] transition hover:border-[var(--color-line)] hover:text-[var(--color-ink)]";

  return (
    <section
      className="mt-8 flex flex-wrap items-center gap-3"
      role="tablist"
      aria-label="Filter works"
    >
      {options.map((option) => {
        const active = option.value === view;
        return (
          <Link
            key={option.value}
            href={`/profile/${encodeURIComponent(profile)}?view=${option.value}`}
            className={active ? activeClass : inactiveClass}
            role="tab"
            aria-selected={active}
            title={option.hint}
          >
            {option.label}
          </Link>
        );
      })}
    </section>
  );
}
