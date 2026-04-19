import Link from "next/link";

import { LogoMark } from "~/app/_components/brand";

const nav: { label: string; href: string }[] = [
  { label: "Archive", href: "/archive" },
  { label: "Donate", href: "/donate" },
  { label: "About", href: "/about" },
  { label: "Desktop app", href: "/desktop" },
];

const external: { label: string; href: string; icon: React.ReactNode }[] = [
  {
    label: "GitHub",
    href: "https://github.com/Ravonus/foundation-archive",
    icon: <GithubIcon />,
  },
  {
    label: "X / Twitter",
    href: "https://x.com/r4vonus",
    icon: <XIcon />,
  },
];

function GithubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden
      fill="currentColor"
    >
      <path d="M12 .5C5.648.5.5 5.648.5 12c0 5.084 3.292 9.387 7.86 10.907.575.106.787-.25.787-.556 0-.274-.01-1-.016-1.966-3.196.695-3.873-1.541-3.873-1.541-.523-1.33-1.277-1.684-1.277-1.684-1.043-.714.08-.7.08-.7 1.154.081 1.761 1.185 1.761 1.185 1.026 1.758 2.691 1.25 3.348.955.104-.744.402-1.25.73-1.537-2.55-.29-5.233-1.277-5.233-5.685 0-1.255.447-2.28 1.18-3.085-.118-.29-.512-1.459.112-3.041 0 0 .964-.31 3.16 1.178.916-.255 1.9-.382 2.879-.387.978.005 1.962.132 2.879.387 2.195-1.488 3.158-1.178 3.158-1.178.625 1.582.232 2.751.114 3.041.735.805 1.179 1.83 1.179 3.085 0 4.419-2.687 5.391-5.245 5.676.411.354.779 1.053.779 2.123 0 1.534-.014 2.77-.014 3.147 0 .308.208.667.793.554C20.213 21.383 23.5 17.082 23.5 12 23.5 5.648 18.352.5 12 .5Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden
      fill="currentColor"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.643Z" />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-[var(--color-line)] bg-[var(--color-surface-quiet)]">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-14 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="max-w-md">
          <div className="flex items-center gap-2.5">
            <LogoMark size={24} />
            <span className="font-serif text-[1.05rem] tracking-tight text-[var(--color-ink)]">
              Agorix
            </span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-[var(--color-muted)]">
            Agorix is the broader preservation project. This public site is our
            Foundation archive response to the recent news, built to keep work
            reachable long after any single host, gateway, or platform stops
            carrying it. Not affiliated with Foundation.
          </p>
          <p className="mt-3 font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--color-subtle)]">
            Public archive · Recent response · Lasting access
          </p>
        </div>

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-[auto_auto]">
          <div>
            <p className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-[var(--color-subtle)]">
              Explore
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-umami-event="footer-nav-click"
                    data-umami-event-label={item.label}
                    className="link-editorial text-[var(--color-body)] hover:text-[var(--color-ink)]"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-[var(--color-subtle)]">
              Connect
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {external.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    data-umami-event="footer-external-click"
                    data-umami-event-label={item.label}
                    className="inline-flex items-center gap-2 text-[var(--color-body)] hover:text-[var(--color-brand-green)]"
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)]">
                      {item.icon}
                    </span>
                    <span className="link-editorial">{item.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--color-line)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-3 px-6 py-5 text-xs text-[var(--color-subtle)] sm:flex-row sm:items-center">
          <p className="font-mono uppercase tracking-[0.22em]">
            © {new Date().getFullYear()} Agorix
          </p>
          <p className="font-mono uppercase tracking-[0.22em]">
            Independent · Decentralized · Artist-aligned
          </p>
        </div>
      </div>
    </footer>
  );
}
