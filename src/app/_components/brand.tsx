import Image from "next/image";
import { type CSSProperties, type ReactNode } from "react";

import { cn } from "~/lib/utils";

type LogoMarkProps = {
  size?: number;
  className?: string;
  withBrackets?: boolean;
};

export function LogoMark({
  size = 28,
  className,
  withBrackets = true,
}: LogoMarkProps) {
  return (
    <svg
      role="img"
      aria-label="Agorix mark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn("text-[var(--color-brand-green)]", className)}
    >
      {withBrackets ? (
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="square"
          className="text-[var(--color-ink)]"
          opacity="0.78"
        >
          <path d="M6 18V6h12" />
          <path d="M58 18V6H46" />
          <path d="M6 46v12h12" />
          <path d="M58 46v12H46" />
        </g>
      ) : null}
      <path
        d="M32 16
           C 32 24, 40 32, 48 32
           C 40 32, 32 40, 32 48
           C 32 40, 24 32, 16 32
           C 24 32, 32 24, 32 16 Z"
        fill="var(--color-brand-green)"
      />
    </svg>
  );
}

type BracketFrameProps = {
  children: ReactNode;
  className?: string;
  tone?: "default" | "ink" | "quiet";
  padding?: "sm" | "md" | "lg";
};

export function BracketFrame({
  children,
  className,
  tone = "default",
  padding = "md",
}: BracketFrameProps) {
  const stroke =
    tone === "ink"
      ? "var(--color-ink)"
      : tone === "quiet"
        ? "var(--color-line-strong)"
        : "var(--color-brand-green)";

  const pad =
    padding === "sm" ? "p-2" : padding === "lg" ? "p-6 sm:p-8" : "p-4 sm:p-5";

  const style: CSSProperties = {
    ["--bracket-stroke" as string]: stroke,
  };

  return (
    <div
      className={cn("bracket-frame relative", pad, className)}
      style={style}
    >
      <span aria-hidden className="bracket-frame__corner bracket-frame__tl" />
      <span aria-hidden className="bracket-frame__corner bracket-frame__tr" />
      <span aria-hidden className="bracket-frame__corner bracket-frame__bl" />
      <span aria-hidden className="bracket-frame__corner bracket-frame__br" />
      {children}
    </div>
  );
}

type CaptionTagProps = {
  entries: { label: string; value: string }[];
  className?: string;
};

export function CaptionTag({ entries, className }: CaptionTagProps) {
  return (
    <dl
      className={cn(
        "font-mono text-[0.58rem] uppercase leading-[1.55] tracking-[0.18em] text-[var(--color-muted)]",
        className,
      )}
    >
      {entries.map((entry) => (
        <div key={entry.label} className="flex items-baseline gap-2">
          <dt className="text-[var(--color-subtle)]">{entry.label}</dt>
          <dd className="truncate text-[var(--color-body)]">{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}

type ThemedImageProps = {
  light: string;
  dark: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  sizes?: string;
  priority?: boolean;
};

export function ThemedImage({
  light,
  dark,
  alt,
  width,
  height,
  className,
  sizes,
  priority,
}: ThemedImageProps) {
  return (
    <>
      <Image
        src={light}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        priority={priority}
        className={cn("block dark:hidden", className)}
      />
      <Image
        src={dark}
        alt=""
        aria-hidden
        width={width}
        height={height}
        sizes={sizes}
        priority={priority}
        className={cn("hidden dark:block", className)}
      />
    </>
  );
}

type FeaturePanelProps = {
  eyebrow?: string;
  title: string;
  body: string;
  icon?: ReactNode;
  tone?: "paper" | "ink";
  className?: string;
};

export function FeaturePanel({
  eyebrow,
  title,
  body,
  icon,
  tone = "paper",
  className,
}: FeaturePanelProps) {
  const isInk = tone === "ink";
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border p-6 transition",
        isInk
          ? "border-[var(--color-line-strong)] bg-[#0f1512] text-[var(--color-ink)] dark:bg-[#0b100d]"
          : "border-[var(--color-line)] bg-[var(--color-surface)]",
        className,
      )}
    >
      <div aria-hidden className="feature-panel-glow" />
      {icon ? (
        <div
          className={cn(
            "relative mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl",
            isInk
              ? "bg-[var(--color-brand-green-soft)] text-[var(--color-brand-green-bright)]"
              : "bg-[var(--color-brand-green-soft)] text-[var(--color-brand-green)]",
          )}
        >
          {icon}
        </div>
      ) : null}
      {eyebrow ? (
        <p
          className={cn(
            "relative font-mono text-[0.6rem] uppercase tracking-[0.22em]",
            isInk ? "text-[#c6d2ca]/70" : "text-[var(--color-muted)]",
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <h3
        className={cn(
          "relative mt-2 font-serif text-xl leading-tight tracking-tight sm:text-2xl",
          isInk ? "text-[#eef3ee]" : "text-[var(--color-ink)]",
        )}
      >
        {title}
      </h3>
      <p
        className={cn(
          "relative mt-3 text-sm leading-relaxed",
          isInk ? "text-[#c6d2ca]" : "text-[var(--color-body)]",
        )}
      >
        {body}
      </p>
    </article>
  );
}

type StatPanelProps = {
  value: string;
  label: string;
  note?: string;
  className?: string;
};

export function StatPanel({ value, label, note, className }: StatPanelProps) {
  return (
    <article
      className={cn(
        "flex h-full flex-col justify-between rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6",
        className,
      )}
    >
      <p className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-[var(--color-muted)]">
        {label}
      </p>
      <div className="mt-4">
        <p className="font-serif text-2xl leading-tight tracking-tight text-[var(--color-brand-green)] hyphens-auto break-words sm:text-3xl">
          {value}
        </p>
        {note ? (
          <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted)]">
            {note}
          </p>
        ) : null}
      </div>
    </article>
  );
}
