"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logoutCustomerAction } from "@/app/actions/auth";
import { useStore } from "@/context/StoreContext";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import HeaderSearch from "./HeaderSearch";

const links = [
  { href: "/products", label: "Catalogue" },
  { href: "/guides", label: "Guides" },
  { href: "/find-order", label: "Suivi commande" },
  { href: "/support", label: "Support" },
];

export default function Navbar({
  customer,
}: {
  customer?: { name: string; email: string } | null;
}) {
  const { cartCount, ready } = useStore();
  const { settings } = useStoreSettings();
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setSearchOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  function logout() {
    startTransition(async () => {
      await logoutCustomerAction();
      setMenuOpen(false);
      router.refresh();
      router.push("/login");
    });
  }

  // Self-hide on the admin area. Doing this client-side (usePathname updates on
  // navigation) instead of gating in the root layout — which reads a server
  // `headers()` pathname that is frozen across client-side navigations — fixes
  // the navbar going missing until a hard refresh when moving between /admin and
  // the storefront.
  if (pathname.startsWith("/admin")) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-canvas/75 backdrop-blur-xl">
      <nav className="container-page flex min-h-[66px] flex-wrap items-center gap-2 py-2 sm:gap-4 sm:py-0 md:flex-nowrap md:gap-7">
        {/* Logo — Navigator mascot lockup. Mascot renders bare (no tile/border),
            32×32 desktop / 28×28 mobile; wordmark drops below 360px. The whole
            lockup is one link to home with the accessible name on the link. */}
        <Link
          href="/"
          aria-label="Ghost.ma — accueil"
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center gap-[9px]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/navigator-icon-64.png"
            alt=""
            width={32}
            height={32}
            className="h-7 w-7 sm:h-8 sm:w-8"
            fetchPriority="high"
          />
          <span className="hidden text-lg font-semibold tracking-tight text-text min-[360px]:block">
            {settings.branding.logoText}
          </span>
        </Link>

        {/* Search */}
        <HeaderSearch variant="desktop" />

        {/* Links */}
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
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

          <button
            type="button"
            onClick={() => {
              setSearchOpen((value) => !value);
              setMenuOpen(false);
            }}
            className={`grid h-10 w-10 place-items-center rounded-xl transition md:hidden ${
              searchOpen ? "bg-surface2 text-text" : "text-muted hover:text-text"
            }`}
            aria-label="Rechercher"
            aria-expanded={searchOpen}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-5 w-5"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.6" y2="16.6" />
            </svg>
          </button>

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

          <div className="hidden md:block">
            {customer ? (
              <AccountMenu customer={customer} />
            ) : (
              <Link
                href="/login"
                className="rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm font-medium text-text transition hover:bg-elevated sm:px-4"
              >
                Se connecter
              </Link>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setMenuOpen((value) => !value);
              setSearchOpen(false);
            }}
            className={`grid h-10 w-10 place-items-center rounded-xl transition md:hidden ${
              menuOpen ? "bg-surface2 text-text" : "text-muted hover:text-text"
            }`}
            aria-label="Menu"
            aria-expanded={menuOpen}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="h-5 w-5"
              aria-hidden
            >
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
        </div>

        {searchOpen && (
          <div className="w-full pt-1 md:hidden">
            <HeaderSearch variant="mobile" autoFocus />
          </div>
        )}

        {menuOpen && (
          <div className="w-full overflow-hidden rounded-xl border border-border bg-card shadow-card md:hidden">
            <div className="grid p-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-4 py-3 text-sm font-medium text-muted transition hover:bg-surface hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
              <div className="my-1 border-t border-border" />
              {customer ? (
                <>
                  <Link
                    href="/account"
                    className="rounded-lg px-4 py-3 text-sm font-medium text-muted transition hover:bg-surface hover:text-white"
                  >
                    Mon compte
                  </Link>
                  <Link
                    href="/account/orders"
                    className="rounded-lg px-4 py-3 text-sm font-medium text-muted transition hover:bg-surface hover:text-white"
                  >
                    Mes commandes
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    disabled={pending}
                    className="rounded-lg px-4 py-3 text-left text-sm font-medium text-muted transition hover:bg-surface hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending ? "D\u00e9connexion..." : "D\u00e9connexion"}
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="rounded-lg px-4 py-3 text-sm font-medium text-muted transition hover:bg-surface hover:text-white"
                >
                  Se connecter
                </Link>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}

function AccountMenu({ customer }: { customer: { name: string; email: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const initial = customer.name.trim().slice(0, 1).toUpperCase() || "C";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function logout() {
    startTransition(async () => {
      await logoutCustomerAction();
      setOpen(false);
      router.refresh();
      router.push("/login");
    });
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface2 px-2 text-sm font-medium text-text transition hover:bg-elevated sm:px-3"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-accent/20 text-xs font-bold text-accent">
          {initial}
        </span>
        <span className="hidden max-w-28 truncate sm:block">{customer.name}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-card"
          role="menu"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-white">{customer.name}</p>
            <p className="truncate text-xs text-muted">{customer.email}</p>
          </div>
          <Link role="menuitem" href="/account" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-muted hover:bg-surface hover:text-white">
            Mon compte
          </Link>
          <Link role="menuitem" href="/account/orders" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-muted hover:bg-surface hover:text-white">
            Mes commandes
          </Link>
          <Link role="menuitem" href="/account/security" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-muted hover:bg-surface hover:text-white">
            {"S\u00e9curit\u00e9"}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            disabled={pending}
            className="block w-full px-4 py-2.5 text-left text-sm text-muted hover:bg-surface hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Déconnexion..." : "Déconnexion"}
          </button>
        </div>
      )}
    </div>
  );
}
