"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { accountLogoutAction } from "@/app/account/actions";
import {
  ACCOUNT_NAV,
  accountNavCount,
  accountSectionLabel,
  type AccountView,
} from "@/lib/account/nav";
import {
  GridIcon,
  BagIcon,
  ShieldIcon,
  LogoutIcon,
  CheckIcon,
  LifebuoyIcon,
  WalletIcon,
  CloseIcon,
  MenuIcon,
} from "@/components/account/icons";

const ICONS: Record<AccountView, typeof GridIcon> = {
  dashboard: GridIcon,
  orders: BagIcon,
  wallet: WalletIcon,
  support: LifebuoyIcon,
  security: ShieldIcon,
};

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Compact account header + bottom-sheet navigation, shown instead of the
 * desktop sidebar below `lg`. The full sidebar is never rendered on mobile —
 * this is the only account navigation there.
 */
export default function AccountMobileNav({
  name,
  email,
  active,
  verified = false,
  ordersCount,
  supportCount,
  className = "",
}: {
  name: string;
  email: string;
  active: AccountView;
  verified?: boolean;
  ordersCount?: number;
  supportCount?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const sheetId = useId();

  // The pages already blank the email out when the profile is incomplete, so a
  // placeholder address can never reach here.
  const hasEmail = Boolean(email);
  const initial = name.slice(0, 1).toUpperCase() || "?";

  const close = useCallback(() => setOpen(false), []);

  // A client-side navigation keeps this component mounted, so close the sheet
  // when the route changes rather than relying on the click handler alone.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Restore focus to the trigger whenever the sheet closes.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;

      if (event.shiftKey && (activeEl === first || !panel.contains(activeEl))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    // min-w-0 lets this grid cell shrink to the column width so the identity row
    // truncates instead of forcing the trigger past the viewport at ~320px.
    <div className={`min-w-0 ${className}`}>
      {/* Compact identity + current section + menu trigger */}
      <div className="flex items-center gap-2.5 rounded-[16px] border border-border bg-card px-3 py-3 sm:gap-3 sm:px-3.5">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] text-base font-bold text-white"
          style={{ background: "linear-gradient(150deg,#3e7bfa,#2a4fd0)" }}
          aria-hidden
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <span className="truncate">{name}</span>
            {verified ? (
              <span className="inline-flex shrink-0 items-center text-green-400">
                <CheckIcon className="h-3.5 w-3.5" />
                <span className="sr-only">Compte vérifié</span>
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-faint">{accountSectionLabel(active)}</p>
        </div>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? sheetId : undefined}
          aria-label="Menu du compte"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border-strong bg-surface2 px-2.5 py-2 text-[13px] font-semibold text-text transition-colors hover:bg-elevated sm:px-3"
        >
          <MenuIcon className="h-4 w-4 shrink-0" />
          {/* Narrowest phones: shorten the visible label; the icon + aria-label
              still name the control. */}
          <span className="hidden min-[360px]:inline">Menu du compte</span>
          <span className="min-[360px]:hidden">Menu</span>
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <button
            type="button"
            aria-label="Fermer le menu du compte"
            onClick={close}
            className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
          />
          <div
            ref={panelRef}
            id={sheetId}
            role="dialog"
            aria-modal="true"
            aria-label="Menu du compte"
            className="relative flex max-h-[85dvh] flex-col overflow-y-auto rounded-t-[22px] border-t border-border bg-canvas pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_-20px_60px_rgba(0,0,0,0.6)]"
          >
            <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-border bg-canvas px-4 pb-3 pt-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{name}</p>
                <p className="truncate text-xs text-faint">
                  {hasEmail ? email : "Profil à compléter"}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border text-muted transition-colors hover:text-white"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <nav aria-label="Sections du compte" className="space-y-1 px-3 py-3">
              {ACCOUNT_NAV.map(({ view, href, label }) => {
                const Icon = ICONS[view];
                const isActive = view === active;
                const count = accountNavCount(view, { ordersCount, supportCount });
                return (
                  <Link
                    key={view}
                    href={href}
                    onClick={close}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-[15px] transition-colors ${
                      isActive
                        ? "border border-accent/30 bg-accent-soft font-semibold text-accent-strong"
                        : "border border-transparent font-medium text-muted"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="flex-1">{label}</span>
                    {count ? (
                      <span
                        className={`inline-flex min-w-[20px] justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                          isActive ? "bg-accent/20 text-accent-strong" : "bg-surface2 text-muted"
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>

            <form action={accountLogoutAction} className="px-3">
              <button
                type="submit"
                className="flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-[rgba(240,97,109,0.22)] bg-[rgba(240,97,109,0.06)] px-3 text-[15px] font-medium text-[#f0616d] transition-colors hover:bg-[rgba(240,97,109,0.12)]"
              >
                <LogoutIcon className="h-[18px] w-[18px] shrink-0" />
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
