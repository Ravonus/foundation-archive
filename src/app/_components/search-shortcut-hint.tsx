"use client";

import { useEffect, useState } from "react";

const SEARCH_INPUT_IDS = ["home-search", "archive-search"];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function detectMac() {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform || "";
  const ua = navigator.userAgent || "";
  const MAC_TOKENS = ["Mac", "iPhone", "iPad", "iPod"];
  return (
    MAC_TOKENS.some((token) => platform.includes(token)) ||
    ua.includes("Mac OS X")
  );
}

function findSearchInput(): HTMLInputElement | null {
  for (const id of SEARCH_INPUT_IDS) {
    const element = document.getElementById(id);
    if (element instanceof HTMLInputElement) return element;
  }
  return null;
}

export function SearchShortcutHint() {
  const [isMac, setIsMac] = useState<boolean | null>(null);

  useEffect(() => {
    setIsMac(detectMac());
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.key.toLowerCase() !== "k") return;
      if (isEditableTarget(event.target)) return;
      const input = findSearchInput();
      if (!input) return;
      event.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (isMac === null) return null;

  return (
    <kbd
      aria-hidden
      className="ml-1 hidden select-none items-center gap-0.5 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-1.5 py-0.5 font-mono text-[0.65rem] font-medium text-[var(--color-muted)] sm:inline-flex"
    >
      <span>{isMac ? "⌘" : "Ctrl"}</span>
      <span>K</span>
    </kbd>
  );
}
