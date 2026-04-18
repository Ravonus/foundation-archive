import {
  ArrowLeft,
  ArrowUpRight,
  Cable,
  Download,
  HardDriveDownload,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { DesktopStatusConsole } from "~/app/_components/desktop-status-console";

const DESKTOP_APP_REPO_URL = "https://github.com/Ravonus/foundation-share-bridge";

function ConsoleFallback() {
  return (
    <div className="space-y-4">
      <div className="h-32 w-full animate-pulse rounded-2xl bg-[var(--color-placeholder)]" />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-60 w-full animate-pulse rounded-2xl bg-[var(--color-placeholder)]" />
        <div className="h-60 w-full animate-pulse rounded-2xl bg-[var(--color-placeholder)]" />
      </div>
    </div>
  );
}

export default function DesktopPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 pt-8 pb-16">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
        Home
      </Link>

      <header className="mt-6 border-b border-[var(--color-line)] pb-8">
        <h1 className="font-serif text-4xl leading-tight text-[var(--color-ink)] sm:text-5xl">
          Keep a copy on your own computer
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--color-body)]">
          The archive site already saves every work we know about. This is for
          people who want a second copy on their own computer too.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a
            href={DESKTOP_APP_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)] hover:opacity-90"
          >
            <Download aria-hidden className="h-4 w-4" />
            View on GitHub
            <ArrowUpRight aria-hidden className="h-4 w-4" />
          </a>
          <p className="text-sm text-[var(--color-muted)]">
            Packaged downloads are coming later. For now, the desktop bridge
            lives on GitHub.
          </p>
        </div>
      </header>

      <section
        aria-label="How it works"
        className="mt-8 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6"
      >
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
          How it works
        </p>
        <h2 className="mt-2 font-serif text-2xl text-[var(--color-ink)] sm:text-3xl">
          Three simple steps
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          <li className="flex flex-col gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-4">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-ink)] text-sm font-medium text-[var(--color-bg)]">
              <Download aria-hidden className="h-4 w-4" />
            </span>
            <p className="text-sm font-medium text-[var(--color-ink)]">
              Grab the desktop bridge
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              Start from the GitHub repo for now. Packaged desktop downloads are
              on the way.
            </p>
          </li>
          <li className="flex flex-col gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-4">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-ink)] text-sm font-medium text-[var(--color-bg)]">
              <Cable aria-hidden className="h-4 w-4" />
            </span>
            <p className="text-sm font-medium text-[var(--color-ink)]">
              Connect to the site
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              Click one button to link the app. After that, this site can send
              works to your computer.
            </p>
          </li>
          <li className="flex flex-col gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-4">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-ink)] text-sm font-medium text-[var(--color-bg)]">
              <HardDriveDownload aria-hidden className="h-4 w-4" />
            </span>
            <p className="text-sm font-medium text-[var(--color-ink)]">
              Save works you care about
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              On any work&apos;s page, click &ldquo;Save to my computer&rdquo;.
              The app keeps a copy and helps share it with others.
            </p>
          </li>
        </ol>
      </section>

      <section className="mt-8 space-y-6">
        <Suspense fallback={<ConsoleFallback />}>
          <DesktopStatusConsole />
        </Suspense>
      </section>

      <div className="mt-12 rounded-sm border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-muted)]">
        <p className="font-medium text-[var(--color-ink)]">
          Totally optional.
        </p>
        <p className="mt-1">
          The archive works without this app. Install it only if you want your
          own computer to keep a copy of the works you care about.
        </p>
      </div>
    </main>
  );
}
