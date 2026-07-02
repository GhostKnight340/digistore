"use client";

import Link from "next/link";
import { ReactNode } from "react";

const BenefitIcon = ({ d, extra }: { d: string; extra?: string }) => (
  <span
    className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[10px]"
    style={{
      background: "rgba(62,123,250,0.12)",
      border: "1px solid rgba(62,123,250,0.26)",
    }}
  >
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5E92FF" strokeWidth={2.1}>
      <path d={d} />
      {extra ? <path d={extra} /> : null}
    </svg>
  </span>
);

const benefits = [
  { d: "M13 2L3 14h7l-1 8 10-12h-7z", title: "Livraison rapide des codes", sub: "Code reçu par e-mail en quelques secondes." },
  { d: "M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z", extra: "M9 12l2 2 4-4", title: "Paiement sécurisé", sub: "Transactions chiffrées et 100% protégées." },
  { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", title: "Support client réactif", sub: "Une équipe disponible 7j/7 pour vous aider." },
];

const steps = ["Choisissez votre produit", "Payez en toute sécurité", "Recevez votre code"];

export default function AuthLayout({
  active,
  children,
}: {
  active: "login" | "register";
  children: ReactNode;
}) {
  const tab = (isActive: boolean): React.CSSProperties => ({
    flex: 1,
    height: 40,
    borderRadius: 9,
    fontSize: 14,
    fontWeight: 600,
    textAlign: "center",
    lineHeight: "40px",
    transition: "all .2s ease",
    ...(isActive
      ? { background: "#3E7BFA", color: "#fff", boxShadow: "0 4px 14px rgba(62,123,250,0.35)" }
      : { background: "transparent", color: "#9A9FAB" }),
  });

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center overflow-x-hidden px-5 py-10"
      style={{
        background: "#0A0B0D",
        backgroundImage:
          "radial-gradient(1000px 560px at 78% -12%, rgba(62,123,250,0.10), transparent 62%),radial-gradient(760px 460px at 6% 108%, rgba(62,123,250,0.05), transparent 60%)",
        fontFamily: "'Geist', -apple-system, system-ui, sans-serif",
        color: "#F3F4F7",
      }}
    >
      <div
        className="grid w-full max-w-[1040px] grid-cols-1 overflow-hidden rounded-[24px] lg:grid-cols-[1.02fr_0.98fr]"
        style={{
          background: "linear-gradient(180deg,#121319,#0F1015)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 50px 130px -34px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.02)",
        }}
      >
        {/* ── Trust panel (hidden on mobile/tablet) ── */}
        <div
          className="relative hidden flex-col overflow-hidden p-[52px] lg:flex"
          style={{
            background: "linear-gradient(158deg,#141a27 0%,#0f131c 55%,#0c0e15 100%)",
            borderRight: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            className="pointer-events-none absolute"
            style={{
              top: -70, right: -60, width: 280, height: 280, borderRadius: "50%",
              background: "radial-gradient(circle,rgba(62,123,250,0.24),transparent 66%)", filter: "blur(20px)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)",
              backgroundSize: "34px 34px",
              maskImage: "radial-gradient(400px 400px at 30% 20%,#000,transparent 78%)",
              WebkitMaskImage: "radial-gradient(400px 400px at 30% 20%,#000,transparent 78%)",
            }}
          />

          {/* logo */}
          <div className="relative flex items-center gap-[11px]">
            <div
              className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px]"
              style={{ background: "linear-gradient(145deg,#3E7BFA,#2B5FD9)", boxShadow: "0 6px 18px rgba(62,123,250,0.4)" }}
            >
              <div style={{ width: 13, height: 13, border: "2.4px solid #fff", borderRadius: 4 }} />
            </div>
            <span style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em" }}>
              ghost<span style={{ color: "#5E92FF" }}>.ma</span>
            </span>
          </div>

          {/* headline */}
          <div className="relative mt-11">
            <h2 style={{ fontSize: 32, lineHeight: 1.12, letterSpacing: "-0.03em", fontWeight: 600, margin: "0 0 16px", textWrap: "balance" }}>
              Vos codes numériques,<br />en toute confiance.
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.65, color: "#9A9FAB", margin: 0, maxWidth: 340 }}>
              Achetez et recevez vos cartes Steam, PlayStation et Xbox en quelques secondes — livrées directement par e-mail.
            </p>
          </div>

          {/* benefits */}
          <div className="relative mt-10 flex flex-col gap-2">
            {benefits.map((b, i) => (
              <div key={b.title}>
                <div className="flex items-center gap-[13px] py-[13px]">
                  <BenefitIcon d={b.d} extra={b.extra} />
                  <div>
                    <div style={{ fontSize: 14.5, fontWeight: 500, color: "#F3F4F7" }}>{b.title}</div>
                    <div style={{ fontSize: 12.5, color: "#8891a3", marginTop: 1 }}>{b.sub}</div>
                  </div>
                </div>
                {i < benefits.length - 1 && <div style={{ height: 1, background: "rgba(255,255,255,0.055)" }} />}
              </div>
            ))}
          </div>

          {/* comment ça marche */}
          <div className="relative mt-9 pt-[26px]" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, letterSpacing: "0.2em", color: "#646A77", textTransform: "uppercase", marginBottom: 18 }}>
              Comment ça marche
            </div>
            <div className="flex flex-col gap-4">
              {steps.map((s, i) => {
                const isLast = i === steps.length - 1;
                return (
                  <div key={s} className="flex items-center gap-[13px]">
                    <span
                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                      style={{
                        border: isLast ? "1px solid rgba(62,123,250,0.4)" : "1px solid rgba(255,255,255,0.16)",
                        background: isLast ? "rgba(62,123,250,0.14)" : "#0E0F15",
                        color: isLast ? "#5E92FF" : "#C4C9D4",
                      }}
                    >
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 13.5, color: "#C4C9D4" }}>{s}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Form panel ── */}
        <div className="flex flex-col justify-center p-[34px] sm:p-11 lg:p-[52px]">
          <div className="mb-[30px] flex rounded-[12px] p-1" style={{ background: "#0E0F15", border: "1px solid rgba(255,255,255,0.07)" }}>
            <Link href="/login" style={tab(active === "login")}>Connexion</Link>
            <Link href="/register" style={tab(active === "register")}>Inscription</Link>
          </div>
          {children}
        </div>
      </div>

      <p className="mt-[22px] flex items-center gap-[7px]" style={{ fontSize: 12, color: "#4a4f5a" }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4a4f5a" strokeWidth={2}>
          <rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
        Connexion chiffrée · vos données sont protégées
      </p>
    </div>
  );
}
