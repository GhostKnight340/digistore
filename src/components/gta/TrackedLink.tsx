"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

/**
 * A normal `<Link>` that fires one PII-free analytics event on click. Used for
 * the GTA landing page's gift-card CTAs, support links and final platform CTAs
 * so a server component can attach attribution without becoming a client
 * component itself. Navigation is unaffected (the event is best-effort).
 */
export default function TrackedLink({
  href,
  event,
  params,
  className,
  children,
  scroll,
  ariaLabel,
}: {
  href: string;
  event: string;
  params?: Record<string, string | number | boolean | undefined>;
  className?: string;
  children: React.ReactNode;
  scroll?: boolean;
  ariaLabel?: string;
}) {
  return (
    <Link
      href={href}
      scroll={scroll}
      aria-label={ariaLabel}
      className={className}
      onClick={() => trackEvent(event, params ?? {})}
    >
      {children}
    </Link>
  );
}
