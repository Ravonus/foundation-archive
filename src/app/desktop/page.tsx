import { ArrowLeft, ArrowUpRight, Download } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { DesktopBridgeProvider } from "~/app/_components/desktop-bridge-provider";
import { DesktopStatusConsole } from "~/app/_components/desktop-status-console";

const DESKTOP_APP_REPO_URL =
  "https://github.com/Ravonus/foundation-share-bridge";

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

      <section className="mt-6 space-y-6">
        <DesktopBridgeProvider>
          <Suspense fallback={<ConsoleFallback />}>
            <DesktopStatusConsole />
          </Suspense>
        </DesktopBridgeProvider>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-muted)]">
        <a
          href={DESKTOP_APP_REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)] hover:opacity-90"
        >
          <Download aria-hidden className="h-4 w-4" />
          Desktop app on GitHub
          <ArrowUpRight aria-hidden className="h-4 w-4" />
        </a>
        <p>
          The archive works fine without this app. Use it only if you want a
          second copy on your own computer too.
        </p>
      </div>
    </main>
  );
}
