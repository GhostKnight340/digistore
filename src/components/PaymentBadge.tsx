import type { CSSProperties, ReactNode } from "react";
import type { ResolvedPaymentDisplay } from "@/lib/paymentDisplay";
import type { PaymentMethodDTO } from "@/lib/dto";

/**
 * Hi-fi payment-method badge from the "Ghost Payment Badges" design handoff:
 * a 64px [icon tile — label] card whose geometry is identical for every
 * method; only the brand tint, label treatment and mark change. `compact`
 * scales the whole badge down (48px) for tight contexts like the footer.
 *
 * Methods stay admin-driven (never hardcoded): the DB decides *which* badges
 * render, while `BRAND_STYLES` pins the handoff's exact tokens for the six
 * known methods. Unknown/custom methods fall back to the admin accentColor.
 */

type BrandKey = "bank" | "paypal" | "card" | "wafacash" | "cashplus" | "usdt";

type BrandStyle = {
  /** BRAND rgb from the handoff — used in every rgba(BRAND, …) */
  brand: [number, number, number];
  labelColor: string;
};

const BRAND_STYLES: Record<BrandKey, BrandStyle> = {
  bank: { brand: [62, 123, 250], labelColor: "#D6E1FF" },
  paypal: { brand: [0, 112, 224], labelColor: "#B7D3FF" },
  card: { brand: [139, 108, 240], labelColor: "#E6DEFC" },
  wafacash: { brand: [245, 205, 10], labelColor: "#F5E6A6" },
  cashplus: { brand: [27, 154, 170], labelColor: "#5FCFDD" },
  usdt: { brand: [38, 161, 123], labelColor: "#9BE9CC" },
};

/** Map an admin-managed method onto a handoff brand key, if it is one of the
 *  six known methods. `cash` methods are split by name; `crypto` only matches
 *  the USDT treatment when the name says so. */
function brandKeyFor(method: PaymentMethodDTO): BrandKey | null {
  const name = method.name.toLowerCase();
  switch (method.type) {
    case "bank":
      return "bank";
    case "paypal":
      return "paypal";
    case "card":
      return "card";
    case "cash":
      if (name.includes("wafa")) return "wafacash";
      if (name.replace(/\s+/g, "").includes("cashplus")) return "cashplus";
      return null;
    case "crypto":
      return name.includes("usdt") || name.includes("tether") ? "usdt" : null;
    default:
      return null;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return Number.isNaN(n) ? [62, 123, 250] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Label per the handoff: two-tone PayPal / Cash Plus wordmarks, USDT + TRC-20
 *  mono tag; every other method renders its admin display name. */
function badgeLabel(
  key: BrandKey | null,
  display: ResolvedPaymentDisplay,
  compact: boolean,
): ReactNode {
  const labelSize = compact ? "text-[13px]" : "text-[15px]";
  const tagSize = compact ? "text-[10.5px]" : "text-[12px]";
  if (key === "paypal") {
    return (
      <span className={`${labelSize} font-bold italic tracking-[0.005em]`}>
        <span style={{ color: "#B7D3FF" }}>Pay</span>
        <span style={{ color: "#5CA0FF" }}>Pal</span>
      </span>
    );
  }
  if (key === "cashplus") {
    return (
      <span className={`${labelSize} font-bold tracking-[0.005em]`}>
        <span style={{ color: "#5FCFDD" }}>Cash</span>{" "}
        <span style={{ color: "#F4BC5A" }}>Plus</span>
      </span>
    );
  }
  if (key === "usdt") {
    return (
      <span className="flex items-baseline gap-1.5">
        <span className={`${labelSize} font-semibold tracking-[0.005em]`} style={{ color: "#9BE9CC" }}>
          USDT
        </span>
        <span className={`font-mono ${tagSize} font-medium`} style={{ color: "#6FCDA9" }}>
          TRC-20
        </span>
      </span>
    );
  }
  return (
    <span className={`${labelSize} truncate font-semibold tracking-[0.005em]`}>
      {display.displayName}
    </span>
  );
}

/** Tile mark: admin logo when uploaded, else the handoff's line glyphs
 *  (bank/card), italic PayPal "P", or the method initials. */
function tileMark(key: BrandKey | null, display: ResolvedPaymentDisplay, compact: boolean) {
  if (display.logoUrl || display.iconUrl) {
    return (
      <img
        src={display.logoUrl || display.iconUrl}
        alt=""
        className={compact ? "h-[19px] w-[19px] object-contain" : "h-[25px] w-[25px] object-contain"}
      />
    );
  }
  if (key === "bank") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="#9CC0FF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={compact ? "h-4 w-4" : "h-[22px] w-[22px]"} aria-hidden>
        <path d="M3 9.5 12 4l9 5.5" />
        <path d="M5 10v7M9.5 10v7M14.5 10v7M19 10v7" />
        <path d="M3 20h18" />
      </svg>
    );
  }
  if (key === "card") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="#CFC0FB" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={compact ? "h-[17px] w-[17px]" : "h-[23px] w-[23px]"} aria-hidden>
        <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
        <path d="M2.5 10h19" />
        <path d="M6 14.5h4" />
      </svg>
    );
  }
  if (key === "paypal") {
    return (
      <span
        className={`font-extrabold italic leading-none ${compact ? "text-[18px]" : "text-[24px]"}`}
        style={{ color: "#8FBEFF" }}
      >
        P
      </span>
    );
  }
  return (
    <span className={`font-bold ${compact ? "text-[10px]" : "text-[13px]"}`}>{display.initials}</span>
  );
}

export default function PaymentBadge({
  method,
  display,
  size = "default",
  className = "",
}: {
  method: PaymentMethodDTO;
  display: ResolvedPaymentDisplay;
  /** `compact` scales the badge down for tight contexts like the footer. */
  size?: "default" | "compact";
  className?: string;
}) {
  const key = brandKeyFor(method);
  const style = key ? BRAND_STYLES[key] : null;
  const brand = style ? style.brand : hexToRgb(display.accentColor);
  const labelColor = style ? style.labelColor : "#F3F4F7";
  const compact = size === "compact";

  const vars = {
    "--pb": brand.join(" "),
    color: labelColor,
  } as CSSProperties;

  return (
    <div
      className={`group flex items-center border transition-all duration-[.18s] ease-[ease] [background:linear-gradient(180deg,rgb(var(--pb)/0.10),rgb(var(--pb)/0.05))] [border-color:rgb(var(--pb)/0.25)] [box-shadow:0_4px_18px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.05)] hover:-translate-y-px hover:[border-color:rgb(var(--pb)/0.52)] hover:[box-shadow:0_8px_26px_rgba(0,0,0,0.40),0_0_0_1px_rgb(var(--pb)/0.19),inset_0_1px_0_rgba(255,255,255,0.08)] ${
        compact ? "h-12 gap-2 rounded-xl px-3" : "h-16 gap-3.5 rounded-2xl px-5"
      } ${className}`}
      style={vars}
    >
      <span
        className={`flex shrink-0 items-center justify-center border [background:linear-gradient(155deg,rgb(var(--pb)/0.30),rgb(var(--pb)/0.12))] [border-color:rgb(var(--pb)/0.40)] [box-shadow:inset_0_1px_0_rgba(255,255,255,0.16),0_2px_6px_rgba(0,0,0,0.32)] ${
          compact ? "h-8 w-8 rounded-[9px]" : "h-[42px] w-[42px] rounded-xl"
        }`}
      >
        {tileMark(key, display, compact)}
      </span>
      {badgeLabel(key, display, compact)}
    </div>
  );
}
