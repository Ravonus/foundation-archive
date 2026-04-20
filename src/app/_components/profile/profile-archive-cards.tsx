"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AlertCircle, ArrowUpRight, CheckCircle2, LoaderCircle, Plus, X } from "lucide-react";

import { cn } from "~/lib/utils";

import { ProfileAvatar } from "~/app/_components/profile/profile-avatar";
import { api } from "~/trpc/react";

export interface ProfileArchivePinnedWork {
  id: string;
  title: string;
  slug: string | null;
  archiveUrl: string | null;
  publicGatewayUrl: string | null;
}

export interface ProfileArchiveItem {
  accountAddress: string;
  foundationUrl: string;
  name: string | null;
  profileImageUrl: string | null;
  username: string | null;
  discoveredCount: number;
  archivedCount: number;
  pinnedCount: number;
  offChainCount: number;
  pinnedWorks: ProfileArchivePinnedWork[];
}

export function ProfileArchiveCards({
  profiles,
}: {
  profiles: ProfileArchiveItem[];
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [feedback, setFeedback] = useState<
    { tone: "success" | "error"; message: string } | null
  >(null);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const id = window.setTimeout(() => setFeedback(null), 6000);
    return () => window.clearTimeout(id);
  }, [feedback]);

  const refresh = () =>
    startRefresh(() => {
      router.refresh();
    });

  const mutation = api.archive.requestProfileArchive.useMutation({
    onSuccess: (result) => {
      setFeedback({
        tone: "success",
        message: `Added ${result.queuedWorks} work${result.queuedWorks === 1 ? "" : "s"} from ${result.label} to the line. ${result.alreadyPinnedWorks} already saved.`,
      });
      setActiveProfile(null);
      refresh();
    },
    onError: (error) => {
      setFeedback({
        tone: "error",
        message: error.message || "Something went wrong. Please try again.",
      });
      setActiveProfile(null);
    },
  });

  if (profiles.length === 0) return null;

  const onPreserve = (profile: ProfileArchiveItem) => {
    setActiveProfile(profile.accountAddress);
    mutation.mutate({
      accountAddress: profile.accountAddress,
      username: profile.username ?? undefined,
      label: profile.name ?? profile.username ?? undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {feedback?.message ?? ""}
      </div>
      {feedback ? (
        <div
          role={feedback.tone === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm",
            feedback.tone === "error"
              ? "border-[var(--color-err)]/40 bg-[var(--tint-err)] text-[var(--color-err)]"
              : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-body)]",
          )}
        >
          <span className="flex items-start gap-2">
            {feedback.tone === "error" ? (
              <AlertCircle
                aria-hidden
                className="mt-0.5 h-4 w-4 shrink-0"
              />
            ) : (
              <CheckCircle2
                aria-hidden
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ok)]"
              />
            )}
            <span>{feedback.message}</span>
          </span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setFeedback(null)}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-current hover:opacity-70"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {profiles.map((profile) => {
          const isSubmitting =
            activeProfile === profile.accountAddress &&
            (mutation.isPending || isRefreshing);
          return (
            <ProfileCard
              key={profile.accountAddress}
              profile={profile}
              isSubmitting={isSubmitting}
              onPreserve={onPreserve}
            />
          );
        })}
      </div>

      <PinnedWorksList profiles={profiles} />
    </div>
  );
}

function ProfileCard({
  profile,
  isSubmitting,
  onPreserve,
}: {
  profile: ProfileArchiveItem;
  isSubmitting: boolean;
  onPreserve: (profile: ProfileArchiveItem) => void;
}) {
  const displayName =
    profile.name ?? profile.username ?? profile.accountAddress;
  const preservedAll =
    profile.discoveredCount > 0 &&
    profile.archivedCount === profile.discoveredCount;
  const profileHref = `/profile/${profile.username ?? profile.accountAddress}`;

  return (
    <article className="flex items-start justify-between gap-4 rounded-sm border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <div className="flex min-w-0 items-start gap-4">
        <ProfileAvatar
          imageUrl={profile.profileImageUrl}
          label={displayName}
          className="h-12 w-12"
        />

        <div className="min-w-0">
          <Link
            href={profileHref}
            className="font-serif text-lg leading-tight text-[var(--color-ink)] hover:underline"
          >
            {displayName}
          </Link>
          {profile.username ? (
            <p className="text-sm text-[var(--color-muted)]">
              @{profile.username}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-[var(--color-body)]">
            {profile.archivedCount} of {profile.discoveredCount} saved
            {profile.offChainCount > 0 ? (
              <span className="text-[var(--color-muted)]">
                {" "}
                · {profile.offChainCount} off-chain
              </span>
            ) : null}
          </p>
          <div className="mt-3 flex items-center gap-3 text-xs text-[var(--color-muted)]">
            <Link
              href={profileHref}
              className="link-editorial hover:text-[var(--color-ink)]"
            >
              Open profile
            </Link>
            <Link
              href={profile.foundationUrl}
              target="_blank"
              rel="noreferrer"
              className="link-editorial hover:text-[var(--color-ink)]"
            >
              View on Foundation
            </Link>
          </div>
        </div>
      </div>

      {preservedAll ? (
        <span
          className="shrink-0 text-xs text-[var(--color-ok)]"
          title="All of this artist's tracked works are fully saved."
        >
          All saved
        </span>
      ) : (
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => onPreserve(profile)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)] disabled:opacity-50"
          title="Add all of this artist's works to the save line."
        >
          {isSubmitting ? (
            <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus aria-hidden className="h-3.5 w-3.5" />
          )}
          Save all
        </button>
      )}
    </article>
  );
}

function PinnedWorksList({ profiles }: { profiles: ProfileArchiveItem[] }) {
  const hasPinned = profiles.some((p) => p.pinnedWorks.length > 0);
  if (!hasPinned) return null;

  return (
    <div className="mt-4 space-y-2 text-sm">
      {profiles
        .filter((p) => p.pinnedWorks.length > 0)
        .slice(0, 3)
        .flatMap((p) =>
          p.pinnedWorks.slice(0, 2).map((work) => (
            <div
              key={work.id}
              className="flex items-center justify-between gap-4 rounded-sm border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2"
            >
              <span className="truncate text-[var(--color-ink)]">
                {work.title}
              </span>
              {work.slug ? (
                <Link
                  href={`/archive/${work.slug}`}
                  className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                >
                  View archive
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              ) : null}
            </div>
          )),
        )}
    </div>
  );
}
