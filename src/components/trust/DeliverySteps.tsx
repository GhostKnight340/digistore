"use client";

import { useStoreSettings } from "@/context/StoreSettingsContext";
import { CategoryInfoIcon } from "@/components/category/categoryIcons";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { trackEvent } from "@/lib/analytics";

/**
 * "Comment fonctionne la livraison" — the digital delivery flow, numbered and
 * connected. Content comes from the trust CMS (`settings.trust.deliverySteps`).
 *
 * Two layouts, same data:
 *  - default: a titled section for the homepage.
 *  - compact: a lighter, borderless variant for product/campaign pages.
 *
 * Steps wrap responsively (no horizontal scroll); the connector chevrons are
 * decorative and hidden on mobile where the flow stacks vertically.
 */
export default function DeliverySteps({
  variant = "default",
  heading,
  subheading,
  className = "",
  id,
}: {
  variant?: "default" | "compact";
  heading?: string;
  subheading?: string;
  className?: string;
  id?: string;
}) {
  const { settings } = useStoreSettings();
  const { ref } = useInViewOnce<HTMLElement>(() =>
    trackEvent("delivery_section_viewed", { variant }),
  );
  const steps = settings.trust.deliverySteps;
  if (steps.length === 0) return null;

  const compact = variant === "compact";

  return (
    <section
      ref={ref}
      id={id}
      className={`${compact ? "" : "mt-16 scroll-mt-20"} ${className}`}
      aria-label={heading ?? "Comment fonctionne la livraison"}
    >
      {!compact && (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-text">
            {heading ?? "Comment fonctionne la livraison"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {subheading ??
              "Un parcours numérique clair, de l'achat à l'utilisation de votre code."}
          </p>
        </div>
      )}
      <ol
        className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-5 ${
          compact ? "mt-0" : "mt-8"
        }`}
      >
        {steps.map((step, index) => (
          <li key={step.id} className="relative flex">
            <div
              className={`flex w-full flex-col rounded-[14px] border border-border bg-surface2 p-4 ${
                compact ? "" : "sm:p-5"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent">
                  <CategoryInfoIcon name={step.icon} />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
                  Étape {index + 1}
                </span>
              </div>
              <h3 className="mt-3 text-[14px] font-semibold text-text">
                {step.title}
              </h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                {step.description}
              </p>
            </div>
            {index < steps.length - 1 && (
              <span
                aria-hidden
                className="pointer-events-none absolute right-[-11px] top-1/2 hidden -translate-y-1/2 text-border-strong lg:block"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
