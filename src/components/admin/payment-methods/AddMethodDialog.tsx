"use client";

import { useState } from "react";
import { PAYMENT_METHOD_TYPES } from "@/lib/paymentMethod";
import type { PaymentMethodType } from "@/lib/dto";

export default function AddMethodDialog({
  onCancel,
  onContinue,
}: {
  onCancel: () => void;
  onContinue: (type: PaymentMethodType) => void;
}) {
  const [selected, setSelected] = useState<PaymentMethodType>("bank");
  const meta = PAYMENT_METHOD_TYPES.find((t) => t.type === selected)!;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-[720px] rounded-2xl border border-border bg-base shadow-[0_40px_120px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Nouveau mode de paiement</h2>
            <p className="mt-0.5 text-xs text-faint">Étape 1 / 2 · Type</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-white"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-3">
          {PAYMENT_METHOD_TYPES.map((t) => {
            const active = t.type === selected;
            return (
              <button
                key={t.type}
                type="button"
                onClick={() => setSelected(t.type)}
                className={`rounded-xl border p-4 text-left transition ${
                  active ? "border-accent bg-accent/[0.08]" : "border-border bg-surface hover:border-border-strong"
                }`}
                style={active ? { boxShadow: "0 0 0 4px rgba(62,123,250,0.08)" } : undefined}
              >
                <div
                  className="mb-3 grid h-11 w-11 place-items-center rounded-[11px] font-mono text-sm font-bold"
                  style={{ background: `${t.defaultAccent}22`, color: t.defaultAccent }}
                >
                  {t.defaultInitials}
                </div>
                <div className="text-[15px] font-semibold text-text">{t.label}</div>
                <div className="mt-1 text-[12.5px] text-faint">{t.description}</div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <p className="text-xs text-faint">{meta.description}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="btn-ghost h-9 px-4 text-xs">
              Annuler
            </button>
            <button
              type="button"
              onClick={() => onContinue(selected)}
              className="btn-primary h-9 px-4 text-xs"
            >
              Continuer · {meta.label} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
