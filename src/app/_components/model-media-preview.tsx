"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "~/lib/utils";

const MODEL_VIEWER_SCRIPT_SRC =
  "https://cdn.jsdelivr.net/npm/@google/model-viewer/dist/model-viewer.min.js";

function ensureModelViewerScript() {
  if (typeof document === "undefined") return;
  if (document.querySelector("script[data-agorix-model-viewer='1']")) return;

  const script = document.createElement("script");
  script.type = "module";
  script.src = MODEL_VIEWER_SCRIPT_SRC;
  script.dataset.agorixModelViewer = "1";
  document.head.appendChild(script);
}

function stripQuery(url: string) {
  const queryAt = url.indexOf("?");
  return queryAt >= 0 ? url.slice(0, queryAt) : url;
}

function isUsdzUrl(url: string) {
  return stripQuery(url).toLowerCase().endsWith(".usdz");
}

function dedupe<T extends string>(values: ReadonlyArray<T | null | undefined>) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function PosterImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={cn("h-full w-full object-contain", className)}
    />
  );
}

function FallbackMessage({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-[var(--color-placeholder)] p-8 text-center text-sm text-[var(--color-subtle)]",
        className,
      )}
    >
      {message}
    </div>
  );
}

function UsdzAnchor({
  src,
  poster,
  alt,
  className,
}: {
  src: string;
  poster: string | null;
  alt: string;
  className?: string;
}) {
  // Apple AR Quick Look requires <a rel="ar"> with exactly one <img> child.
  const posterSrc = poster ?? src;
  return (
    <a
      rel="ar"
      href={src}
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden bg-[var(--color-placeholder)]",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={posterSrc}
        alt={alt}
        className="h-full w-full object-contain"
      />
    </a>
  );
}

function InlineModelViewer({
  candidates,
  iosSrc,
  poster,
  alt,
  autoRotate,
  className,
}: {
  candidates: ReadonlyArray<string>;
  iosSrc: string | null;
  poster: string | null;
  alt: string;
  autoRotate: boolean;
  className?: string;
}) {
  const candidatesKey = candidates.join("\u0001");
  const [progress, setProgress] = useState({
    key: candidatesKey,
    index: 0,
    exhausted: false,
  });

  const effectiveProgress =
    progress.key === candidatesKey
      ? progress
      : { key: candidatesKey, index: 0, exhausted: false };

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ensureModelViewerScript();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const node = container.querySelector("model-viewer");
    if (!node) return;

    const handleError = () => {
      setProgress((current) => {
        const baseIndex = current.key === candidatesKey ? current.index : 0;
        const nextIndex = baseIndex + 1;
        if (nextIndex >= candidates.length) {
          return { key: candidatesKey, index: baseIndex, exhausted: true };
        }
        return { key: candidatesKey, index: nextIndex, exhausted: false };
      });
    };

    node.addEventListener("error", handleError);
    return () => {
      node.removeEventListener("error", handleError);
    };
  }, [candidatesKey, candidates.length, effectiveProgress.index]);

  if (effectiveProgress.exhausted) {
    if (poster) {
      return <PosterImage src={poster} alt={alt} className={className} />;
    }
    return (
      <FallbackMessage
        message="3D preview unavailable right now."
        className={className}
      />
    );
  }

  const safeIndex = Math.min(effectiveProgress.index, candidates.length - 1);
  const currentSrc = candidates[safeIndex] ?? "";

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden bg-[var(--color-placeholder)]",
        className,
      )}
    >
      {createElement(
        "model-viewer",
        {
          key: `${currentSrc}#${safeIndex}`,
          src: currentSrc,
          "ios-src": iosSrc ?? undefined,
          poster: poster ?? undefined,
          alt,
          className: "block h-full w-full bg-[var(--color-placeholder)]",
          style: {
            width: "100%",
            height: "100%",
            backgroundColor: "transparent",
            ["--poster-color" as const]: "transparent",
          },
          ar: "",
          "ar-modes": "webxr scene-viewer quick-look",
          "auto-rotate": autoRotate ? "" : undefined,
          "camera-controls": "",
          "interaction-prompt": "none",
          "touch-action": "pan-y",
          "shadow-intensity": "0.85",
          exposure: "1",
          "environment-image": "neutral",
          loading: "lazy",
          reveal: "auto",
        },
        poster ? (
          <PosterImage src={poster} alt={alt} />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-[var(--color-subtle)]">
            Loading 3D preview…
          </div>
        ),
      )}
    </div>
  );
}

export function ModelMediaPreview({
  src,
  candidates,
  iosSrc,
  poster,
  alt,
  autoRotate = false,
  allowAnchorFallback = true,
  className,
}: {
  src: string;
  candidates?: ReadonlyArray<string>;
  iosSrc?: string | null;
  poster?: string | null;
  alt: string;
  autoRotate?: boolean;
  allowAnchorFallback?: boolean;
  className?: string;
}) {
  const all = useMemo(
    () => dedupe<string>([src, ...(candidates ?? [])]),
    [src, candidates],
  );

  const inlineCandidates = useMemo(
    () => all.filter((url) => !isUsdzUrl(url)),
    [all],
  );

  const fallbackUsdz = useMemo(() => all.find(isUsdzUrl) ?? null, [all]);
  const resolvedIosSrc = iosSrc ?? fallbackUsdz;
  const resolvedPoster = poster ?? null;

  if (inlineCandidates.length === 0 && resolvedIosSrc) {
    if (!allowAnchorFallback) {
      if (resolvedPoster) {
        return (
          <PosterImage
            src={resolvedPoster}
            alt={alt}
            className={className}
          />
        );
      }
      return (
        <FallbackMessage
          message="3D preview unavailable right now."
          className={className}
        />
      );
    }

    return (
      <UsdzAnchor
        src={resolvedIosSrc}
        poster={resolvedPoster}
        alt={alt}
        className={className}
      />
    );
  }

  if (inlineCandidates.length === 0) {
    if (resolvedPoster) {
      return (
        <PosterImage
          src={resolvedPoster}
          alt={alt}
          className={className}
        />
      );
    }
    return (
      <FallbackMessage
        message="3D preview unavailable right now."
        className={className}
      />
    );
  }

  return (
    <InlineModelViewer
      candidates={inlineCandidates}
      iosSrc={resolvedIosSrc}
      poster={resolvedPoster}
      alt={alt}
      autoRotate={autoRotate}
      className={className}
    />
  );
}
