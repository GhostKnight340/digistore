/**
 * Order-confirmation mascot: navigator-icon-128.png rendered at 74px with a
 * coded 26px status badge overlaid bottom-right (offset −6/−2px, 3px ring in
 * the surface color). Per the brand handoff the badge is a positioned element,
 * never baked into the artwork — only the badge changes across variants:
 *   delivered ✓ #16a34a · pending ⏳ #d97706 · error ! #dc2626
 * The mascot is decorative (alt=""); each state carries its meaning in text.
 */
export type OrderConfirmationVariant = "delivered" | "pending" | "error";

const BADGE: Record<OrderConfirmationVariant, { color: string; glyph: React.ReactNode }> = {
  delivered: {
    color: "#16a34a",
    glyph: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" width={13} height={13} aria-hidden>
        <path d="M5 12.5l4.5 4.5L19 7" />
      </svg>
    ),
  },
  pending: {
    color: "#d97706",
    glyph: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" width={13} height={13} aria-hidden>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    ),
  },
  error: {
    color: "#dc2626",
    glyph: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" width={13} height={13} aria-hidden>
        <path d="M12 6.5v7" />
        <path d="M12 17.5h.01" />
      </svg>
    ),
  },
};

export default function OrderConfirmationMascot({
  variant,
  ringColor = "#0F1015",
  className = "",
}: {
  variant: OrderConfirmationVariant;
  /** Color of the 3px cutout ring — match the surface behind the badge. */
  ringColor?: string;
  className?: string;
}) {
  const badge = BADGE[variant];
  return (
    <span
      className={`relative inline-block ${className}`}
      style={{ width: 74, height: 74 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/navigator-icon-128.png"
        alt=""
        width={74}
        height={74}
        className="h-[74px] w-[74px]"
      />
      <span
        aria-hidden
        className="absolute grid place-items-center rounded-full"
        style={{
          width: 26,
          height: 26,
          right: -6,
          bottom: -2,
          background: badge.color,
          boxShadow: `0 0 0 3px ${ringColor}`,
        }}
      >
        {badge.glyph}
      </span>
    </span>
  );
}
