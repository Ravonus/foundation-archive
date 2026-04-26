"use client";

import { useState } from "react";

import { placeholderBannerBackground } from "~/lib/profile-placeholder";
import { cn } from "~/lib/utils";

export function ProfileBanner({
  imageUrl,
  seed,
  className,
}: {
  imageUrl: string | null;
  seed: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !failed;

  return (
    <div
      aria-hidden
      className={cn("relative h-full w-full", className)}
      style={
        showImage
          ? undefined
          : { backgroundImage: placeholderBannerBackground(seed) }
      }
    >
      {showImage ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl ?? undefined}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(0,0,0,0.45)] via-transparent to-transparent" />
        </>
      ) : null}
    </div>
  );
}
