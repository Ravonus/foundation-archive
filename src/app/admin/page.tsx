import { headers } from "next/headers";
import { forbidden } from "next/navigation";

import { ArchiveLiveBoard } from "~/app/_components/archive-live-board";
import { FadeUp } from "~/app/_components/motion";
import { isAllowedAdminRequest } from "~/server/admin-access";
import { getArchiveLiveSnapshot } from "~/server/archive/dashboard";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const requestHeaders = await headers();
  if (!isAllowedAdminRequest(requestHeaders)) {
    forbidden();
  }

  const snapshot = await getArchiveLiveSnapshot(db);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16 sm:px-6 sm:pt-10">
      <FadeUp duration={0.4}>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-line)] pb-5">
          <div>
            <p className="font-mono text-[0.62rem] tracking-[0.28em] text-[var(--color-muted)] uppercase">
              Archive control
            </p>
            <h1 className="mt-1 font-serif text-3xl text-[var(--color-ink)] sm:text-4xl">
              Admin
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-body)]">
              Start or pause scanning, adjust how fast the archive runs, and see
              where it is right now.
            </p>
          </div>
        </div>
      </FadeUp>

      <section className="mt-6">
        <ArchiveLiveBoard
          initialSnapshot={snapshot}
          title="Archive control"
          subtitle="Use a gentle pace if you want the archive to move more slowly. The running socket daemon will obey this automatically."
          compact
          showControls
          hideFeed
        />
      </section>
    </main>
  );
}
