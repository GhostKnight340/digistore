import PaymentBrandMark from "@/components/PaymentBrandMark";
import { paymentMethodDisplay } from "@/lib/paymentDisplay";
import type { PaymentMethodDTO } from "@/lib/dto";

export default function PreviewCard({
  method,
  selected = false,
  onClick,
}: {
  method: PaymentMethodDTO;
  selected?: boolean;
  onClick?: () => void;
}) {
  const display = paymentMethodDisplay(method);
  const className = `flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
    selected ? "shadow-[0_0_0_3px_rgba(62,123,250,0.12)]" : "border-border bg-canvas hover:border-border-strong"
  }`;
  const style = selected ? { borderColor: display.accentColor } : undefined;

  const content = (
    <>
      <PaymentBrandMark display={display} active={selected} className="h-10 w-10 shrink-0 rounded-[10px]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold text-text">{display.displayName}</div>
        <div className="truncate text-[11.5px] text-faint">{display.subtitle}</div>
      </div>
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${
          selected ? "border-accent bg-accent" : "border-border-strong"
        }`}
      >
        {selected && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.4}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} style={style}>
        {content}
      </button>
    );
  }
  return (
    <div className={className} style={style}>
      {content}
    </div>
  );
}
