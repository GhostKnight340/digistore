import Link from "next/link";
import { isValidCtaUrl, type NavigatorTip as NavigatorTipData } from "@/lib/categoryLanding";

/**
 * A single, restrained category "Navigator Tip": a dark bordered card with a
 * subtle blue inset glow (the HeroDeliveryCard idiom) and a SMALL secondary
 * Navigator mascot carrying a coded type badge (the OrderConfirmationMascot
 * badge pattern — the mascot art itself is never recolored). No speech bubble,
 * no first-person dialogue; the admin-authored title + message carry meaning.
 *
 * The badge encodes the tip type for sighted users; the type is also announced
 * in the visually-hidden label so screen readers aren't given a duplicate
 * mascot description.
 */

type TipType = NavigatorTipData["type"];

const BADGE: Record<TipType, { color: string; label: string; glyph: React.ReactNode }> = {
  information: {
    color: "#3e7bfa",
    label: "Information",
    glyph: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" width={12} height={12} aria-hidden>
        <path d="M12 11v6" />
        <path d="M12 7.5h.01" />
      </svg>
    ),
  },
  compatibility: {
    color: "#16a34a",
    label: "Compatibilité",
    glyph: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" width={12} height={12} aria-hidden>
        <path d="M5 12.5l4.5 4.5L19 7" />
      </svg>
    ),
  },
  warning: {
    color: "#d97706",
    label: "Attention",
    glyph: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" width={12} height={12} aria-hidden>
        <path d="M12 6.5v7" />
        <path d="M12 17.5h.01" />
      </svg>
    ),
  },
  security: {
    color: "#6366f1",
    label: "Sécurité",
    glyph: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12} aria-hidden>
        <rect x="6" y="11" width="12" height="8" rx="1.5" />
        <path d="M9 11V8.5a3 3 0 0 1 6 0V11" />
      </svg>
    ),
  },
};

export default function NavigatorTip({ tip }: { tip: NavigatorTipData }) {
  if (!tip.enabled || !tip.message) return null;

  const badge = BADGE[tip.type] ?? BADGE.information;
  const ctaValid = Boolean(tip.ctaLabel) && isValidCtaUrl(tip.ctaUrl);
  const title = tip.title || "Conseil du Navigator";

  return (
    <section className="mt-8 sm:mt-10">
      <div className="relative overflow-hidden rounded-[18px] border border-border bg-[linear-gradient(158deg,#1d2638_0%,#141a27_52%,#0d1017_100%)] p-5 shadow-soft sm:p-6">
        {/* Restrained blue inset glow — decorative. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[18px] border border-accent/40 shadow-[inset_0_0_44px_rgba(62,123,250,0.14)]"
        />
        <div className="relative flex items-start gap-4">
          <span className="relative inline-block shrink-0" style={{ width: 48, height: 48 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/navigator-icon-64.png"
              alt=""
              width={48}
              height={48}
              className="h-12 w-12"
              loading="lazy"
              decoding="async"
            />
            <span
              aria-hidden
              className="absolute grid place-items-center rounded-full"
              style={{
                width: 20,
                height: 20,
                right: -4,
                bottom: -2,
                background: badge.color,
                boxShadow: "0 0 0 3px #141a27",
              }}
            >
              {badge.glyph}
            </span>
          </span>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold text-white">{title}</h2>
              <span className="sr-only">— {badge.label}</span>
            </div>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
              {tip.message}
            </p>
            {ctaValid && (
              <Link
                href={tip.ctaUrl}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover"
              >
                {tip.ctaLabel}
                <span aria-hidden>→</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
