"use client";

import { useEffect, useState } from "react";
import { Check, LinkIcon, Share2 } from "lucide-react";

import { cn } from "~/lib/utils";

type ShareLinkButtonProps = {
  title: string;
  path: string;
  className?: string;
};

function fullUrlFor(path: string) {
  if (typeof window === "undefined") return path;
  if (/^https?:\/\//.test(path)) return path;
  return `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function ShareLinkButton({
  title,
  path,
  className,
}: ShareLinkButtonProps) {
  const [state, setState] = useState<"idle" | "copied">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const id = window.setTimeout(() => setState("idle"), 1800);
    return () => window.clearTimeout(id);
  }, [state]);

  const onClick = async () => {
    const url = fullUrlFor(path);
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.share) {
      try {
        await nav.share({ title, url });
        return;
      } catch {
        // Fall through to clipboard.
      }
    }
    if (nav?.clipboard) {
      try {
        await nav.clipboard.writeText(url);
        setState("copied");
      } catch {
        // Swallow — no clipboard access.
      }
    }
  };

  const Icon = state === "copied" ? Check : LinkIcon;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={state === "copied" ? "Link copied" : "Copy or share link"}
      title={state === "copied" ? "Link copied" : "Copy or share this page"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)]",
        state === "copied" &&
          "border-[var(--color-ok)]/40 text-[var(--color-ok)] hover:bg-transparent hover:text-[var(--color-ok)]",
        className,
      )}
    >
      <Icon aria-hidden className="h-3.5 w-3.5" />
      <span>{state === "copied" ? "Link copied" : "Share"}</span>
      {state === "idle" ? (
        <Share2 aria-hidden className="h-3 w-3 text-[var(--color-subtle)]" />
      ) : null}
    </button>
  );
}
