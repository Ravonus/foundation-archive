import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import { ProfileAvatar } from "~/app/_components/profile/profile-avatar";
import { ProfileBanner } from "~/app/_components/profile/profile-banner";

type ProfileHeroProps = {
  name: string;
  nameHref?: string;
  eyebrow?: string;
  usernameBadge?: string;
  subtitle?: string;
  avatarUrl: string | null;
  avatarLabel: string;
  /// Stable handle/wallet/name used to seed the placeholder banner +
  /// avatar gradient when Foundation has no cover/avatar on file.
  /// Falls back to `name`.
  seed?: string;
  bannerUrl: string | null;
  bio?: string | null;
  foundationUrl?: string | null;
  foundationLabel?: string;
  footer?: ReactNode;
  aside?: ReactNode;
  className?: string;
};

/// Combined banner + avatar hero, used on profile and archive-item pages.
/// Renders entirely on the server so crawlers can pick up the text info
/// and the og:image URL without needing JS. The ProfileAvatar child is a
/// client island only for the image-error fallback; the surrounding layout
/// is static markup.
// eslint-disable-next-line complexity
export function ProfileHero(props: ProfileHeroProps) {
  const {
    name,
    nameHref,
    eyebrow,
    usernameBadge,
    subtitle,
    avatarUrl,
    avatarLabel,
    seed,
    bannerUrl,
    bio,
    foundationUrl,
    foundationLabel = "Foundation",
    footer,
    aside,
    className,
  } = props;

  const resolvedSeed = seed ?? name;
  const hasProfileBadges = Boolean(usernameBadge) || Boolean(subtitle);

  return (
    <section
      className={
        "overflow-hidden rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_30px_90px_-70px_rgba(17,17,17,0.35)] sm:rounded-[2.25rem] " +
        (className ?? "")
      }
    >
      <div className="relative h-40 w-full overflow-hidden bg-[var(--color-surface-alt)] sm:h-56">
        <ProfileBanner imageUrl={bannerUrl} seed={resolvedSeed} />
      </div>

      <div className="relative grid gap-8 px-6 pb-6 sm:px-8 sm:pb-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,360px)]">
        <div className="min-w-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
            <ProfileAvatar
              imageUrl={avatarUrl}
              label={avatarLabel}
              seed={resolvedSeed}
              className="-mt-16 h-28 w-28 shrink-0 rounded-full border-4 border-[var(--color-surface)] bg-[var(--color-surface)] shadow-[0_12px_40px_-20px_rgba(17,17,17,0.6)] sm:-mt-20 sm:h-32 sm:w-32"
              textClassName="text-lg"
            />
            <div className="min-w-0 pt-2">
              <div className="flex flex-wrap items-center gap-3 text-[0.68rem] tracking-[0.24em] text-[var(--color-muted)] uppercase">
                {eyebrow ? <span>{eyebrow}</span> : null}
                {foundationUrl ? (
                  <Link
                    href={foundationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[var(--color-ink)]/80 transition hover:text-[var(--color-ink)]"
                  >
                    {foundationLabel}
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                ) : null}
              </div>

              <h1 className="mt-2 font-serif text-3xl leading-tight text-[var(--color-ink)] sm:text-4xl">
                {nameHref ? (
                  <Link
                    href={nameHref}
                    className="transition hover:text-[var(--color-accent)]"
                  >
                    {name}
                  </Link>
                ) : (
                  name
                )}
              </h1>

              {hasProfileBadges ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--color-muted)]">
                  {usernameBadge ? (
                    <span className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface-quiet)] px-3 py-1.5">
                      {usernameBadge}
                    </span>
                  ) : null}
                  {subtitle ? (
                    <span className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface-quiet)] px-3 py-1.5">
                      {subtitle}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {bio ? (
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--color-body)]">
                  {bio}
                </p>
              ) : null}
            </div>
          </div>

          {footer ? <div className="mt-6">{footer}</div> : null}
        </div>

        {aside ? <div className="relative lg:pt-2">{aside}</div> : null}
      </div>
    </section>
  );
}
