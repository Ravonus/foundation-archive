import Link from "next/link";

import { ProfileArchiveRequestButton } from "~/app/_components/profile/profile-archive-request-button";
import { ProfileHero } from "~/app/_components/profile/profile-hero";

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
  const { accountAddress, username, name, profileImageUrl, bio, coverImageUrl } =
    resolved;
  const displayName =
    name ?? (username ? `@${username}` : shortAddress(accountAddress));

  const aside = (
    <div className="rounded-[1.6rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <div className="grid grid-cols-2 gap-3">
        <ProfileStat label="On this page" value={counts.total} />
        <ProfileStat label="Saved" value={counts.saved} tone="ok" />
        <ProfileStat label="Syncing" value={counts.syncing} tone="warn" />
        <ProfileStat label="Found now" value={counts.found} tone="info" />
      </div>

      {marketSummary &&
      (marketSummary.listedCount > 0 || marketSummary.rescuableCount > 0) ? (
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

      <div className="mt-5">
        <ProfileArchiveRequestButton
          accountAddress={accountAddress}
          username={username}
          label={name ?? username}
        />
      </div>
    </div>
  );

  return (
    <ProfileHero
      name={displayName}
      eyebrow="Artist profile"
      usernameBadge={username ? `@${username}` : undefined}
      subtitle={shortAddress(accountAddress)}
      avatarUrl={profileImageUrl}
      avatarLabel={name ?? username ?? accountAddress}
      bannerUrl={coverImageUrl}
      bio={
        bio ??
        "This page blends the live Foundation profile with archive activity, so works can move from found to syncing to saved without you having to reload."
      }
      foundationUrl={foundationUrl}
      aside={aside}
    />
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
