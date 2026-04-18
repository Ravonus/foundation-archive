"use client";

import { useCallback, useRef } from "react";

/* Diagonal wavy-sweep theme transition driven by the View Transitions API.
 * Light → Dark: wave sweeps top-right → bottom-left.
 * Dark → Light: wave sweeps bottom-left → top-right.
 * Keyframes are pre-baked so nothing runs on the main thread during the
 * animation itself. Falls back to an instant swap when View Transitions
 * or reduced motion are in play. */

const DURATION_MS = 700;
const COLS = 20;
const STEPS = 36;

const ST = 256;
const SIN = new Float32Array(ST);
for (let i = 0; i < ST; i++) SIN[i] = Math.sin((i / ST) * Math.PI * 2);

function fsin(x: number): number {
  const idx = (((((x / 6.2831853) % 1) + 1) % 1) * ST) | 0;
  return SIN[idx] ?? 0;
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function buildClipPath({
  progress,
  toDark,
  t,
  phase,
}: {
  progress: number;
  toDark: boolean;
  t: number;
  phase: number;
}): string {
  const sweep = progress * 260 - 30;
  const amp = 8 + 10 * Math.sin(progress * Math.PI);
  const pts: string[] = [];

  for (let i = 0; i <= COLS; i++) {
    const xN = i / COLS;
    const xPct = xN * 100;

    const wave =
      fsin(xN * 4.2 + t * 5.0 + phase) * 0.5 +
      fsin(xN * 6.8 - t * 3.5 + phase * 1.4) * 0.3 +
      fsin(xN * 2.1 + t * 7.0 - phase * 0.8) * 0.2;

    const yRaw = sweep - 100 + xPct + wave * amp;
    const y = yRaw < 0 ? 0 : yRaw > 100 ? 100 : yRaw;

    if (toDark) {
      pts.push(`${xPct}% ${y}%`);
    } else {
      pts.push(`${100 - xPct}% ${100 - y}%`);
    }
  }

  if (toDark) {
    pts.push("100% 0%", "0% 0%");
  } else {
    pts.push("0% 100%", "100% 100%");
  }

  return `polygon(${pts.join(",")})`;
}

function bakeKeyframes(toDark: boolean): Keyframe[] {
  const totalT = DURATION_MS * 0.001;
  const phase = Math.random() * Math.PI * 2;
  const frames = new Array<Keyframe>(STEPS + 1);

  for (let i = 0; i <= STEPS; i++) {
    const raw = i / STEPS;
    frames[i] = {
      clipPath: buildClipPath({
        progress: ease(raw),
        toDark,
        t: raw * totalT,
        phase,
      }),
      offset: raw,
    };
  }
  return frames;
}

export function useShaderThemeTransition() {
  const busy = useRef(false);

  const trigger = useCallback(
    async (toggleTheme: () => void, toDark?: boolean) => {
      if (busy.current) {
        toggleTheme();
        return;
      }

      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (
        typeof document === "undefined" ||
        !("startViewTransition" in document) ||
        prefersReduced
      ) {
        toggleTheme();
        return;
      }

      busy.current = true;
      const goingDark = toDark ?? false;

      const style = document.createElement("style");
      style.textContent = `::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}::view-transition-old(root){z-index:1}::view-transition-new(root){z-index:9999}`;
      document.head.appendChild(style);

      const transition = (
        document as Document & {
          startViewTransition: (cb: () => void) => {
            ready: Promise<void>;
            finished: Promise<void>;
          };
        }
      ).startViewTransition(() => {
        toggleTheme();
      });

      try {
        await transition.ready;

        document.documentElement.animate(bakeKeyframes(goingDark), {
          duration: DURATION_MS,
          easing: "linear",
          pseudoElement: "::view-transition-new(root)",
          fill: "forwards",
        });

        await transition.finished;
      } finally {
        style.remove();
        busy.current = false;
      }
    },
    [],
  );

  return trigger;
}
