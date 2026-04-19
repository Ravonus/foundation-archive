"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";

import { cn } from "~/lib/utils";

function avatarInitials(label: string | null | undefined) {
  const cleaned = (label ?? "").trim();
  if (!cleaned) return "";

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? "";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

export function ProfileAvatar({
  imageUrl,
  label,
  className,
  iconClassName,
  textClassName,
}: {
  imageUrl: string | null;
  label: string | null;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = avatarInitials(label);
  const showImage = Boolean(imageUrl) && !failed;

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl ?? undefined}
        alt={label ?? "Profile avatar"}
        referrerPolicy="no-referrer"
        onError={() => {
          console.warn("[ProfileAvatar] image failed to load", {
            imageUrl,
            label,
          });
          setFailed(true);
        }}
        className={cn("block max-w-full rounded-full object-cover", className)}
      />
    );
  }

  return (
    <div
      aria-label={label ?? "Profile avatar"}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-[var(--color-placeholder)] text-[var(--color-muted)]",
        className,
      )}
    >
      {initials ? (
        <span
          className={cn(
            "font-mono text-xs uppercase tracking-[0.12em]",
            textClassName,
          )}
        >
          {initials}
        </span>
      ) : (
        <UserRound className={cn("h-5 w-5", iconClassName)} />
      )}
    </div>
  );
}
