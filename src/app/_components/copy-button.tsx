"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "~/lib/utils";

type CopyButtonProps = {
  value: string;
  label?: string;
  copiedLabel?: string;
  title?: string;
  className?: string;
  iconOnly?: boolean;
};

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  title,
  className,
  iconOnly = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(id);
  }, [copied]);

  const onClick = async () => {
    if (typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Swallow: clipboard API may be unavailable (insecure context, denied permission).
    }
  };

  const Icon = copied ? Check : Copy;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? (copied ? copiedLabel : label)}
      aria-label={copied ? copiedLabel : label}
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:text-[var(--color-ink)]",
        copied && "border-[var(--color-ok)]/40 text-[var(--color-ok)]",
        className,
      )}
    >
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {iconOnly ? null : (
        <span className="tabular-nums">{copied ? copiedLabel : label}</span>
      )}
    </button>
  );
}
