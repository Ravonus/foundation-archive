export default function ArtworkLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 pt-8 pb-16">
      <span className="inline-block h-4 w-24 animate-pulse rounded bg-[var(--color-placeholder)]" />
      <div className="mt-6 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="aspect-square w-full animate-pulse overflow-hidden rounded-sm bg-[var(--color-placeholder)]" />
        <div className="space-y-4">
          <span className="block h-3 w-1/3 animate-pulse rounded bg-[var(--color-placeholder)]" />
          <span className="block h-10 w-3/4 animate-pulse rounded bg-[var(--color-placeholder)]" />
          <span className="block h-6 w-24 animate-pulse rounded-full bg-[var(--color-placeholder)]" />
          <span className="block h-4 w-full animate-pulse rounded bg-[var(--color-placeholder)]" />
          <span className="block h-4 w-5/6 animate-pulse rounded bg-[var(--color-placeholder)]" />
          <div className="mt-8 grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <span className="block h-3 w-1/2 animate-pulse rounded bg-[var(--color-placeholder)]" />
                <span className="block h-4 w-2/3 animate-pulse rounded bg-[var(--color-placeholder)]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
