import { DELIVERY_STEPS, type DeliveryStep } from "@/lib/trust";
import TrackView from "@/components/analytics/TrackView";

/**
 * "Comment se passe la livraison" — the numbered digital-delivery flow.
 * Server component, reusable on the homepage (full section) and on product
 * pages (compact). The horizontal connector is decorative and collapses to a
 * clean vertical stack on mobile, so there is never horizontal overflow.
 */
export default function DeliverySteps({
  title = "Comment se passe la livraison",
  subtitle = "Un parcours numérique clair, de la commande à l'activation de votre code.",
  steps = DELIVERY_STEPS,
  variant = "section",
  analyticsEvent = "trust_delivery_view",
  className,
}: {
  title?: string;
  subtitle?: string;
  steps?: DeliveryStep[];
  /** "section" = standalone block with heading; "bare" = no heading, for embeds. */
  variant?: "section" | "bare";
  analyticsEvent?: string | null;
  className?: string;
}) {
  if (steps.length === 0) return null;

  const grid = (
    <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-3">
      {steps.map((step, index) => (
        <li key={step.id} className="relative">
          <div className="flex h-full flex-col rounded-[14px] border border-border bg-surface p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/15 text-[15px] font-bold text-accent">
                {index + 1}
              </span>
              {/* Connector arrow — desktop only, decorative. */}
              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className="hidden text-border-strong lg:block"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              )}
            </div>
            <h3 className="mt-3 text-[14.5px] font-semibold text-text">
              {step.title}
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {step.description}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );

  if (variant === "bare") {
    return (
      <div className={className}>
        {analyticsEvent ? <TrackView event={analyticsEvent} /> : null}
        {grid}
      </div>
    );
  }

  return (
    <section className={className ?? "mt-16"} aria-labelledby="delivery-steps-title">
      {analyticsEvent ? <TrackView event={analyticsEvent} /> : null}
      <h2
        id="delivery-steps-title"
        className="text-2xl font-semibold tracking-tight text-text"
      >
        {title}
      </h2>
      <p className="mt-1 max-w-xl text-sm text-muted">{subtitle}</p>
      {grid}
    </section>
  );
}
