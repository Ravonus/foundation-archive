import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { DesktopStatusConsole } from "~/app/_components/desktop-status-console";

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
        <Suspense fallback={<ConsoleFallback />}>
          <DesktopStatusConsole />
        </Suspense>
      </section>
    </main>
  );
}
