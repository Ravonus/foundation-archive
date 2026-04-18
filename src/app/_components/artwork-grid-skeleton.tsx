import { cn } from "~/lib/utils";

export function ArtworkGridSkeleton({
  count = 9,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Loading works"
      className={cn(
        "grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, index) => (
        <article key={index} className="flex flex-col">
          <div className="relative aspect-square w-full overflow-hidden rounded-sm bg-[var(--color-placeholder)]">
            <span className="absolute left-3 top-3 inline-flex h-5 w-16 animate-pulse rounded-full bg-[var(--color-surface-alt)]" />
            <span className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent,var(--color-surface-alt),transparent)] opacity-40" />
          </div>
          <div className="mt-4 space-y-2">
            <span className="block h-4 w-3/4 animate-pulse rounded bg-[var(--color-placeholder)]" />
            <span className="block h-3 w-1/2 animate-pulse rounded bg-[var(--color-placeholder)]" />
          </div>
        </article>
      ))}
    </div>
  );
}
