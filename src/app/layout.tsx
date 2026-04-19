import "~/styles/globals.css";

import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Inter } from "next/font/google";

import { UmamiScript } from "~/app/_components/analytics/umami-script";
import { LogoMark } from "~/app/_components/brand";
import { PageFade } from "~/app/_components/motion";
import { SiteFooter } from "~/app/_components/site-footer";
import { SiteNav } from "~/app/_components/site-nav";
import { ThemeProvider } from "~/app/_components/theme/theme-provider";
import { ThemeToggle } from "~/app/_components/theme/theme-toggle";
import { TRPCReactProvider } from "~/trpc/react";

const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const siteUrl =
  configuredSiteUrl && configuredSiteUrl.length > 0
    ? configuredSiteUrl
    : "https://foundation.agorix.io";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Agorix",
    template: "%s | Agorix",
  },
  description:
    "Agorix is building a public Foundation archive in response to the recent news. Search saved works, back up pieces you care about, and help keep them reachable.",
  applicationName: "Agorix",
  keywords: [
    "Foundation",
    "Foundation.app",
    "archive",
    "preservation",
    "decentralization",
    "IPFS",
    "NFT archive",
    "agorix",
    "digital art preservation",
  ],
  authors: [{ name: "Ravonus" }],
  creator: "Ravonus",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Agorix",
    title: "Agorix: a public Foundation archive and preservation network",
    description:
      "Agorix is building this public Foundation archive because of the recent news, while the wider network grows underneath it.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agorix: a public Foundation archive and preservation network",
    description:
      "Agorix is building this public Foundation archive because of the recent news, while the wider network grows underneath it.",
    creator: "@r4vonus",
  },
  icons: {
    icon: [
      {
        url: "/logo-light.ico",
        media: "(prefers-color-scheme: light)",
        sizes: "any",
      },
      {
        url: "/logo-dark.ico",
        media: "(prefers-color-scheme: dark)",
        sizes: "any",
      },
      {
        url: "/logo-light.png",
        media: "(prefers-color-scheme: light)",
        type: "image/png",
      },
      {
        url: "/logo-dark.png",
        media: "(prefers-color-scheme: dark)",
        type: "image/png",
      },
    ],
    shortcut: [
      {
        url: "/logo-light.ico",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/logo-dark.ico",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    apple: [
      {
        url: "/logo-light.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/logo-dark.png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
};

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable}`}
    >
      <body className="font-sans antialiased">
        <ThemeProvider>
          <TRPCReactProvider>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--color-ink)] focus:px-3 focus:py-2 focus:text-sm focus:text-[var(--color-bg)]"
            >
              Skip to main content
            </a>
          <div className="relative z-10 min-h-screen">
            <header className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-[var(--color-bg)]/85 backdrop-blur-sm">
              <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
                <Link
                  href="/"
                  className="group inline-flex min-w-0 items-center gap-2.5 sm:gap-3"
                  aria-label="Agorix home"
                >
                  <span
                    aria-hidden
                    className="inline-flex shrink-0 items-center justify-center transition group-hover:-rotate-12"
                  >
                    <LogoMark size={28} />
                  </span>
                  <span className="block whitespace-nowrap pb-[0.08em] font-serif text-[1.05rem] leading-[1.08] tracking-tight text-[var(--color-ink)] sm:text-[1.2rem]">
                    Agorix
                  </span>
                </Link>

                <div className="flex items-center gap-3 sm:gap-5">
                  <SiteNav />
                  <span
                    aria-hidden
                    className="hidden h-4 w-px bg-[var(--color-line)] sm:inline-block"
                  />
                  <ThemeToggle />
                </div>
              </div>
            </header>

            <div id="main">
              <PageFade>{children}</PageFade>
            </div>

            <SiteFooter />
          </div>
          </TRPCReactProvider>
        </ThemeProvider>
        <UmamiScript />
      </body>
    </html>
  );
}
