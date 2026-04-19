"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { cn } from "~/lib/utils";

const items = [
  { href: "/archive", label: "Archive" },
  { href: "/about", label: "About" },
  { href: "/desktop", label: "Desktop" },
];

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function SiteNav() {
  const pathname = usePathname();
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const open = openPathname === pathname;
  const toggleMenu = () => {
    setOpenPathname((current) => (current === pathname ? null : pathname));
  };
  const closeMenu = () => {
    setOpenPathname(null);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <nav
        aria-label="Primary"
        className="hidden items-center gap-5 text-sm sm:flex"
      >
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-active={active || undefined}
              className="link-editorial text-[var(--color-muted)] hover:text-[var(--color-ink)] data-[active=true]:text-[var(--color-ink)]"
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        onClick={toggleMenu}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-ink)] sm:hidden"
      >
        {open ? (
          <X aria-hidden className="h-4 w-4" />
        ) : (
          <Menu aria-hidden className="h-4 w-4" />
        )}
      </button>

      {open ? (
        <div
          id="mobile-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          className="fixed inset-0 z-50 sm:hidden"
        >
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-[var(--color-ink)]/40 backdrop-blur-sm"
            onClick={closeMenu}
          />
          <div className="absolute inset-x-0 top-0 border-b border-[var(--color-line)] bg-[var(--color-bg)] shadow-[0_30px_90px_-70px_rgba(17,17,17,0.35)]">
            <div className="flex items-center justify-between border-b border-[var(--color-line)] px-6 py-5">
              <span className="font-serif text-lg text-[var(--color-ink)]">
                Menu
              </span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={closeMenu}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-line-strong)] text-[var(--color-ink)]"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>
            <ul className="flex flex-col py-2">
              {items.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={closeMenu}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center justify-between px-6 py-4 text-base text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]",
                        active && "text-[var(--color-ink)]",
                      )}
                    >
                      <span>{item.label}</span>
                      {active ? (
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]"
                        />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
