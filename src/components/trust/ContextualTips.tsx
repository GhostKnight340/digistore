"use client";

import { useEffect, useRef } from "react";
import {
  CONTEXTUAL_TIPS,
  pickContextualTip,
  type ContextualTip,
  type TipTone,
} from "@/lib/trust";
import { trackEvent } from "@/lib/analytics";

/**
 * Reusable, context-aware Navigator tip. Give it the page's context tokens
 * (category slug, brand, product tags…) and it surfaces the single most
 * relevant tip — a specific match if there is one, otherwise the general
 * fallback. One tip only, by design: the Navigator should feel helpful, never
 * naggy.
 *
 * Visually this reuses the established category NavigatorTip idiom (dark card,
 * subtle blue inset glow, small Navigator mascot with a coded tone badge) so it
 * feels native everywhere it appears. Fires a single PII-free view event.
 */

const BADGE: Record<TipTone, { color: string; label: string; glyph: React.ReactNode }> = {
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

export default function ContextualTips({
  contexts = [],
  tip: explicitTip,
  tips = CONTEXTUAL_TIPS,
  className = "mt-8 sm:mt-10",
}: {
  /** Context tokens — category slug, brand name, etc. "general" is implicit. */
  contexts?: string[];
  /** Force a specific tip instead of resolving from context. */
  tip?: ContextualTip | null;
  tips?: ContextualTip[];
  className?: string;
}) {
  const tip = explicitTip ?? pickContextualTip(contexts, tips);
  const tracked = useRef<string | null>(null);

  useEffect(() => {
    if (!tip || tracked.current === tip.id) return;
    tracked.current = tip.id;
    trackEvent("trust_tip_view", { tip_id: tip.id, tone: tip.tone });
  }, [tip]);

  if (!tip) return null;
  const badge = BADGE[tip.tone] ?? BADGE.information;

  return (
    <section className={className} aria-label="Conseil du Navigator">
      <div className="relative overflow-hidden rounded-[18px] border border-border bg-[linear-gradient(158deg,#1d2638_0%,#141a27_52%,#0d1017_100%)] p-5 shadow-soft sm:p-6">
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
              <h2 className="text-[15px] font-semibold text-white">{tip.title}</h2>
              <span className="sr-only">— {badge.label}</span>
            </div>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
              {tip.message}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
