"use client";

import type { PaymentMethod } from "@/lib/types";

/**
 * Visual metadata for each payment method shown in the selector.
 *
 * `logoSrc` is intentionally optional: drop an official logo into /public and
 * set the path here to swap the placeholder glyph for a real image. The
 * gradient + glyph fallback keeps the card looking branded until then.
 */
type MethodVisual = {
  label: string;
  hint: string;
  /** Brand accent used for the selected ring + check badge. */
  accent: string;
  /** Background gradient for the square logo slot. */
  gradient: string;
  /** Optional logo image (swappable). */
  logoSrc?: string;
  /** Fallback rendered inside the logo slot when no logoSrc is set. */
  glyph: React.ReactNode;
};

const BankGlyph = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} className="h-5 w-5" aria-hidden>
    <path d="M3 21h18M5 21V10m4 11V10m6 11V10m4 11V10M3 10l9-6 9 6M3 10h18" />
  </svg>
);

const CardGlyph = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} className="h-5 w-5" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 10h18" />
  </svg>
);

const METHOD_VISUALS: Record<string, MethodVisual> = {
  bank: {
    label: "Virement bancaire",
    hint: "RIB / IBAN affiché à l'étape suivante",
    accent: "#3E7BFA",
    gradient: "linear-gradient(145deg,#3E7BFA,#1D4ED8)",
    glyph: BankGlyph,
  },
  usdt: {
    label: "USDT Crypto",
    hint: "TRC20 / BEP20 uniquement",
    accent: "#F7931A",
    gradient: "linear-gradient(145deg,#F7C04A,#F7931A)",
    glyph: <span className="text-[22px] font-bold leading-none text-white">₮</span>,
  },
  paypal: {
    label: "PayPal",
    hint: "PayPal ou envoi manuel",
    accent: "#0070E0",
    gradient: "linear-gradient(145deg,#009CDE,#003087)",
    glyph: <span className="text-[20px] font-extrabold italic leading-none text-white">P</span>,
  },
  card: {
    label: "Carte bancaire",
    hint: "Disponible prochainement",
    accent: "#646A77",
    gradient: "linear-gradient(145deg,#4a4f5e,#272a33)",
    glyph: CardGlyph,
  },
};

export default function PaymentMethodSelector({
  methods,
  selected,
  onSelect,
}: {
  methods: PaymentMethod[];
  selected: PaymentMethod | "";
  onSelect: (m: PaymentMethod) => void;
}) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      {methods.map((m) => {
        const v = METHOD_VISUALS[m] ?? {
          label: m,
          hint: "",
          accent: "#3E7BFA",
          gradient: "linear-gradient(145deg,#3E7BFA,#1D4ED8)",
          glyph: BankGlyph,
        };
        const active = selected === m;
        return (
          <button
            type="button"
            key={m}
            onClick={() => onSelect(m)}
            aria-pressed={active}
            className="group relative overflow-hidden rounded-[18px] border border-border bg-gradient-to-b from-surface to-base/45 p-[18px] text-left transition duration-200 hover:-translate-y-0.5 hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {/* Selected highlight ring + check badge (brand-colored) */}
            {active && (
              <>
                <span
                  className="pointer-events-none absolute inset-0 rounded-[18px]"
                  style={{
                    border: `1.5px solid ${v.accent}`,
                    background: `${v.accent}12`,
                    boxShadow: `0 0 0 4px ${v.accent}1a, 0 14px 34px ${v.accent}33`,
                  }}
                />
                <span
                  className="absolute right-3.5 top-3.5 grid h-[22px] w-[22px] place-items-center rounded-full"
                  style={{ background: v.accent, boxShadow: `0 2px 8px ${v.accent}8c` }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.2} className="h-3 w-3" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              </>
            )}

            <div className="relative flex items-center gap-3.5">
              <span
                className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-xl shadow-[0_5px_14px_rgba(0,0,0,0.4)]"
                style={{ background: v.gradient }}
              >
                {v.logoSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.logoSrc} alt={v.label} className="h-6 w-6 object-contain" />
                ) : (
                  v.glyph
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-white">{v.label}</span>
                <span className="mt-0.5 block truncate text-xs text-faint">{v.hint}</span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
