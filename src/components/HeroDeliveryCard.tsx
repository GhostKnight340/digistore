"use client";

import { useEffect, useState } from "react";

const TICK_MS = 1700;
const LAST_STEP = 4;

const statuses = [
  { label: "En attente de paiement", counter: "01 / 05", progress: "16%" },
  { label: "Paiement confirmé", counter: "02 / 05", progress: "40%" },
  { label: "Code réservé", counter: "03 / 05", progress: "64%" },
  { label: "Code prêt", counter: "04 / 05", progress: "84%" },
  { label: "Livré instantanément", counter: "05 / 05", progress: "100%" },
];

function CheckIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      className="h-3 w-3"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}

export default function HeroDeliveryCard() {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduced) {
      setStep(LAST_STEP);
      return;
    }

    const id = setInterval(
      () => setStep((current) => (current >= LAST_STEP ? 0 : current + 1)),
      TICK_MS,
    );
    return () => clearInterval(id);
  }, [reduced]);

  const active = step > 0;
  const delivered = step === LAST_STEP;
  const status = statuses[step];

  return (
    <div className="relative flex min-h-[430px] items-center justify-center">
      <div
        className={`pointer-events-none absolute h-80 w-[360px] rounded-full bg-[radial-gradient(circle,rgba(62,123,250,0.11),transparent_62%)] blur-[88px] transition-opacity duration-1000 ${
          active ? "opacity-60" : "opacity-35"
        }`}
      />

      <div className="relative flex w-full max-w-[374px] flex-col gap-[18px]">
        <div
          className={`relative overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(158deg,#1d2638_0%,#141a27_52%,#0d1017_100%)] p-[26px] pb-6 shadow-[0_28px_64px_rgba(0,0,0,0.55)] transition-transform duration-1000 ${
            active ? "-translate-y-1.5" : ""
          }`}
        >
          <div
            className={`pointer-events-none absolute inset-0 rounded-[22px] border border-accent/55 shadow-[inset_0_0_28px_rgba(62,123,250,0.07)] transition-opacity duration-1000 ${
              active ? "opacity-65" : "opacity-25"
            }`}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.06] to-transparent" />
          <div
            className={`pointer-events-none absolute -right-8 -top-11 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(62,123,250,0.14),transparent_64%)] transition-opacity duration-1000 ${
              active ? "opacity-55" : "opacity-25"
            }`}
          />

          <div className="relative mb-9 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-[30px] w-[30px] place-items-center rounded-[9px] border border-white/10 bg-gradient-to-br from-[#2c3445] to-[#171b26]">
                <div className="h-[11px] w-[11px] rounded-full border-2 border-accent-strong" />
              </div>
              <span className="font-mono text-xs tracking-[0.22em] text-[#c4c9d4]">
                STEAM WALLET
              </span>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                active
                  ? "border-accent bg-accent-soft text-accent-strong"
                  : "border-border-strong text-muted"
              }`}
            >
              {active ? (
                <span className="h-1.5 w-1.5 animate-pulse2 rounded-full bg-accent" />
              ) : (
                <LockIcon />
              )}
              {active ? "Actif" : "Verrouillé"}
            </span>
          </div>

          <div className="relative">
            <div className="mb-2 text-[11px] tracking-[0.07em] text-faint">
              SOLDE NUMÉRIQUE
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-[42px] font-semibold leading-none tracking-[-0.03em] text-text">
                100 MAD
              </span>
              <span className="font-mono text-[15px] text-muted">~ 9 EUR</span>
            </div>
          </div>

          <div className="relative mt-8 flex items-center justify-between gap-4">
            <span className="text-xs text-muted">
              Produit numérique - Livraison instantanée
            </span>
            <span className="h-[26px] w-[34px] rounded-md border border-white/10 bg-[#20252f] bg-[linear-gradient(90deg,transparent_32%,rgba(0,0,0,0.25)_33%_34%,transparent_35%),linear-gradient(0deg,transparent_45%,rgba(0,0,0,0.25)_46%_47%,transparent_48%)]" />
          </div>
        </div>

        <div className="rounded-[18px] border border-white/[0.08] bg-surface p-4 shadow-[0_8px_24px_rgba(0,0,0,0.32)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              {delivered ? (
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-white">
                  <CheckIcon />
                </span>
              ) : (
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    active ? "animate-pulse2 bg-accent" : "bg-faint"
                  }`}
                />
              )}
              <span
                className={`truncate text-[13.5px] font-medium ${
                  active ? "text-text" : "text-muted"
                }`}
              >
                {status.label}
              </span>
            </div>
            <span className="shrink-0 font-mono text-[11px] text-faint">
              {status.counter}
            </span>
          </div>

          <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-border-strong">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-700"
              style={{ width: status.progress }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-[10px] border border-dashed border-border-strong bg-accent-soft/30 px-3.5 py-3">
            <span
              className={`truncate font-mono text-sm tracking-[0.08em] ${
                step >= 3 ? "text-text" : "text-faint"
              }`}
            >
              {delivered ? "STEAM-A7K2-100-MA" : "STEAM-----100-MA"}
            </span>
            {delivered ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-accent-strong">
                <CheckIcon className="h-3.5 w-3.5" />
                Prêt
              </span>
            ) : (
              <span className="shrink-0 text-xs text-faint">Préparation...</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
