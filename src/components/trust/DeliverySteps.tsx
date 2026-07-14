"use client";

import { useTrackOnView } from "@/hooks/useTrackOnView";
import { DELIVERY_STEPS, TRUST_EVENTS } from "@/lib/trust/content";

/**
 * "How delivery works" — the 5-step digital delivery flow. Reusable on the
 * homepage and product pages via the `variant` prop:
 *  - "full"    : titled section with numbered cards (homepage).
 *  - "compact" : borderless numbered list for tighter contexts (product aside).
 * Connectors between steps are decorative and hidden from assistive tech.
 */
export default function DeliverySteps({
  title = "Comment se passe la livraison",
  subtitle = "Un parcours numérique clair, du choix du produit à l'utilisation du code.",
  variant = "full",
  className = "",
  id,
}: {
  title?: string;
  subtitle?: string;
  variant?: "full" | "compact";
  className?: string;
  /** Optional anchor id (e.g. "how-it-works" for in-page navigation). */
  id?: string;
}) {
  const ref = useTrackOnView<HTMLElement>(TRUST_EVENTS.deliveryViewed, {
    variant,
  });

  if (variant === "compact") {
    return (
      <section ref={ref} id={id} className={className}>
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        <ol className="mt-4 space-y-4">
          {DELIVERY_STEPS.map((step, index) => (
            <li key={step.id} className="flex gap-3.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/15 text-[13px] font-bold text-accent">
                {index + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-[13.5px] font-semibold text-text">
                  {step.title}
                </h3>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                  {step.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section ref={ref} id={id} className={`mt-16 scroll-mt-20 ${className}`}>
      <h2 className="text-2xl font-semibold tracking-tight text-text">{title}</h2>
      <p className="mt-1 text-sm text-muted">{subtitle}</p>
      <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {DELIVERY_STEPS.map((step, index) => (
          <li key={step.id} className="relative">
            <div className="card h-full p-5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-lg font-bold text-accent">
                {index + 1}
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-white">
                {step.title}
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {step.text}
              </p>
            </div>
            {index < DELIVERY_STEPS.length - 1 && (
              <span
                aria-hidden
                className="pointer-events-none absolute right-[-11px] top-[38px] hidden text-border-strong lg:block"
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
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
