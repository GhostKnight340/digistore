import { getPublicPaymentMethods } from "@/lib/db/paymentMethods";
import { announcedPaymentMethods } from "@/lib/paymentMethod";
import { paymentMethodDisplay } from "@/lib/paymentDisplay";
import PaymentBrandMark from "@/components/PaymentBrandMark";
import TrackView from "@/components/analytics/TrackView";
import type { PaymentMethodDTO } from "@/lib/dto";

/**
 * Accepted payment methods, driven entirely by the live payment configuration.
 *
 * Methods come from `getPublicPaymentMethods()` and are collapsed with
 * `announcedPaymentMethods()` — the exact same source and rules as checkout —
 * so nothing is ever hardcoded and a method disabled in admin simply
 * disappears here too. Reusable on the homepage, product pages, campaign pages
 * and the payment page.
 *
 * Server component: pass `methods` to reuse an already-fetched config (no
 * duplicate query), or let it fetch its own. Renders nothing when no method is
 * active.
 */
export default async function AcceptedPayments({
  title = "Moyens de paiement acceptés",
  subtitle,
  methods: provided,
  variant = "grid",
  analyticsEvent = "trust_payments_view",
  className,
}: {
  title?: string;
  subtitle?: string;
  methods?: PaymentMethodDTO[];
  /** "grid" = premium cards with a heading; "inline" = compact chip row. */
  variant?: "grid" | "inline";
  analyticsEvent?: string | null;
  className?: string;
}) {
  let methods = provided;
  if (!methods) {
    try {
      const config = await getPublicPaymentMethods();
      methods = config.methods;
    } catch {
      methods = [];
    }
  }

  const options = announcedPaymentMethods(methods).map((method) => ({
    method,
    display: paymentMethodDisplay(method),
  }));

  if (options.length === 0) return null;

  if (variant === "inline") {
    return (
      <div className={className}>
        {analyticsEvent ? <TrackView event={analyticsEvent} params={{ variant: "inline" }} /> : null}
        {title ? (
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-faint">
            {title}
          </div>
        ) : null}
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {options.map((option) => (
            <li
              key={option.method.id}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1.5"
            >
              <PaymentBrandMark
                display={option.display}
                className="h-[22px] w-[22px] shrink-0 rounded-[7px] text-[8px]"
              />
              <span className="text-[12.5px] font-medium text-text">
                {option.display.displayName}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section className={className ?? "mt-16"} aria-labelledby="payments-title">
      {analyticsEvent ? <TrackView event={analyticsEvent} params={{ variant: "grid" }} /> : null}
      <h2 id="payments-title" className="text-2xl font-semibold tracking-tight text-text">
        {title}
      </h2>
      <p className="mt-1 max-w-xl text-sm text-muted">
        {subtitle ?? "Seules les méthodes actives sont affichées. Vous choisirez la vôtre à l'étape de paiement."}
      </p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => (
          <li
            key={option.method.id}
            className="flex items-center gap-3.5 rounded-[14px] border border-border bg-surface p-4"
          >
            <PaymentBrandMark
              display={option.display}
              className="h-11 w-11 shrink-0 rounded-[11px] text-[11px]"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-semibold text-text">
                {option.display.displayName}
              </div>
              {option.display.subtitle && (
                <div className="truncate text-[12.5px] text-muted">
                  {option.display.subtitle}
                </div>
              )}
            </div>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#5BC98C"
              strokeWidth={2.6}
              className="h-4 w-4 shrink-0"
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </li>
        ))}
      </ul>
    </section>
  );
}
