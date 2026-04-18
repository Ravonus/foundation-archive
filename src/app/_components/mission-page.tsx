import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";

import { CopyButton } from "~/app/_components/copy-button";
import { FadeUp, Stagger } from "~/app/_components/motion";

type PageAction = {
  href: string;
  label: string;
};

type WalletCard = {
  network: string;
  label: string;
  value: string;
  note?: string;
  href?: string;
};

export function MissionPageShell({
  eyebrow,
  title,
  intro,
  supporting,
  actions,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  intro: string;
  supporting?: string;
  actions?: PageAction[];
  children: React.ReactNode;
}) {
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
        <FadeUp delay={0} duration={0.4}>
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
            {eyebrow}
          </p>
        </FadeUp>

        <FadeUp delay={0.08} duration={0.45}>
          <h1 className="mt-3 max-w-4xl font-serif text-4xl leading-[1.04] tracking-tight text-[var(--color-ink)] sm:text-6xl">
            {title}
          </h1>
        </FadeUp>

        <FadeUp delay={0.18} duration={0.55}>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--color-body)] sm:text-lg">
            {intro}
          </p>
          {supporting ? (
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-muted)] sm:text-base">
              {supporting}
            </p>
          ) : null}
        </FadeUp>

        {actions?.length ? (
          <FadeUp delay={0.28} duration={0.45}>
            <div className="mt-6 flex flex-wrap gap-3">
              {actions.map((action, index) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className={
                    index === 0
                      ? "inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)] hover:opacity-90"
                      : "inline-flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-alt)]"
                  }
                >
                  {action.label}
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </FadeUp>
        ) : null}
      </header>

      <div className="mt-8 space-y-8">{children}</div>
    </main>
  );
}

export function QuotePanel({
  eyebrow,
  quote,
  body,
}: {
  eyebrow: string;
  quote: string;
  body: string;
}) {
  return (
    <FadeUp delay={0.08} duration={0.45}>
      <section className="rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-6 sm:p-8">
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
          {eyebrow}
        </p>
        <blockquote className="mt-3 max-w-4xl font-serif text-2xl leading-tight text-[var(--color-ink)] sm:text-4xl">
          {quote}
        </blockquote>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--color-body)] sm:text-base">
          {body}
        </p>
      </section>
    </FadeUp>
  );
}

export function SectionCard({
  eyebrow,
  title,
  body,
}: {
  eyebrow?: string;
  title: string;
  body: string;
}) {
  return (
    <article className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
      {eyebrow ? (
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-2 font-serif text-2xl leading-tight text-[var(--color-ink)] sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-body)] sm:text-base">
        {body}
      </p>
    </article>
  );
}

export function WalletSection({
  title,
  body,
  wallets,
}: {
  title: string;
  body: string;
  wallets: WalletCard[];
}) {
  return (
    <section className="rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 sm:p-8">
      <FadeUp inView>
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
          Wallets
        </p>
        <h2 className="mt-2 font-serif text-2xl text-[var(--color-ink)] sm:text-3xl">
          {title}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-body)] sm:text-base">
          {body}
        </p>
      </FadeUp>

      <Stagger className="mt-6 grid gap-4 md:grid-cols-3">
        {wallets.map((wallet) => {
          const hasSeparateLabel = wallet.label !== wallet.value;
          return (
            <article
              key={`${wallet.network}-${wallet.value}`}
              className="flex h-full min-w-0 flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-5"
            >
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-[var(--color-muted)]">
                {wallet.network}
              </p>
              {hasSeparateLabel ? (
                <p className="mt-3 break-all text-lg font-medium leading-tight text-[var(--color-ink)]">
                  {wallet.label}
                </p>
              ) : null}
              <p
                className={`${hasSeparateLabel ? "mt-2" : "mt-3"} break-all font-mono text-[0.72rem] leading-relaxed text-[var(--color-body)] sm:text-xs`}
              >
                {wallet.value}
              </p>
              {wallet.note ? (
                <p className="mt-3 text-xs leading-relaxed text-[var(--color-muted)]">
                  {wallet.note}
                </p>
              ) : null}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                <CopyButton value={wallet.value} label="Copy address" />
                {hasSeparateLabel ? (
                  <CopyButton value={wallet.label} label="Copy name" />
                ) : null}
                {wallet.href ? (
                  <a
                    href={wallet.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
                  >
                    View
                    <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </Stagger>
    </section>
  );
}
