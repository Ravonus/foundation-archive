"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { useHydrated } from "~/app/_components/use-hydrated";
import { useShaderThemeTransition } from "~/app/_components/theme/use-shader-theme-transition";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useHydrated();
  const triggerTransition = useShaderThemeTransition();
  const [optimisticDark, setOptimisticDark] = useState<boolean | null>(null);

  const isDark = optimisticDark ?? resolvedTheme === "dark";

  if (!hydrated) {
    return (
      <button
        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-transparent"
        aria-label="Toggle theme"
      >
        <span className="h-3.5 w-3.5" />
      </button>
    );
  }

  const handleToggle = () => {
    const nextDark = !isDark;
    setOptimisticDark(nextDark);
    void triggerTransition(() => {
      setTheme(nextDark ? "dark" : "light");
      setOptimisticDark(null);
    }, nextDark);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]"
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            key="moon"
            className="absolute inset-0 inline-flex items-center justify-center"
            initial={{ rotate: -90, opacity: 0, scale: 0.7 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <Moon className="h-3.5 w-3.5" />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            className="absolute inset-0 inline-flex items-center justify-center"
            initial={{ rotate: 90, opacity: 0, scale: 0.7 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: -90, opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <Sun className="h-3.5 w-3.5" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
