import "~/styles/globals.css";

import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Inter } from "next/font/google";

import { DesktopBridgeProvider } from "~/app/_components/desktop-bridge-provider";
import { PageFade } from "~/app/_components/motion";
import { SiteNav } from "~/app/_components/site-nav";
import { ThemeProvider } from "~/app/_components/theme/theme-provider";
import { ThemeToggle } from "~/app/_components/theme/theme-toggle";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Foundation Archive",
  description:
    "A preservation archive for Foundation artists. Search works, save ones you care about, and optionally keep your own copy with our desktop app.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
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
            <DesktopBridgeProvider>
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
                      className="group inline-flex min-w-0 items-center gap-2 sm:gap-3"
                      aria-label="Foundation Archive — home"
                    >
                      <span
                        aria-hidden
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-line-strong)] font-serif text-[0.78rem] leading-none text-[var(--color-ink)] transition group-hover:bg-[var(--color-ink)] group-hover:text-[var(--color-bg)]"
                      >
                        FA
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

                <footer className="mt-24 border-t border-[var(--color-line)]">
                  <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-10 text-sm text-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between">
                    <p className="max-w-md">
                      An independent preservation archive for Foundation
                      artists. Not affiliated with Foundation.
                    </p>
                    <div className="flex gap-5">
                      <Link
                        href="/desktop"
                        className="link-editorial hover:text-[var(--color-ink)]"
                      >
                        Desktop app
                      </Link>
                    </div>
                  </div>
                </footer>
              </div>
            </DesktopBridgeProvider>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
