"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Floating Navigator support pill, bottom-right on all storefront pages.
 * Desktop: circle avatar (36px) + two-line prompt. Mobile: avatar-only 44px
 * circle button (≥44px tap target) — never both at once. Hidden on the support
 * flow itself, where the prompt would be redundant. The avatar is the
 * circle-safe profile mark.
 *
 * The offsets add `env(safe-area-inset-bottom)` so the pill clears the Safari
 * toolbar / home indicator; pages that end in an action (the account area) add
 * matching bottom padding so it never sits on top of a button.
 */
export default function SupportPill() {
  const pathname = usePathname();
  // Hidden on the support flow and across the admin area. Client-side so it
  // stays correct across soft navigations (see Navbar for the rationale).
  //
  // Also hidden on /checkout and /payment: both end in a `fixed inset-x-0
  // bottom-0` CTA bar at z-30, and this pill is z-40, so on a phone it sits
  // directly on top of the right end of the primary conversion button. Same
  // exclusion list as FeedbackButton, which already got this right.
  const hidden =
    pathname.startsWith("/support") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/payment");

  if (hidden) return null;

  return (
    <>
      {/* Desktop / tablet: full pill */}
      <Link
        href="/support"
        style={{ bottom: "calc(20px + env(safe-area-inset-bottom))" }}
        className="fixed right-5 z-40 hidden items-center gap-3 rounded-full border border-border bg-card/95 py-1.5 pl-1.5 pr-4 shadow-card backdrop-blur-xl transition hover:border-accent/50 sm:flex"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/navigator-profile-circle-256.png"
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 rounded-full"
          loading="lazy"
          decoding="async"
        />
        <span className="leading-tight">
          <span className="block text-[13px] font-semibold text-white">
            Besoin d&apos;aide&nbsp;?
          </span>
          <span className="block text-[11.5px] text-muted">
            Le Navigateur répond en quelques minutes
          </span>
        </span>
      </Link>

      {/* Mobile: avatar-only 44px circle */}
      <Link
        href="/support"
        aria-label="Besoin d'aide ? Contacter le support"
        style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
        className="fixed right-4 z-40 grid h-11 w-11 place-items-center rounded-full border border-border bg-card shadow-card sm:hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/navigator-profile-circle-256.png"
          alt=""
          width={44}
          height={44}
          className="h-11 w-11 rounded-full"
          loading="lazy"
          decoding="async"
        />
      </Link>
    </>
  );
}
