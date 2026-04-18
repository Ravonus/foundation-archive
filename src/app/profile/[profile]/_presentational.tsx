import Link from "next/link";

import { ProfileAvatar } from "~/app/_components/profile/profile-avatar";
import { ProfileArchiveRequestButton } from "~/app/_components/profile/profile-archive-request-button";

import { type ResolvedProfile } from "./_types";

type ProfileHeaderProps = {
  resolved: ResolvedProfile;
  worksCount: number;
  onServerCount: number;
  missingCount: number;
  foundationUrl: string;
};

export function ProfileHeader({
  resolved,
  worksCount,
  onServerCount,
  missingCount,
  foundationUrl,
}: ProfileHeaderProps) {
  const { accountAddress, username, name, profileImageUrl } = resolved;

  return (
    <section className="rounded-2xl border border-[var(--color-line)] bg-[linear-gradient(180deg,var(--color-surface),var(--color-surface-quiet))] p-6 shadow-[0_30px_90px_-70px_rgba(17,17,17,0.35)] sm:rounded-3xl sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-5">
          <ProfileAvatar
            imageUrl={profileImageUrl}
            label={name ?? username ?? accountAddress}
            className="h-20 w-20"
            textClassName="text-sm"
          />
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
              Artist profile
            </p>
            <h1 className="mt-2 font-serif text-4xl text-[var(--color-ink)]">
              {name ?? (username ? `@${username}` : accountAddress)}
            </h1>
            {username ? (
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                @{username}
              </p>
            ) : null}
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)]">
              See which of this artist&apos;s works are already saved, which
              are still being processed, and ask us to save any you care about
              sooner.
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-[var(--color-muted)]">
              <span title="Total works found on Foundation for this artist.">
                {worksCount} works found
              </span>
              <span title="Fully saved to the archive.">
                {onServerCount} saved
              </span>
              <span title="Tracked but not yet saved.">
                {missingCount} not saved yet
              </span>
              <Link
                href={foundationUrl}
                target="_blank"
                rel="noreferrer"
                className="link-editorial hover:text-[var(--color-ink)]"
              >
                View on Foundation
              </Link>
            </div>
          </div>
        </div>

        <ProfileArchiveRequestButton
          accountAddress={accountAddress}
          username={username}
          label={name ?? username}
        />
      </div>
    </section>
  );
}

type ViewTabsProps = {
  profile: string;
  view: string;
  worksCount: number;
  onServerCount: number;
  missingCount: number;
};

export function ViewTabs({
  profile,
  view,
  worksCount,
  onServerCount,
  missingCount,
}: ViewTabsProps) {
  const options = [
    {
      value: "all",
      label: `All works (${worksCount})`,
      hint: "Every work we've found for this artist.",
    },
    {
      value: "on-server",
      label: `Saved (${onServerCount})`,
      hint: "Works already fully saved to the archive.",
    },
    {
      value: "not-yet",
      label: `Not saved yet (${missingCount})`,
      hint: "Works we've tracked but haven't saved yet.",
    },
  ];
  const activeClass =
    "rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)]";
  const inactiveClass =
    "rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]";

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
