import type { Tone } from "./types";

export function eventTone(type: string): Tone {
  const t = type.toLowerCase();
  if (t.includes("pinned") || t.includes("complete") || t.includes("success")) {
    return "ok";
  }
  if (t.includes("fail") || t.includes("error")) return "err";
  if (t.includes("download") || t.includes("run")) return "info";
  if (t.includes("queue") || t.includes("defer") || t.includes("pending")) {
    return "warn";
  }
  return "muted";
}

export function toneClass(tone: Tone) {
  switch (tone) {
    case "ok":
      return "bg-[var(--tint-ok)] text-[var(--color-ok)]";
    case "warn":
      return "bg-[var(--tint-warn)] text-[var(--color-warn)]";
    case "err":
      return "bg-[var(--tint-err)] text-[var(--color-err)]";
    case "info":
      return "bg-[var(--tint-info)] text-[var(--color-info)]";
    case "muted":
      return "bg-[var(--tint-muted)] text-[var(--color-muted)]";
  }
}

export function toneDotClass(tone: Tone) {
  switch (tone) {
    case "ok":
      return "bg-[var(--color-ok)]";
    case "warn":
      return "bg-[var(--color-warn)]";
    case "err":
      return "bg-[var(--color-err)]";
    case "info":
      return "bg-[var(--color-info)]";
    case "muted":
      return "bg-[var(--color-subtle)]";
  }
}

export function progressFillClass(tone: Tone) {
  switch (tone) {
    case "ok":
      return "bg-[var(--color-ok)]";
    case "warn":
      return "bg-[var(--color-warn)]";
    case "err":
      return "bg-[var(--color-err)]";
    case "info":
      return "bg-[var(--color-info)]";
    case "muted":
      return "bg-[var(--color-subtle)]";
  }
}
