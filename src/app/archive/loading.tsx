import { ArtworkGridSkeleton } from "~/app/_components/artwork-grid-skeleton";

export default function ArchiveLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <div className="sticky top-[calc(var(--header-offset,64px))] z-30 -mx-4 border-b border-[var(--color-line)] bg-[var(--color-bg)]/90 px-4 pt-6 pb-4 backdrop-blur-md sm:-mx-6 sm:px-6 sm:pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
              Archive
            </p>
            <h1 className="mt-1 font-serif text-3xl leading-tight text-[var(--color-ink)] sm:text-4xl">
              Search the archive
            </h1>
          </div>
          <div className="flex gap-3">
            <span className="h-4 w-20 animate-pulse rounded bg-[var(--color-placeholder)]" />
            <span className="h-4 w-16 animate-pulse rounded bg-[var(--color-placeholder)]" />
          </div>
        </div>
        <div className="mt-4 h-11 animate-pulse rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)]" />
      </div>

      <div className="mt-8 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 sm:p-4">
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className="h-7 w-20 animate-pulse rounded-full bg-[var(--color-surface-alt)]"
            />
          ))}
        </div>
      </div>

      <section className="mt-8">
        <ArtworkGridSkeleton count={9} />
      </section>
    </main>
  );
}
