import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center px-6 py-20 text-center">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
        404 · Not found
      </p>
      <h1 className="mt-4 font-serif text-4xl leading-tight text-[var(--color-ink)] sm:text-5xl">
        We couldn&apos;t find that page.
      </h1>
      <p className="mt-4 max-w-lg text-[var(--color-body)]">
        The link may be broken, or the page may have been moved. Try searching
        the archive or heading back home.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm text-[var(--color-bg)] hover:opacity-90"
        >
          Back to home
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
        <Link
          href="/archive"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-5 py-2.5 text-sm text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)]"
        >
          <Search aria-hidden className="h-4 w-4" />
          Browse the archive
        </Link>
      </div>
    </main>
  );
}
