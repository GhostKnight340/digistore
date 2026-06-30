"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/context/StoreContext";
import { useStoreSettings } from "@/context/StoreSettingsContext";

const links = [
  { href: "/products", label: "Catégories" },
  { href: "/find-order", label: "Retrouver ma commande" },
  { href: "/support", label: "Aide" },
];

export default function Navbar() {
  const { cartCount, ready } = useStore();
  const { settings } = useStoreSettings();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-base/75 backdrop-blur-xl">
      <nav className="container-page flex h-[66px] items-center gap-4 md:gap-7">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-[#2b5fd9] shadow-glow">
            <span className="h-3 w-3 rounded-[3px] border-2 border-white" />
          </span>
          <span className="hidden text-lg font-semibold tracking-tight text-text sm:block">
            {settings.branding.logoText}
          </span>
        </Link>

        {/* Search */}
        <form
          action="/products"
          className="relative hidden h-10 max-w-[440px] flex-1 items-center md:flex"
          role="search"
        >
          <input
            name="q"
            placeholder="Rechercher un produit num?rique..."
            className="h-full w-full rounded-[10px] border border-border bg-surface px-10 pr-14 text-sm text-text outline-none transition placeholder:text-faint focus:border-accent/70 focus:ring-2 focus:ring-accent/25"
            aria-label="Rechercher des produits"
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.6" y2="16.6" />
          </svg>
          <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-faint lg:block">
            ⌘K
          </span>
        </form>

        {/* Links */}
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`hidden rounded-lg px-3 py-2 text-sm font-medium transition hover:text-text sm:block ${
                pathname.startsWith(l.href) ? "text-text" : "text-muted"
              }`}
            >
              {l.label}
            </Link>
          ))}

          <Link
            href="/cart"
            className="relative rounded-xl px-2.5 py-2 text-muted transition hover:text-text"
            aria-label="Panier"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-5 w-5"
              aria-hidden
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="18" cy="21" r="1" />
              <path d="M2 3h2.5l2.2 12.4a1.5 1.5 0 0 0 1.5 1.2h8.8a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
            </svg>
            {ready && cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">
                {cartCount}
              </span>
            )}
          </Link>

          <Link
            href="/login"
            className="rounded-lg border border-border-strong bg-surface2 px-4 py-2 text-sm font-medium text-text transition hover:bg-elevated"
          >
            Se connecter
          </Link>
        </div>
      </nav>
    </header>
  );
}
