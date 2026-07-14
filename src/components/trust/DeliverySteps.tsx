import TrackSectionView from "@/components/analytics/TrackSectionView";
import { visibleDeliverySteps, type DeliveryStepSetting } from "@/lib/trust/content";

/**
 * Premium "How delivery works" flow. Reusable on the homepage (full variant,
 * with heading) and on product/collection/campaign pages (compact variant,
 * heading-less). Server component; the numbered steps are connected by subtle
 * arrows that flow vertically on mobile and horizontally on desktop.
 */
export default function DeliverySteps({
  steps,
  title,
  subtitle,
  variant = "full",
  className,
}: {
  steps: DeliveryStepSetting[];
  title?: string;
  subtitle?: string;
  variant?: "full" | "compact";
  className?: string;
}) {
  const visible = visibleDeliverySteps(steps);
  if (visible.length === 0) return null;

  const isCompact = variant === "compact";

  return (
    <section
      className={className ?? (isCompact ? "mt-10" : "mt-16")}
      aria-labelledby={title ? "delivery-steps-heading" : undefined}
      aria-label={title ? undefined : "Comment se passe la livraison"}
    >
      <TrackSectionView event="delivery_section_viewed" params={{ variant }} />
      {title && (
        <div className="max-w-2xl">
          <h2
            id="delivery-steps-heading"
            className={
              isCompact
                ? "text-lg font-semibold tracking-tight text-text"
                : "text-2xl font-semibold tracking-tight text-text sm:text-[27px]"
            }
          >
            {title}
          </h2>
          {subtitle && (
            <p className="mt-1.5 text-sm text-muted sm:text-[15px]">{subtitle}</p>
          )}
        </div>
      )}

      <ol
        className={`${title ? "mt-8" : "mt-2"} grid gap-3 sm:gap-4 md:auto-cols-fr md:grid-flow-col md:items-stretch`}
      >
        {visible.map((step, index) => (
          <li key={step.id} className="relative flex md:block">
            <div className="flex h-full flex-col rounded-[14px] border border-border bg-surface p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-[13px] font-bold text-accent">
                  {index + 1}
                </span>
                <h3 className="text-[14.5px] font-semibold text-text">{step.title}</h3>
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-muted">{step.text}</p>
            </div>
            {index < visible.length - 1 && (
              <span
                aria-hidden
                className="pointer-events-none flex items-center justify-center px-2 text-faint md:absolute md:-right-3 md:top-1/2 md:z-10 md:-translate-y-1/2 md:px-0"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 rotate-90 md:rotate-0"
                >
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
