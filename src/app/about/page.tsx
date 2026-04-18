/* eslint-disable max-lines-per-function */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import {
  BracketFrame,
  CaptionTag,
  FeaturePanel,
  LogoMark,
  ThemedImage,
} from "~/app/_components/brand";
import { MissionPageShell, SectionCard } from "~/app/_components/mission-page";
import { FadeUp, Stagger } from "~/app/_components/motion";

export const metadata: Metadata = {
  title: "About",
  description:
    "Foundation Archive is built by Ravonus, who has been working on archival and preservation tools for blockchain art since 2019.",
  openGraph: {
    title: "About Foundation Archive",
    description:
      "Built by Ravonus. Archival tools for blockchain art since 2019.",
    images: [
      {
        url: "/decenterlizePage.png",
        width: 1600,
        height: 900,
        alt: "Foundation Archive: about the maker",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "About Foundation Archive",
    description:
      "Built by Ravonus. Archival tools for blockchain art since 2019.",
    images: ["/decenterlizePage.png"],
  },
};

const timeline: { year: string; title: string; body: string }[] = [
  {
    year: "2019",
    title: "Started archival tooling for on-chain art",
    body: "Got pulled into the problem early, when the gap between “minted on-chain” and “actually retrievable” first became obvious. Began writing tools to index, mirror, and hold onto media that no one else was saving on purpose.",
  },
  {
    year: "2020 – 2022",
    title: "Shipped preservation pipelines across ecosystems",
    body: "Built ingestion, metadata crawling, and content-addressed storage flows across multiple chains and marketplaces. Lots of late-night debugging of IPFS pinning, gateway failures, CDN reshuffles, and silent dead links.",
  },
  {
    year: "2023 – 2025",
    title: "Focused on resilient media for artists",
    body: "Kept refining the same idea: the people who care most about a work are usually the best custodians for it. Preservation has to meet them where they are, not just live behind one company's storage bill.",
  },
  {
    year: "2026",
    title: "Foundation Archive + the decentralization plan",
    body: "Foundation Archive is the most direct version of that work so far. Save Foundation art in public now, and build the decentralized service layer that keeps it reachable long after any single host, gateway, or team moves on.",
  },
];

export default function AboutPage() {
  return (
    <MissionPageShell
      eyebrow="About"
      title={
        <>
          Building{" "}
          <span className="font-semibold text-[var(--color-brand-green)]">
            archival
          </span>{" "}
          tools for blockchain art since 2019.
        </>
      }
      intro="Hi, I'm Ravonus. I've spent the last several years working on the unsexy half of this space: making sure the art actually stays reachable. Foundation Archive is the clearest version of that work yet."
      supporting="The short version: too much digital art survives by accident. I'd rather it survive by design."
      actions={[
        { href: "/decentralization", label: "Read the decentralization plan" },
        { href: "/donate", label: "Support the work" },
      ]}
    >
      <FadeUp inView>
        <section className="relative overflow-hidden rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="grid gap-0 md:grid-cols-[1.1fr_1fr]">
            <div className="relative p-8 sm:p-10">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
                Maker
              </p>
              <h2 className="mt-3 font-serif text-3xl leading-tight tracking-tight text-[var(--color-ink)] sm:text-4xl">
                Ravonus
              </h2>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-[var(--color-body)]">
                I&apos;ve been writing archival and preservation tools for
                blockchain art since 2019. That means indexing works, capturing
                media, replicating it, and trying to keep the retrieval paths
                alive when the industry underneath moves on. Foundation Archive
                is the continuation of that work, focused on artists I&apos;ve
                been watching for years.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a
                  href="https://github.com/Ravonus"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface-alt)] px-4 py-2 text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface)]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    aria-hidden
                    fill="currentColor"
                  >
                    <path d="M12 .5C5.648.5.5 5.648.5 12c0 5.084 3.292 9.387 7.86 10.907.575.106.787-.25.787-.556 0-.274-.01-1-.016-1.966-3.196.695-3.873-1.541-3.873-1.541-.523-1.33-1.277-1.684-1.277-1.684-1.043-.714.08-.7.08-.7 1.154.081 1.761 1.185 1.761 1.185 1.026 1.758 2.691 1.25 3.348.955.104-.744.402-1.25.73-1.537-2.55-.29-5.233-1.277-5.233-5.685 0-1.255.447-2.28 1.18-3.085-.118-.29-.512-1.459.112-3.041 0 0 .964-.31 3.16 1.178.916-.255 1.9-.382 2.879-.387.978.005 1.962.132 2.879.387 2.195-1.488 3.158-1.178 3.158-1.178.625 1.582.232 2.751.114 3.041.735.805 1.179 1.83 1.179 3.085 0 4.419-2.687 5.391-5.245 5.676.411.354.779 1.053.779 2.123 0 1.534-.014 2.77-.014 3.147 0 .308.208.667.793.554C20.213 21.383 23.5 17.082 23.5 12 23.5 5.648 18.352.5 12 .5Z" />
                  </svg>
                  GitHub
                  <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                </a>
                <a
                  href="https://x.com/r4vonus"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface-alt)] px-4 py-2 text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface)]"
                >
                  <span aria-hidden className="text-xs font-bold">𝕏</span>
                  @r4vonus
                  <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="mt-8">
                <CaptionTag
                  entries={[
                    { label: "Based", value: "Independent" },
                    { label: "Focus", value: "Preservation · Decentralization" },
                    { label: "Since", value: "2019" },
                  ]}
                />
              </div>
            </div>

            <div className="relative flex items-center justify-center border-t border-[var(--color-line)] bg-[var(--color-surface-alt)] p-8 md:border-l md:border-t-0">
              <BracketFrame tone="default" padding="lg" className="w-full max-w-sm">
                <ThemedImage
                  light="/image_1_light.png"
                  dark="/image_1_dark.png"
                  alt="Foundation Archive mark: two overlapping squares"
                  width={420}
                  height={420}
                  className="h-auto w-full rounded-md"
                  sizes="(min-width: 768px) 360px, 80vw"
                />
                <div className="mt-4">
                  <CaptionTag
                    entries={[
                      { label: "Artist", value: "ravonus.eth" },
                      { label: "Title", value: "Untitled, 2025" },
                      { label: "Cid", value: "bafyb…c0f1" },
                    ]}
                  />
                </div>
              </BracketFrame>
            </div>
          </div>
        </section>
      </FadeUp>

      <FadeUp inView>
        <section className="rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface-alt)] p-6 sm:p-10">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
            Track record
          </p>
          <h2 className="mt-3 max-w-3xl font-serif text-3xl leading-tight tracking-tight text-[var(--color-ink)] sm:text-4xl">
            A working history of saving media that wasn&apos;t supposed to survive.
          </h2>
          <ol className="mt-8 space-y-6">
            {timeline.map((item, index) => (
              <li
                key={item.year}
                className="relative grid gap-3 border-t border-[var(--color-line)] pt-6 sm:grid-cols-[7rem_1fr] sm:gap-8"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-brand-green-soft)] text-[var(--color-brand-green)]">
                    <LogoMark size={14} withBrackets={false} />
                  </span>
                  <span className="font-mono text-[0.72rem] uppercase tracking-[0.2em] text-[var(--color-brand-green)]">
                    {item.year}
                  </span>
                  <span className="sr-only">Step {index + 1}</span>
                </div>
                <div>
                  <h3 className="font-serif text-xl leading-tight text-[var(--color-ink)] sm:text-2xl">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)] sm:text-base">
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </FadeUp>

      <Stagger className="grid gap-4 lg:grid-cols-3">
        <FeaturePanel
          eyebrow="Method"
          title="Save in public. Build in public."
          body="Every archived work is reachable. Every piece of tooling is built so other preservation operators can point at it, audit it, and reuse it."
        />
        <FeaturePanel
          eyebrow="Ethic"
          title="Artists stay in control."
          body="The goal isn't to hoard files. It's to keep work reachable on behalf of the people who made it, and support their ability to direct where it goes next."
        />
        <FeaturePanel
          eyebrow="Bet"
          title="Permanence has to be a system."
          body="One host, one gateway, one team: none of those are durable on their own. The long-term answer is a network that carries the work forward even when the current custodians stop paying attention."
        />
      </Stagger>

      <Stagger className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          eyebrow="What I'm building next"
          title="A decentralized preservation layer named agorix.io"
          body="Foundation Archive is a live preservation product today. agorix.io is the broader service layer underneath it: a network where demand, storage, verification, and retrieval coordinate so art can outlast any single operator. Read the decentralization page for the plan."
        />
        <SectionCard
          eyebrow="Why me"
          title="Seven years of mistakes you don't have to repeat"
          body="Pinning that silently fails. Gateways that vanish. Metadata that drifts. Mirrors that look healthy but aren't. Most of the work is the quiet infrastructure underneath. That's what I've been building since 2019."
        />
      </Stagger>

      <FadeUp inView>
        <section className="rounded-2xl border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface)] p-6 text-sm leading-relaxed text-[var(--color-muted)]">
          <p className="font-medium text-[var(--color-ink)]">Want to work together?</p>
          <p className="mt-2">
            If you&apos;re an artist, a collector, another preservation operator,
            or a team working on resilient storage, I&apos;d like to hear from
            you.
            The short term is saving more art. The long term is building the
            network that keeps it reachable.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/decentralization"
              className="inline-flex items-center gap-2 text-sm text-[var(--color-ink)]"
            >
              <span className="link-editorial">Read the decentralization plan</span>
            </Link>
            <Link
              href="/donate"
              className="inline-flex items-center gap-2 text-sm text-[var(--color-ink)]"
            >
              <span className="link-editorial">Support the work</span>
            </Link>
          </div>
        </section>
      </FadeUp>
    </MissionPageShell>
  );
}
