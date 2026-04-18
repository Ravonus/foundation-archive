"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center px-6 py-20 text-center">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--tint-err)] text-[var(--color-err)]">
        <AlertTriangle aria-hidden className="h-5 w-5" />
      </span>
      <p className="mt-4 font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
        Something went wrong
      </p>
      <h1 className="mt-3 font-serif text-3xl leading-tight text-[var(--color-ink)] sm:text-4xl">
        We hit a snag loading this page.
      </h1>
      <p className="mt-4 max-w-lg text-[var(--color-body)]">
        It&apos;s probably a temporary hiccup. Try again in a moment, or head
        back home.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-[var(--color-subtle)]">
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm text-[var(--color-bg)] hover:opacity-90"
        >
          <RefreshCcw aria-hidden className="h-4 w-4" />
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-5 py-2.5 text-sm text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)]"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
