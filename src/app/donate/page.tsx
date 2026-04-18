/* eslint-disable max-lines-per-function */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Heart, ShieldCheck, Sparkles } from "lucide-react";

import {
  BracketFrame,
  CaptionTag,
  FeaturePanel,
  ThemedImage,
} from "~/app/_components/brand";
import {
  MissionPageShell,
  QuotePanel,
  SectionCard,
  WalletSection,
} from "~/app/_components/mission-page";
import { FadeUp, Stagger } from "~/app/_components/motion";

const ETH_ENS_NAME = "ravonus.eth";
const ETH_ADDRESS = "0x961f67EFDacfcD05dFa35Ec63F050396F8AEdB90";
const BTC_ADDRESS = "bc1qfxtwncmeuadsggye438q564vwjshakl6d2xzqu";
const SOL_ADDRESS = "6Fv3zvKSBLwTeyDWR7a2xMYt1Yx8kWFT6DkcAWcpqJgQ";

export const metadata: Metadata = {
  title: "Donate",
  description:
    "Support Foundation Archive and help build agorix.io, the decentralized preservation layer that keeps artwork reachable for the long haul.",
  openGraph: {
    title: "Donate to Foundation Archive",
    description:
      "Support the archive today. Fund the decentralized preservation layer for tomorrow.",
    images: [
      {
        url: "/decenterlizePage.png",
        width: 1731,
        height: 909,
        alt: "Support preservation. Donate to Foundation Archive.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Donate to Foundation Archive",
    description:
      "Support the archive today. Fund the decentralized preservation layer for tomorrow.",
    images: ["/decenterlizePage.png"],
  },
};

export default function DonatePage() {
  return (
    <MissionPageShell
      eyebrow="Support preservation"
      title={
        <>
          Help us keep art online long enough to become{" "}
          <span className="font-semibold text-[var(--color-brand-green)]">
            permanent
          </span>
          .
        </>
      }
      intro="Foundation Archive exists because too much digital art still depends on fragile hosting, changing business incentives, and too few people keeping copies alive. Donations fund the public archive running today, and they fund agorix.io, the decentralized layer that makes disappearing media much harder to lose tomorrow."
      supporting="If you want to back the work directly, these are the wallet addresses we use for support."
      actions={[
        { href: "/decentralization", label: "Read the decentralization plan" },
        { href: "/archive", label: "Browse the archive" },
      ]}
    >
      <FadeUp inView>
        <section className="relative overflow-hidden rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="grid gap-0 lg:grid-cols-[1.1fr_1fr]">
            <div className="relative p-8 sm:p-10">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
                Why donate
              </p>
              <h2 className="mt-3 font-serif text-3xl leading-tight tracking-tight text-[var(--color-ink)] sm:text-4xl">
                Your donation keeps it preserved.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--color-body)]">
                Foundation Archive is an independent preservation archive for
                Foundation artists. Every contribution pays for the practical
                work in front of us right now (indexing works, capturing media,
                serving the public archive) and for the decentralized service
                layer that extends that protection far beyond any one operator.
              </p>

              <div className="mt-7 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-[var(--color-brand-green)]">
                    Lasting access
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-body)]">
                    Protecting work for the long term.
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-[var(--color-brand-green)]">
                    Artist first
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-body)]">
                    Built for artists, respected by collectors.
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-[var(--color-brand-green)]">
                    Independent
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-body)]">
                    Community supported. Artist aligned.
                  </p>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#wallets"
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--color-brand-green)] px-5 py-2.5 text-sm font-medium uppercase tracking-[0.14em] text-white shadow-[0_12px_30px_-16px_rgba(46,111,74,0.7)] hover:bg-[var(--color-brand-green-bright)]"
                >
                  Donate
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </a>
                <Link
                  href="/decentralization"
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface-alt)] px-5 py-2.5 text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface)]"
                >
                  Learn more
                </Link>
              </div>

              <p className="mt-7 font-mono text-[0.58rem] uppercase tracking-[0.22em] text-[var(--color-subtle)]">
                foundationarchive.org / donate
              </p>
            </div>

            <div className="relative flex items-center justify-center border-t border-[var(--color-line)] bg-[var(--color-surface-alt)] p-8 sm:p-10 lg:border-l lg:border-t-0">
              <BracketFrame padding="lg" className="w-full max-w-md">
                <ThemedImage
                  light="/donate_image_light.png"
                  dark="/donate_image_dark.png"
                  alt="A hand holding a glowing green glass heart"
                  width={720}
                  height={720}
                  className="h-auto w-full rounded-md"
                  sizes="(min-width: 1024px) 460px, 80vw"
                  priority
                />
                <div className="mt-4">
                  <CaptionTag
                    entries={[
                      { label: "Artist", value: "ravonus" },
                      { label: "Title", value: "Carry (Support)" },
                      { label: "Cid", value: "bafyb…2d21" },
                    ]}
                  />
                </div>
              </BracketFrame>
            </div>
          </div>
        </section>
      </FadeUp>

      <QuotePanel
        eyebrow="The pitch"
        quote="What if I told you we built a decentralized solution that fixes all this"
        body="That's the real goal here. Not just rescuing files one by one, but building a preservation system that has more than one machine, more than one path, and more than one reason to keep important media available."
      />

      <div id="wallets">
        <WalletSection
          title="Direct support"
          body="Use whichever network is easiest for you. For Ethereum, you can send to the ENS name or the full address below. The ENS name was verified to resolve to this address on April 18, 2026."
          wallets={[
            {
              network: "Ethereum",
              label: ETH_ENS_NAME,
              value: ETH_ADDRESS,
              note: "ENS name and address point to the same destination.",
              href: `https://etherscan.io/address/${ETH_ADDRESS}`,
            },
            {
              network: "Bitcoin",
              label: BTC_ADDRESS,
              value: BTC_ADDRESS,
              note: "Native SegWit BTC address.",
              href: `https://mempool.space/address/${BTC_ADDRESS}`,
            },
            {
              network: "Solana",
              label: SOL_ADDRESS,
              value: SOL_ADDRESS,
              note: "Solana support address.",
              href: `https://solscan.io/account/${SOL_ADDRESS}`,
            },
          ]}
        />
      </div>

      <Stagger className="grid gap-4 sm:grid-cols-3">
        <FeaturePanel
          eyebrow="Today"
          title="Keep the public archive running"
          body="Indexing, capturing, pinning, serving. The unglamorous work that keeps artwork retrievable while the industry around it keeps shifting."
          icon={<ShieldCheck aria-hidden className="h-5 w-5" />}
        />
        <FeaturePanel
          eyebrow="Tomorrow"
          title="Fund agorix.io"
          body="Build the decentralized service layer that coordinates storage, verification, and retrieval across many operators, so media stops living on one host's promise."
          icon={<Sparkles aria-hidden className="h-5 w-5" />}
        />
        <FeaturePanel
          eyebrow="Always"
          title="Support the artists we rescue"
          body="Every archived work is linked back to the artist. Preservation should raise artists, not replace them. Donations help us keep that line intact."
          icon={<Heart aria-hidden className="h-5 w-5" />}
        />
      </Stagger>

      <Stagger className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          eyebrow="Why now"
          title="Preservation needs more than a rescue button"
          body="A lot of digital art vanishes quietly. Domains lapse, gateways disappear, storage bills stop getting paid, and works that mattered a great deal to someone one year become hard to retrieve the next. Support helps us respond before those losses become permanent."
        />
        <SectionCard
          eyebrow="What donations do"
          title="They fund the bridge between archive and permanence"
          body="Donations fund the day-to-day archive and the deeper infrastructure that spreads retention across more people, more machines, and more time."
        />
      </Stagger>

      <FadeUp inView>
        <section className="rounded-2xl border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface)] p-6 text-sm leading-relaxed text-[var(--color-muted)]">
          <p className="font-medium text-[var(--color-ink)]">
            Want the larger thesis?
          </p>
          <p className="mt-2">
            This isn&apos;t only about fundraising. It&apos;s about moving preservation
            out of a single-host mindset and into a system where demand,
            replication, and continued service keep media reachable for the
            long haul.
          </p>
          <Link
            href="/decentralization"
            className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--color-ink)]"
          >
            <span className="link-editorial">Read the decentralization page</span>
          </Link>
        </section>
      </FadeUp>
    </MissionPageShell>
  );
}
