/* eslint-disable max-lines-per-function */

import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  Globe,
  HardDrive,
  Leaf,
  Network,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";

import {
  BracketFrame,
  CaptionTag,
  FeaturePanel,
  StatPanel,
  ThemedImage,
} from "~/app/_components/brand";
import {
  MissionPageShell,
  QuotePanel,
  SectionCard,
} from "~/app/_components/mission-page";
import { FadeUp, Stagger } from "~/app/_components/motion";

export const metadata: Metadata = {
  title: "Decentralization",
  description:
    "Why Foundation Archive is building agorix.io, a decentralized preservation service layer for keeping artwork reachable for the long haul.",
  openGraph: {
    title: "Decentralization at Foundation Archive",
    description:
      "Demand deserves decentralization. Meet agorix.io, the service layer under Foundation Archive.",
    images: [
      {
        url: "/decenterlizePage.png",
        width: 1731,
        height: 909,
        alt: "Demand deserves decentralization. agorix.io.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Decentralization at Foundation Archive",
    description:
      "Demand deserves decentralization. Meet agorix.io, the service layer under Foundation Archive.",
    images: ["/decenterlizePage.png"],
  },
};

const features = [
  {
    eyebrow: "Protected",
    title: "Smart protection",
    body: "Advanced moderation and smart automation keep your works safe and whole: verified content-addressed storage and continuous integrity checks.",
    icon: <Shield aria-hidden className="h-5 w-5" />,
  },
  {
    eyebrow: "Blazing fast",
    title: "Optimized retrieval",
    body: "Optimized systems that deliver performance across gateways, regions, and peers, so accessing the work feels instantaneous.",
    icon: <Zap aria-hidden className="h-5 w-5" />,
  },
  {
    eyebrow: "Growing",
    title: "Always expanding",
    body: "New features, continuous improvements, and a team built to evolve alongside the art and the artists carrying it forward.",
    icon: <Leaf aria-hidden className="h-5 w-5" />,
  },
  {
    eyebrow: "Community first",
    title: "More than a service. A community.",
    body: "We believe in building lasting relationships and empowering artists, developers, and the members who care about their work.",
    icon: <Sparkles aria-hidden className="h-5 w-5" />,
    tone: "ink" as const,
  },
  {
    eyebrow: "Reliable",
    title: "Always online",
    body: "Reliable uptime keeps your community running through outages and handoffs, without interruption.",
    icon: <Globe aria-hidden className="h-5 w-5" />,
    tone: "ink" as const,
  },
  {
    eyebrow: "Powerful",
    title: "Made for communities",
    body: "Powerful tools to connect, manage, and grow together: open infrastructure operators and archivists can plug into.",
    icon: <HardDrive aria-hidden className="h-5 w-5" />,
    tone: "ink" as const,
  },
];

const operators = [
  "Storage providers",
  "Gateway operators",
  "Verifiers",
  "Mirror hosts",
  "Collector custodians",
  "Artists",
];

export default function DecentralizationPage() {
  return (
    <MissionPageShell
      eyebrow="The long-term direction"
      title={
        <>
          Demand deserves{" "}
          <span className="font-semibold text-[var(--color-brand-green)]">
            decentralization
          </span>
          .
        </>
      }
      intro="Foundation Archive is the front line. agorix.io is the service layer underneath. Together they turn preservation from a single-host gamble into a network that carries the work forward, so artists aren't held hostage and culture stays accessible."
      supporting="Decentralization here isn't ideology. It's a design requirement for keeping artwork reachable long after any single operator, product, or hosting bill changes."
      actions={[
        { href: "/donate", label: "Support the work" },
        { href: "/archive", label: "See what is already saved" },
      ]}
    >
      <FadeUp inView>
        <section className="relative overflow-hidden rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface-alt)]">
          <div className="grid gap-0 lg:grid-cols-[1.05fr_1fr]">
            <div className="relative p-8 sm:p-10">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
                Introducing
              </p>
              <h2 className="mt-3 font-serif text-4xl leading-[1.05] tracking-tight text-[var(--color-ink)] sm:text-5xl">
                <span className="text-[var(--color-brand-green)]">agorix.io</span>
                <span className="block">the decentralized preservation layer.</span>
              </h2>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--color-body)]">
                agorix.io is the open service layer we&apos;re building under
                Foundation Archive. It coordinates storage, replication,
                verification, and retrieval across independent operators, so
                the art above it keeps living even when any single participant
                steps away.
              </p>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--color-muted)]">
                One side contributes compute, bandwidth, and uptime. The other
                side expresses ongoing demand for specific works to remain
                reachable. The match between those two sides is what keeps the
                media alive.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/donate"
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--color-brand-green)] px-4 py-2 text-sm text-white hover:bg-[var(--color-brand-green-bright)]"
                >
                  Fund the build
                </Link>
                <Link
                  href="/about"
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-alt)]"
                >
                  Who&apos;s building it
                </Link>
              </div>

              <div className="mt-8">
                <CaptionTag
                  entries={[
                    { label: "Network", value: "agorix.io" },
                    { label: "Role", value: "Service layer" },
                    { label: "Status", value: "Building · 2026" },
                  ]}
                />
              </div>
            </div>

            <div className="relative flex items-center justify-center border-t border-[var(--color-line)] bg-[var(--color-surface)] p-8 sm:p-10 lg:border-l lg:border-t-0">
              <NetworkDiagram />
            </div>
          </div>
        </section>
      </FadeUp>

      <QuotePanel
        eyebrow="The core line"
        quote="What if I told you we built a decentralized solution that fixes all this?"
        body="That means a system where preservation is no longer a single point of failure. The archive can start the work. The network keeps carrying it forward."
      />

      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <FeaturePanel
            key={feature.title}
            eyebrow={feature.eyebrow}
            title={feature.title}
            body={feature.body}
            icon={feature.icon}
            tone={feature.tone ?? "paper"}
          />
        ))}
      </Stagger>

      <FadeUp inView>
        <section className="relative overflow-hidden rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
                Service layer thesis
              </p>
              <h2 className="mt-3 font-serif text-3xl leading-tight tracking-tight text-[var(--color-ink)] sm:text-4xl">
                A better chance to keep culture alive online.
              </h2>
              <div className="mt-5 space-y-4 text-sm leading-relaxed text-[var(--color-body)] sm:text-base">
                <p>
                  We&apos;re not trying to build a prettier silo. We&apos;re building
                  coordination around permanence. Preservation becomes
                  continuous instead of reactive. Works stay replicated and
                  verifiable before the cliff arrives, not after.
                </p>
                <p>
                  If we get this right, the archive is more than a rescue
                  operation. It becomes a demand signal for permanence, a
                  discovery layer for what matters, and an on-ramp into a
                  broader network that keeps important media retrievable for a
                  very long time.
                </p>
              </div>

              <Stagger className="mt-6 grid gap-3 sm:grid-cols-3">
                <StatPanel
                  value="Distributed"
                  label="Topology"
                  note="No single point of failure."
                />
                <StatPanel
                  value="Demand-driven"
                  label="Economics"
                  note="Services built for artists and collectors."
                />
                <StatPanel
                  value="Lasting"
                  label="Access"
                  note="More copies. Stronger future."
                />
              </Stagger>
            </div>

            <div className="relative flex items-center justify-center">
              <BracketFrame padding="lg" className="w-full max-w-md">
                <ThemedImage
                  light="/images(4)_light.png"
                  dark="/images(4)_dark.png"
                  alt="Abstract green composition with decentralized panels"
                  width={640}
                  height={640}
                  className="h-auto w-full rounded-md"
                  sizes="(min-width: 1024px) 480px, 80vw"
                />
                <div className="mt-4">
                  <CaptionTag
                    entries={[
                      { label: "Artist", value: "agorix.network" },
                      { label: "Title", value: "Resilience study" },
                      { label: "Cid", value: "bafyb…ch0f" },
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
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xl">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-muted)]">
                Who participates
              </p>
              <h2 className="mt-2 font-serif text-3xl leading-tight tracking-tight text-[var(--color-ink)] sm:text-4xl">
                Open to anyone willing to carry the work forward.
              </h2>
            </div>
            <p className="max-w-md text-sm text-[var(--color-body)]">
              agorix.io is designed so many kinds of participants can
              contribute: storage, bandwidth, verification, curation, demand.
              No single class of operator is load-bearing.
            </p>
          </div>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {operators.map((operator) => (
              <li
                key={operator}
                className="flex items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-4 text-sm"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-brand-green-soft)] text-[var(--color-brand-green)]">
                  <CheckCircle2 aria-hidden className="h-4 w-4" />
                </span>
                <span className="text-[var(--color-ink)]">{operator}</span>
              </li>
            ))}
          </ul>
        </section>
      </FadeUp>

      <Stagger className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          eyebrow="The problem"
          title="Too much art still survives by accident"
          body="When media lives behind one service layer, one CDN, or one business model, it can disappear without anyone making a dramatic announcement. Links rot quietly. Storage gets de-prioritized. Demand still exists; the infrastructure carrying it does not."
        />
        <SectionCard
          eyebrow="Why support still matters"
          title="We still have to build the bridge from today to that future"
          body="The decentralized layer doesn't appear by magic. It has to be designed, shipped, tested, and grown from real use. Support helps us keep saving work in public while we build the system that can keep it around for much longer."
        />
      </Stagger>

      <FadeUp inView>
        <section className="relative overflow-hidden rounded-[2rem] border border-[var(--color-line-strong)] bg-[#0f1512] p-8 text-white sm:p-12">
          <div aria-hidden className="feature-panel-glow" />
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[#a6c2ae]">
            Call to build
          </p>
          <h2 className="mt-3 max-w-3xl font-serif text-3xl leading-tight tracking-tight sm:text-5xl">
            Help fund the decentralized
            <span className="text-[var(--color-brand-green-bright)]"> preservation </span>
            layer.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#c6d2ca] sm:text-lg">
            Foundation Archive is already saving work. agorix.io is how we make
            sure it stays reachable for the long haul. If that future matters
            to you, there&apos;s a way to back it.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/donate"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--color-brand-green)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-brand-green-bright)]"
            >
              Donate
            </Link>
            <Link
              href="/about"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm text-white hover:bg-white/10"
            >
              Meet the builder
            </Link>
          </div>
        </section>
      </FadeUp>
    </MissionPageShell>
  );
}

function NetworkDiagram() {
  const nodes = [
    { x: 50, y: 10, label: "Mirror" },
    { x: 88, y: 30, label: "Gateway" },
    { x: 88, y: 70, label: "Storage" },
    { x: 50, y: 90, label: "Verifier" },
    { x: 12, y: 70, label: "Peer" },
    { x: 12, y: 30, label: "Collector" },
  ];
  const center = { x: 50, y: 50 };

  return (
    <BracketFrame padding="lg" className="w-full max-w-md">
      <div className="relative aspect-square w-full">
        <svg
          viewBox="0 0 100 100"
          aria-hidden
          className="absolute inset-0 h-full w-full"
        >
          {nodes.map((n, i) => (
            <line
              key={`c-${i}`}
              x1={center.x}
              y1={center.y}
              x2={n.x}
              y2={n.y}
              stroke="currentColor"
              strokeWidth="0.25"
              strokeDasharray="1.2 1.2"
              className="text-[var(--color-brand-green)] opacity-60"
            />
          ))}
          {nodes.map((n, i) => {
            const next = nodes[(i + 1) % nodes.length] ?? nodes[0];
            if (!next) return null;
            return (
              <line
                key={`p-${i}`}
                x1={n.x}
                y1={n.y}
                x2={next.x}
                y2={next.y}
                stroke="currentColor"
                strokeWidth="0.2"
                strokeDasharray="0.8 1.6"
                className="text-[var(--color-line-strong)]"
              />
            );
          })}
          {nodes.map((n, i) => (
            <g key={`n-${i}`} transform={`translate(${n.x - 6} ${n.y - 6})`}>
              <rect
                width="12"
                height="12"
                rx="1.2"
                fill="var(--color-surface-alt)"
                stroke="var(--color-brand-green)"
                strokeWidth="0.5"
              />
              <rect
                x="2"
                y="2"
                width="8"
                height="8"
                rx="0.6"
                fill="color-mix(in oklab, var(--color-brand-green) 70%, transparent)"
              />
            </g>
          ))}
          <g transform={`translate(${center.x - 12} ${center.y - 12})`}>
            <rect
              width="24"
              height="24"
              rx="1.2"
              fill="color-mix(in oklab, var(--color-brand-green) 85%, black 10%)"
              stroke="var(--color-ink)"
              strokeWidth="0.6"
            />
            <g transform="translate(6 6)" className="text-[var(--color-bg)]">
              <Network aria-hidden width={12} height={12} stroke="currentColor" />
            </g>
          </g>
        </svg>
      </div>
      <div className="mt-4 flex flex-wrap justify-between gap-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-[var(--color-muted)]">
        <span>agorix · network</span>
        <span>6 roles · 1 goal</span>
      </div>
    </BracketFrame>
  );
}
