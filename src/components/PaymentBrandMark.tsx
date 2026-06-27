import type { CSSProperties } from "react";
import type { ResolvedPaymentDisplay } from "@/lib/paymentDisplay";

export default function PaymentBrandMark({
  display,
  active = false,
  className = "",
}: {
  display: ResolvedPaymentDisplay;
  active?: boolean;
  className?: string;
}) {
  const source = display.logoUrl || display.iconUrl;
  const style = {
    borderColor: active ? display.accentColor : undefined,
    backgroundColor: active
      ? `color-mix(in srgb, ${display.accentColor} 22%, transparent)`
      : undefined,
    color: display.accentColor,
  } as CSSProperties;

  return (
    <span
      className={`grid place-items-center overflow-hidden rounded-2xl border text-sm font-black ${className} ${
        active ? "text-white" : "border-border bg-base"
      }`}
      style={style}
    >
      {source ? (
        <img
          src={source}
          alt={`${display.displayName} logo`}
          className="h-full w-full object-contain p-2"
        />
      ) : (
        display.initials
      )}
    </span>
  );
}
