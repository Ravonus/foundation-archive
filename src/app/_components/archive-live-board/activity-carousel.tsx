"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

import type { ArchiveLiveEvent } from "~/lib/archive-live";
import { cn } from "~/lib/utils";
import { BlurImage } from "~/app/_components/motion";

import {
  activityGroupMatchesEvent,
  activitySignal,
} from "./activity-signal";
import { EASE } from "./constants";
import { toneClass } from "./tone";
import type { ActivityGroup, ActivitySignal } from "./types";

function useActivityCarouselState(
  groups: Array<ActivityGroup>,
  latestEvent: ArchiveLiveEvent | null,
  compact: boolean,
) {
  const reduce = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const latestGroupIndex = useMemo(
    () =>
      groups.findIndex((group) =>
        activityGroupMatchesEvent(group.artwork, latestEvent),
      ),
    [groups, latestEvent],
  );

  useEffect(() => {
    if (groups.length === 0) {
      setActiveIndex(0);
      return undefined;
    }

    if (latestGroupIndex >= 0) {
      const nextKey = groups[latestGroupIndex]?.key ?? null;
      setActiveIndex(latestGroupIndex);
      setFreshKey(nextKey);

      if (nextKey) {
        const timeout = window.setTimeout(() => {
          setFreshKey((current) => (current === nextKey ? null : current));
        }, 4_800);
        return () => window.clearTimeout(timeout);
      }

      return undefined;
    }

    setActiveIndex((current) => Math.min(current, groups.length - 1));
    return undefined;
  }, [groups, latestGroupIndex]);

  useEffect(() => {
    if (reduce || groups.length < 2) return;

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % groups.length);
    }, compact ? 4_800 : 6_200);

    return () => window.clearInterval(interval);
  }, [compact, groups.length, reduce]);

  useEffect(() => {
    const rail = railRef.current;
    const target = thumbRefs.current[activeIndex];
    if (!rail || !target) return;

    const railRect = rail.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextLeft =
      rail.scrollLeft +
      (targetRect.left - railRect.left) -
      (rail.clientWidth - target.clientWidth) / 2;

    rail.scrollTo({
      left: Math.max(0, nextLeft),
      behavior: reduce ? "auto" : "smooth",
    });
  }, [activeIndex, reduce]);

  return {
    reduce,
    activeIndex,
    setActiveIndex,
    freshKey,
    railRef,
    thumbRefs,
  };
}

function EmptyCarouselState() {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-line-strong)] px-4 py-8 text-center text-sm text-[var(--color-muted)]">
      Scanning for new works. They&apos;ll appear here as they&apos;re found
      and saved.
    </div>
  );
}

function CarouselHeroBadges({
  signal,
  sharedCount,
}: {
  signal: ActivitySignal;
  sharedCount: number;
}) {
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 px-3 py-3">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.62rem] font-medium uppercase tracking-[0.16em]",
          toneClass(signal.tone),
        )}
      >
        <Sparkles className="h-3 w-3" />
        {signal.label}
      </span>
      {sharedCount > 1 ? (
        <span className="rounded-full bg-black/45 px-3 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-white/82 backdrop-blur">
          Used by {sharedCount} works
        </span>
      ) : null}
    </div>
  );
}

function CarouselHeroImage({
  active,
  compact,
}: {
  active: ActivityGroup;
  compact: boolean;
}) {
  return (
    <div
      className={cn(
        "h-[clamp(14rem,42vw,24rem)] sm:h-[clamp(16rem,38vw,26rem)] lg:h-[clamp(18rem,32vw,28rem)] xl:h-[clamp(20rem,30vw,30rem)]",
        compact
          ? "2xl:h-[clamp(20rem,28vw,30rem)]"
          : "2xl:h-[clamp(22rem,30vw,32rem)]",
      )}
    >
      {active.artwork.posterUrl ? (
        <BlurImage
          src={active.artwork.posterUrl}
          alt={active.artwork.title}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-[var(--color-subtle)]">
          Preview will appear here
        </div>
      )}
    </div>
  );
}

function CarouselHeroCaption({ active }: { active: ActivityGroup }) {
  const subtitle =
    active.artwork.artistName ??
    (active.artwork.artistUsername
      ? `@${active.artwork.artistUsername}`
      : "Unknown artist");
  return (
    <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgba(17,17,17,0.86))] p-4 text-white">
      <p className="font-serif text-xl leading-tight sm:text-2xl">
        {active.artwork.title}
      </p>
      <p className="mt-1 text-sm text-white/78">{subtitle}</p>
    </div>
  );
}

function CarouselHero({
  active,
  signal,
  compact,
}: {
  active: ActivityGroup;
  signal: ActivitySignal;
  compact: boolean;
}) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-[1.25rem] border border-[var(--color-line)] bg-[var(--color-placeholder)]">
      <CarouselHeroBadges signal={signal} sharedCount={active.sharedCount} />
      <CarouselHeroImage active={active} compact={compact} />
      <CarouselHeroCaption active={active} />
    </div>
  );
}

function CarouselDetailStats({ active }: { active: ActivityGroup }) {
  const filesSavedLabel =
    active.artwork.metadataCid && active.artwork.mediaCid
      ? "Artwork + details"
      : active.artwork.mediaCid
        ? "Artwork"
        : "Details";
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-3 py-3">
        <p className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[var(--color-muted)]">
          Token
        </p>
        <p className="mt-1 break-all font-mono text-[0.75rem] text-[var(--color-ink)]">
          {active.artwork.contractAddress} #{active.artwork.tokenId}
        </p>
      </div>
      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-3 py-3">
        <p className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[var(--color-muted)]">
          Files saved
        </p>
        <p className="mt-1 text-sm text-[var(--color-ink)]">{filesSavedLabel}</p>
      </div>
    </div>
  );
}

function CarouselDetailCids({ active }: { active: ActivityGroup }) {
  return (
    <div className="mt-4 space-y-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-3">
      <p className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[var(--color-muted)]">
        Content IDs
      </p>
      {active.artwork.metadataCid ? (
        <p className="break-all text-xs text-[var(--color-body)]">
          Details: {active.artwork.metadataCid}
        </p>
      ) : null}
      {active.artwork.mediaCid ? (
        <p className="break-all text-xs text-[var(--color-body)]">
          Artwork: {active.artwork.mediaCid}
        </p>
      ) : null}
    </div>
  );
}

function CarouselDetailLinks({ active }: { active: ActivityGroup }) {
  const primaryHref = active.artwork.slug
    ? `/archive/${active.artwork.slug}`
    : "/archive";
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <Link
        href={primaryHref}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)]"
      >
        Open archive entry
        <ChevronRight className="h-4 w-4" />
      </Link>
      {active.artwork.foundationUrl ? (
        <Link
          href={active.artwork.foundationUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-body)]"
        >
          Foundation page
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function CarouselDetail({
  active,
  signal,
}: {
  active: ActivityGroup;
  signal: ActivitySignal;
}) {
  return (
    <div className="flex min-h-full min-w-0 flex-col justify-between rounded-[1.25rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 sm:p-5">
      <div>
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.24em] text-[var(--color-muted)]">
          Now featuring
        </p>
        <h4 className="mt-2 font-serif text-2xl text-[var(--color-ink)] sm:text-3xl">
          {active.artwork.title}
        </h4>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">
          {signal.summary}
        </p>
        <CarouselDetailStats active={active} />
        <CarouselDetailCids active={active} />
      </div>
      <CarouselDetailLinks active={active} />
    </div>
  );
}

function CarouselActiveSlide({
  active,
  signal,
  compact,
  reduce,
}: {
  active: ActivityGroup;
  signal: ActivitySignal;
  compact: boolean;
  reduce: boolean;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={active.key}
        initial={{ opacity: 0, y: reduce ? 0 : 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduce ? 0 : -14 }}
        transition={{ duration: 0.45, ease: EASE }}
        className={cn(
          "relative mx-auto grid min-w-0 gap-4",
          compact
            ? "max-w-[min(100%,64rem)] md:grid-cols-[minmax(0,0.94fr)_minmax(18rem,0.88fr)]"
            : "max-w-[min(100%,70rem)] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]",
        )}
      >
        <CarouselHero active={active} signal={signal} compact={compact} />
        <CarouselDetail active={active} signal={signal} />
      </motion.div>
    </AnimatePresence>
  );
}

function CarouselNavButtons({
  total,
  setActiveIndex,
}: {
  total: number;
  setActiveIndex: (updater: (current: number) => number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() =>
          setActiveIndex((current) => (current === 0 ? total - 1 : current - 1))
        }
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-body)]"
        aria-label="Previous work"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setActiveIndex((current) => (current + 1) % total)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-body)]"
        aria-label="Next work"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function CarouselStatusRow({
  activeIndex,
  total,
  setActiveIndex,
}: {
  activeIndex: number;
  total: number;
  setActiveIndex: (updater: (current: number) => number) => void;
}) {
  return (
    <div className="flex w-full max-w-full min-w-0 items-center justify-between gap-3">
      <div className="min-w-0 flex items-center gap-2 text-xs text-[var(--color-muted)]">
        <span className="rounded-full border border-[var(--color-line)] px-2.5 py-1 uppercase tracking-[0.16em]">
          {activeIndex + 1} / {total}
        </span>
        <span className="truncate">Rotating through recent arrivals</span>
      </div>
      {total > 1 ? (
        <CarouselNavButtons total={total} setActiveIndex={setActiveIndex} />
      ) : null}
    </div>
  );
}

function CarouselThumbImage({ group }: { group: ActivityGroup }) {
  return (
    <div className="aspect-[1.12/1] overflow-hidden bg-[var(--color-placeholder)]">
      {group.artwork.posterUrl ? (
        <BlurImage
          src={group.artwork.posterUrl}
          alt={group.artwork.title}
          className="h-full w-full object-cover transition duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-[var(--color-subtle)]">
          No preview
        </div>
      )}
    </div>
  );
}

function CarouselThumbMeta({ group }: { group: ActivityGroup }) {
  const subtitle = group.artwork.artistUsername
    ? `@${group.artwork.artistUsername}`
    : (group.artwork.artistName ?? "Unknown");
  const footer =
    group.sharedCount > 1
      ? `${group.sharedCount} shared tokens`
      : `token ${group.artwork.tokenId}`;
  return (
    <div className="p-3">
      <p className="truncate font-serif text-sm text-[var(--color-ink)]">
        {group.artwork.title}
      </p>
      <p className="mt-1 truncate text-xs text-[var(--color-muted)]">
        {subtitle}
      </p>
      <p className="mt-1 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--color-subtle)]">
        {footer}
      </p>
    </div>
  );
}

function CarouselThumbButton({
  group,
  index,
  selected,
  fresh,
  onSelect,
  registerRef,
}: {
  group: ActivityGroup;
  index: number;
  selected: boolean;
  fresh: boolean;
  onSelect: (index: number) => void;
  registerRef: (index: number, node: HTMLButtonElement | null) => void;
}) {
  return (
    <motion.button
      key={group.key}
      ref={(node) => registerRef(index, node)}
      type="button"
      onClick={() => onSelect(index)}
      className={cn(
        "group relative snap-start overflow-hidden rounded-[1.2rem] border bg-[var(--color-surface)] text-left",
        selected
          ? "border-[var(--color-line-strong)] shadow-[0_20px_60px_-40px_rgba(17,17,17,0.45)]"
          : "border-[var(--color-line)]",
      )}
      animate={{
        y: selected ? -2 : 0,
        scale: selected ? 1.01 : 1,
      }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      {fresh ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[1.2rem] bg-[var(--tint-info)]"
          initial={{ opacity: 0.75 }}
          animate={{ opacity: [0.75, 0, 0.35, 0] }}
          transition={{ duration: 2.8, ease: "easeOut" }}
        />
      ) : null}
      <div className="relative w-[11rem] sm:w-[12.5rem]">
        <CarouselThumbImage group={group} />
        <CarouselThumbMeta group={group} />
      </div>
    </motion.button>
  );
}

function CarouselThumbRail({
  groups,
  activeIndex,
  freshKey,
  setActiveIndex,
  railRef,
  thumbRefs,
}: {
  groups: Array<ActivityGroup>;
  activeIndex: number;
  freshKey: string | null;
  setActiveIndex: (index: number) => void;
  railRef: React.RefObject<HTMLDivElement | null>;
  thumbRefs: React.MutableRefObject<Array<HTMLButtonElement | null>>;
}) {
  const registerRef = (index: number, node: HTMLButtonElement | null) => {
    thumbRefs.current[index] = node;
  };
  return (
    <div className="edge-fade-x w-full max-w-full min-w-0 overflow-x-auto pb-2 scroll-smooth">
      <div
        ref={railRef}
        className="flex w-max min-w-max snap-x snap-mandatory gap-3"
      >
        {groups.map((group, index) => (
          <CarouselThumbButton
            key={group.key}
            group={group}
            index={index}
            selected={index === activeIndex}
            fresh={group.key === freshKey}
            onSelect={setActiveIndex}
            registerRef={registerRef}
          />
        ))}
      </div>
    </div>
  );
}

function getActiveGroup(groups: Array<ActivityGroup>, activeIndex: number) {
  const active = groups[activeIndex] ?? groups[0];
  if (!active) {
    throw new Error(
      "ActivityCarousel: groups became empty after the length guard above; this invariant is guaranteed by the early return.",
    );
  }
  return active;
}

export function ActivityCarousel({
  groups,
  latestEvent,
  compact,
}: {
  groups: Array<ActivityGroup>;
  latestEvent: ArchiveLiveEvent | null;
  compact: boolean;
}) {
  const {
    reduce,
    activeIndex,
    setActiveIndex,
    freshKey,
    railRef,
    thumbRefs,
  } = useActivityCarouselState(groups, latestEvent, compact);

  if (groups.length === 0) {
    return <EmptyCarouselState />;
  }

  const active = getActiveGroup(groups, activeIndex);
  const signal = activitySignal(
    activityGroupMatchesEvent(active.artwork, latestEvent) ? latestEvent : null,
  );

  return (
    <div className="w-full max-w-full min-w-0 space-y-3 overflow-x-hidden">
      <div className="relative w-full max-w-full min-w-0 overflow-hidden rounded-[1.6rem] border border-[var(--color-line)] bg-[linear-gradient(135deg,var(--color-surface),var(--color-surface-alt))] p-3 sm:p-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-14 right-[-5%] h-40 w-40 rounded-full bg-[var(--tint-info)] blur-3xl"
        />
        <CarouselActiveSlide
          active={active}
          signal={signal}
          compact={compact}
          reduce={Boolean(reduce)}
        />
      </div>

      <div className="w-full max-w-full min-w-0 space-y-3">
        <CarouselStatusRow
          activeIndex={activeIndex}
          total={groups.length}
          setActiveIndex={setActiveIndex}
        />
        <CarouselThumbRail
          groups={groups}
          activeIndex={activeIndex}
          freshKey={freshKey}
          setActiveIndex={setActiveIndex}
          railRef={railRef}
          thumbRefs={thumbRefs}
        />
      </div>
    </div>
  );
}
