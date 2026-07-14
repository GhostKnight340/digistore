"use client";

import { useMemo } from "react";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { resolveNavigatorTips, type TipType } from "@/lib/trustContent";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { trackEvent } from "@/lib/analytics";

/**
 * Reusable, context-aware Navigator Tips.
 *
 * Pass a `context` (product name, category slug, brand — any free text) and the
 * component resolves the matching tips from the trust CMS
 * (`settings.trust.navigatorTips`), always including "general" tips. Drop it on
 * a product page, category page or campaign page: PlayStation pages get the
 * region-match tip, Steam pages the region-specific tip, and so on — with no
 * per-page wiring.
 *
 * Restrained by design (never annoying): one card, one small Navigator mascot,
 * capped at `maxTips`. Fires a single `navigator_tip_viewed` event per mount.
 */

const TYPE_META: Record<TipType, { color: string; label: string }> = {
  information: { color: "#3e7bfa", label: "Information" },
  compatibility: { color: "#16a34a", label: "Compatibilité" },
  warning: { color: "#d97706", label: "Attention" },
  security: { color: "#6366f1", label: "Sécurité" },
};

export default function NavigatorTips({
  context = [],
  maxTips = 3,
  className = "",
}: {
  context?: string | Array<string | null | undefined>;
  maxTips?: number;
  className?: string;
}) {
  const { settings } = useStoreSettings();

  const tips = useMemo(
    () =>
      resolveNavigatorTips(settings.trust.navigatorTips, context).slice(0, maxTips),
    [settings.trust.navigatorTips, context, maxTips],
  );

  const { ref } = useInViewOnce<HTMLElement>(() => {
    if (tips.length > 0) {
      trackEvent("navigator_tip_viewed", { tips: tips.map((t) => t.id).join(",") });
    }
  });

  if (tips.length === 0) return null;

  return (
    <section ref={ref} className={`mt-8 sm:mt-10 ${className}`}>
      <div className="relative overflow-hidden rounded-[18px] border border-border bg-[linear-gradient(158deg,#1d2638_0%,#141a27_52%,#0d1017_100%)] p-5 shadow-soft sm:p-6">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[18px] border border-accent/40 shadow-[inset_0_0_44px_rgba(62,123,250,0.14)]"
        />
        <div className="relative flex items-start gap-4">
          <span className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/navigator-icon-64.png"
              alt=""
              width={44}
              height={44}
              className="h-11 w-11"
              loading="lazy"
              decoding="async"
            />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-faint">
              Conseils du Navigator
            </h2>
            <ul className="mt-3 space-y-3.5">
              {tips.map((tip) => {
                const meta = TYPE_META[tip.type] ?? TYPE_META.information;
                return (
                  <li key={tip.id} className="flex items-start gap-2.5">
                    <span
                      aria-hidden
                      className="mt-[6px] h-2 w-2 shrink-0 rounded-full"
                      style={{ background: meta.color }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <h3 className="text-[14px] font-semibold text-white">
                          {tip.title}
                        </h3>
                        <span className="sr-only">— {meta.label}</span>
                      </div>
                      <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">
                        {tip.message}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
