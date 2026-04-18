import "~/styles/globals.css";

import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Inter } from "next/font/google";

import { LogoMark } from "~/app/_components/brand";
import { PageFade } from "~/app/_components/motion";
import { SiteFooter } from "~/app/_components/site-footer";
import { SiteNav } from "~/app/_components/site-nav";
import { ThemeProvider } from "~/app/_components/theme/theme-provider";
import { ThemeToggle } from "~/app/_components/theme/theme-toggle";
import { TRPCReactProvider } from "~/trpc/react";

const siteUrl = "https://foundationarchive.org";
const ogImage = {
  url: "/decenterlizePage.png",
  width: 1600,
  height: 900,
  alt: "Foundation Archive: a preservation archive for Foundation artists",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Foundation Archive",
    template: "%s | Foundation Archive",
  },
  description:
    "A preservation archive for Foundation artists. Search works, save ones you care about, and optionally keep your own copy with our desktop app.",
  applicationName: "Foundation Archive",
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
    siteName: "Foundation Archive",
    title: "Foundation Archive: independent preservation for Foundation artists",
    description:
      "Independent preservation for Foundation artists. Save the art. Build the decentralized service layer that keeps it reachable.",
    images: [ogImage],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Foundation Archive: independent preservation for Foundation artists",
    description:
      "Independent preservation for Foundation artists. Save the art. Build the decentralized service layer that keeps it reachable.",
    creator: "@r4vonus",
    images: [ogImage.url],
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
                    aria-label="Foundation Archive home"
                  >
                    <span
                      aria-hidden
                      className="inline-flex shrink-0 items-center justify-center transition group-hover:-rotate-12"
                    >
                      <LogoMark size={28} />
                    </span>
                    <span className="truncate font-serif text-[1.05rem] leading-none tracking-tight text-[var(--color-ink)] sm:text-[1.2rem]">
                      Foundation Archive
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
      </body>
    </html>
  );
}
