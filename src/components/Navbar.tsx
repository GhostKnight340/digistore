"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/context/StoreContext";
import { useStoreSettings } from "@/context/StoreSettingsContext";

const links = [
  { href: "/products", label: "Catégories" },
  { href: "/find-order", label: "Retrouver ma commande" },
  { href: "/support", label: "Aide" },
];

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.6" y2="16.6" />
    </svg>
  );
}

export default function Navbar() {
  const { cartCount, ready } = useStore();
  const { settings } = useStoreSettings();
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);

  // Close the mobile overlays whenever the route changes.
  useEffect(() => {
    setSearchOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  // Focus the search field as soon as the mobile search row expands.
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Close the menu on outside tap (a fixed backdrop is unreliable inside the
  // header's backdrop-filter containing block) and on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !menuPanelRef.current?.contains(target) &&
        !menuButtonRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-base/75 backdrop-blur-xl">
      <nav className="container-page flex min-h-[56px] items-center gap-2 py-2 md:min-h-[66px] md:gap-7 md:py-0">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-[#2b5fd9] shadow-glow">
            <span className="h-3 w-3 rounded-[3px] border-2 border-white" />
          </span>
          <span className="hidden text-lg font-semibold tracking-tight text-text sm:block">
            {settings.branding.logoText}
          </span>
        </Link>

        {/* Search — desktop only */}
        <form
          action="/products"
          className="relative hidden h-10 max-w-[440px] flex-1 items-center md:flex"
          role="search"
        >
          <input
            name="q"
            placeholder="Rechercher un produit numérique..."
            className="h-full w-full rounded-[10px] border border-border bg-surface px-10 pr-14 text-sm text-text outline-none transition placeholder:text-faint focus:border-accent/70 focus:ring-2 focus:ring-accent/25"
            aria-label="Rechercher des produits"
          />
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-faint lg:block">
            ⌘K
          </span>
        </form>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {/* Desktop text links */}
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`hidden rounded-lg px-3 py-2 text-sm font-medium transition hover:text-text md:block ${
                pathname.startsWith(l.href) ? "text-text" : "text-muted"
              }`}
            >
              {l.label}
            </Link>
          ))}

          {/* Mobile search toggle */}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setSearchOpen((open) => !open);
            }}
            className={`grid h-10 w-10 place-items-center rounded-xl transition hover:text-text md:hidden ${
              searchOpen ? "text-text" : "text-muted"
            }`}
            aria-label="Rechercher"
            aria-expanded={searchOpen}
          >
            <SearchIcon className="h-5 w-5" />
          </button>

          {/* Cart */}
          <Link
            href="/cart"
            className="relative grid h-10 w-10 place-items-center rounded-xl text-muted transition hover:text-text"
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

          {/* Mobile help shortcut */}
          <Link
            href="/support"
            className="grid h-10 w-10 place-items-center rounded-xl text-muted transition hover:text-text md:hidden"
            aria-label="Aide"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-5 w-5"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.9" />
              <line x1="12" y1="17.2" x2="12" y2="17.3" />
            </svg>
          </Link>

          {/* Login — desktop button */}
          <Link
            href="/login"
            className="hidden rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm font-medium text-text transition hover:bg-elevated md:inline-flex md:items-center md:px-4"
          >
            Se connecter
          </Link>

          {/* Login — mobile icon */}
          <Link
            href="/login"
            className="grid h-10 w-10 place-items-center rounded-xl text-muted transition hover:text-text md:hidden"
            aria-label="Se connecter"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-5 w-5"
              aria-hidden
            >
              <circle cx="12" cy="8" r="3.4" />
              <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
            </svg>
          </Link>

          {/* Mobile menu toggle */}
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => {
              setSearchOpen(false);
              setMenuOpen((open) => !open);
            }}
            className={`grid h-10 w-10 place-items-center rounded-xl transition hover:text-text md:hidden ${
              menuOpen ? "text-text" : "text-muted"
            }`}
            aria-label="Menu"
            aria-expanded={menuOpen}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-5 w-5"
              aria-hidden
            >
              <line x1="3.5" y1="7" x2="20.5" y2="7" />
              <line x1="3.5" y1="12" x2="20.5" y2="12" />
              <line x1="3.5" y1="17" x2="20.5" y2="17" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile search row — expands only when the search icon is tapped */}
      {searchOpen && (
        <div className="border-t border-border bg-base/95 px-4 py-2 md:hidden">
          <form
            action="/products"
            className="relative flex h-11 items-center gap-2"
            role="search"
          >
            <div className="relative flex h-full flex-1 items-center">
              <input
                ref={searchInputRef}
                name="q"
                placeholder="Rechercher un produit numérique..."
                className="h-full w-full rounded-[10px] border border-border bg-surface pl-10 pr-3 text-sm text-text outline-none transition placeholder:text-faint focus:border-accent/70 focus:ring-2 focus:ring-accent/25"
                aria-label="Rechercher des produits"
              />
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            </div>
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="grid h-full w-11 shrink-0 place-items-center rounded-[10px] border border-border bg-surface text-muted transition hover:text-text"
              aria-label="Fermer la recherche"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="h-4 w-4"
                aria-hidden
              >
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <div
          ref={menuPanelRef}
          className="absolute right-3 top-full z-40 mt-1 w-60 rounded-xl border border-border-strong bg-elevated p-1.5 shadow-soft md:hidden"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition hover:bg-surface2 hover:text-text ${
                pathname.startsWith(l.href) ? "text-text" : "text-muted"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
