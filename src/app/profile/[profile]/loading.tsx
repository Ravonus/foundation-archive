import { ArtworkGridSkeleton } from "~/app/_components/artwork-grid-skeleton";

export default function ProfileLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pt-14 pb-20">
      <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6 sm:p-8">
        <div className="flex items-start gap-5">
          <span className="inline-block h-20 w-20 animate-pulse rounded-full bg-[var(--color-placeholder)]" />
          <div className="flex-1 space-y-3">
            <span className="block h-3 w-1/4 animate-pulse rounded bg-[var(--color-placeholder)]" />
            <span className="block h-10 w-2/3 animate-pulse rounded bg-[var(--color-placeholder)]" />
            <span className="block h-4 w-3/4 animate-pulse rounded bg-[var(--color-placeholder)]" />
          </div>
        </div>
      </section>
      <div className="mt-8 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <span
            key={i}
            className="h-9 w-28 animate-pulse rounded-full bg-[var(--color-placeholder)]"
          />
        ))}
      </div>
      <section className="mt-10">
        <ArtworkGridSkeleton count={6} />
      </section>
    </main>
  );
}
