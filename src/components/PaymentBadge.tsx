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
  const labelSize = compact ? "text-[11.5px]" : "text-[15px]";
  const tagSize = compact ? "text-[9.5px]" : "text-[12px]";
  const labelWeight = compact ? "font-medium" : "font-semibold";
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
        <span style={{ color: "#5FCFDD" }}>Cash</span>
        <span style={{ color: "#F4BC5A" }}>Plus</span>
      </span>
    );
  }
  if (key === "usdt") {
    return (
      <span className="flex items-baseline gap-1.5">
        <span className={`${labelSize} ${labelWeight} tracking-[0.005em]`} style={{ color: "#9BE9CC" }}>
          USDT
        </span>
        <span className={`font-mono ${tagSize} font-medium`} style={{ color: "#6FCDA9" }}>
          TRC-20
        </span>
      </span>
    );
  }
  return (
    <span className={`${labelSize} truncate ${labelWeight} tracking-[0.005em]`}>
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
        className={compact ? "h-3 w-3 object-contain" : "h-[25px] w-[25px] object-contain"}
      />
    );
  }
  if (key === "bank") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="#9CC0FF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={compact ? "h-[11px] w-[11px]" : "h-[22px] w-[22px]"} aria-hidden>
        <path d="M3 9.5 12 4l9 5.5" />
        <path d="M5 10v7M9.5 10v7M14.5 10v7M19 10v7" />
        <path d="M3 20h18" />
      </svg>
    );
  }
  if (key === "card") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="#CFC0FB" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={compact ? "h-[11px] w-[11px]" : "h-[23px] w-[23px]"} aria-hidden>
        <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
        <path d="M2.5 10h19" />
        <path d="M6 14.5h4" />
      </svg>
    );
  }
  if (key === "paypal") {
    return (
      <span
        className={`font-extrabold italic leading-none ${compact ? "text-[11px]" : "text-[24px]"}`}
        style={{ color: "#8FBEFF" }}
      >
        P
      </span>
    );
  }
  if (key === "wafacash") {
    return (
      <svg viewBox="0 0 24 24" className={compact ? "h-3 w-3" : "h-6 w-6"} aria-hidden>
        <rect x="2" y="2" width="20" height="20" rx="5.5" fill="#F5CD0A" />
        <path d="M9.3 7.8 17 12l-7.7 4.2z" fill="#151208" />
      </svg>
    );
  }
  if (key === "cashplus") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={compact ? "h-3 w-3" : "h-6 w-6"} aria-hidden>
        <circle cx="12" cy="12" r="10" fill="#1B9AAA" />
        <path d="M6.8 14.8l3.6-3.6 2.4 2.4 4.4-4.4" stroke="#FBE4B8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.9 9.2h3.3v3.3" stroke="#FBE4B8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (key === "usdt") {
    return (
      <svg viewBox="0 0 24 24" className={compact ? "h-3 w-3" : "h-6 w-6"} aria-hidden>
        <circle cx="12" cy="12" r="10" fill="#26A17B" />
        <path
          d="M6.5 6.5h11v2.6h-4.2v1.15c2.5.14 4.35.75 4.35 1.5 0 .74-1.85 1.36-4.35 1.5v4.25h-2.6v-4.25c-2.5-.14-4.35-.76-4.35-1.5 0-.75 1.85-1.36 4.35-1.5V9.1H6.5zm6.8 4.9v1.5a17 17 0 0 1-2.6 0v-1.5a17 17 0 0 1 2.6 0z"
          fill="#fff"
        />
      </svg>
    );
  }
  return (
    <span className={`font-bold ${compact ? "text-[8px]" : "text-[13px]"}`}>{display.initials}</span>
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
      className={`group border transition-all duration-[.18s] ease-[ease] [background:linear-gradient(180deg,rgb(var(--pb)/0.10),rgb(var(--pb)/0.05))] [border-color:rgb(var(--pb)/0.25)] hover:-translate-y-px hover:[border-color:rgb(var(--pb)/0.52)] hover:[box-shadow:0_8px_26px_rgba(0,0,0,0.40),0_0_0_1px_rgb(var(--pb)/0.19),inset_0_1px_0_rgba(255,255,255,0.08)] ${
        compact
          ? "inline-flex h-[30px] w-fit items-center gap-[7px] rounded-lg pl-[9px] pr-[11px] [box-shadow:0_1px_4px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.04)]"
          : "flex h-16 items-center gap-3.5 rounded-2xl px-5 [box-shadow:0_4px_18px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.05)]"
      } ${className}`}
      style={vars}
    >
      <span
        className={`flex shrink-0 items-center justify-center border [background:linear-gradient(155deg,rgb(var(--pb)/0.30),rgb(var(--pb)/0.12))] [border-color:rgb(var(--pb)/0.40)] ${
          compact
            ? "h-[19px] w-[19px] rounded-md [box-shadow:inset_0_1px_0_rgba(255,255,255,0.12)]"
            : "h-[42px] w-[42px] rounded-xl [box-shadow:inset_0_1px_0_rgba(255,255,255,0.16),0_2px_6px_rgba(0,0,0,0.32)]"
        }`}
      >
        {tileMark(key, display, compact)}
      </span>
      {badgeLabel(key, display, compact)}
    </div>
  );
}
