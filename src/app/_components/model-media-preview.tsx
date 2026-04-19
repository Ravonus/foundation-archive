"use client";

import { createElement, useEffect } from "react";

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

function supportsInlineModelPreview(src: string) {
  return !src.toLowerCase().includes(".usdz");
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

export function ModelMediaPreview({
  src,
  poster,
  alt,
  className,
}: {
  src: string;
  poster?: string | null;
  alt: string;
  className?: string;
}) {
  const canRenderInline = supportsInlineModelPreview(src);

  useEffect(() => {
    if (!canRenderInline) return;
    ensureModelViewerScript();
  }, [canRenderInline]);

  if (!canRenderInline && poster) {
    return <PosterImage src={poster} alt={alt} className={className} />;
  }

  if (!canRenderInline) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-[var(--color-placeholder)] p-8 text-center text-sm text-[var(--color-subtle)]",
          className,
        )}
      >
        This 3D file opens best in a dedicated viewer.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[var(--color-placeholder)]",
        className,
      )}
    >
      {createElement(
        "model-viewer",
        {
          src,
          poster: poster ?? undefined,
          alt,
          className: "block h-full w-full bg-[var(--color-placeholder)]",
          style: {
            width: "100%",
            height: "100%",
            backgroundColor: "transparent",
            ["--poster-color" as const]: "transparent",
          },
          "camera-controls": "",
          "interaction-prompt": "none",
          "touch-action": "pan-y",
          "shadow-intensity": "0.85",
          exposure: "1",
          "environment-image": "neutral",
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
