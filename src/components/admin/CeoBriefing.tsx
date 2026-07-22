"use client";

/**
 * CEO Briefing card (Ghost Mission Control) — the one-glance daily briefing that
 * sits directly below the greeting on the Operations dashboard (the "Centre de
 * contrôle"). Purely presentational: it renders whatever single
 * {@link CeoBriefingDTO} the resolver picked (see briefingFromSnapshot) — never
 * a stacked list of alerts.
 *
 * Style matches the surrounding admin: inline styles + inline SVG icons, soft
 * per-state tinting (background / border / icon badge derived from one accent
 * color) so the card stays calm rather than a solid alarm fill. Responsive via a
 * single media query: desktop shows the right-aligned timestamp and auto-width
 * buttons; mobile drops the timestamp and makes both CTAs full-width.
 */

import Link from "next/link";
import type { CeoBriefingDTO, CeoBriefingState } from "@/lib/dto";

/** One accent per state → soft tints derived from it (never a solid fill). */
const TINT: Record<CeoBriefingState, { color: string; priorityColor: string }> = {
  ok: { color: "oklch(70% 0.15 150)", priorityColor: "oklch(80% 0.15 150)" },
  critical: { color: "oklch(65% 0.18 25)", priorityColor: "oklch(72% 0.18 25)" },
  launch: { color: "oklch(65% 0.18 260)", priorityColor: "oklch(78% 0.15 260)" },
  opportunity: { color: "oklch(65% 0.18 300)", priorityColor: "oklch(80% 0.15 300)" },
  quiet: { color: "oklch(72% 0.15 260)", priorityColor: "oklch(80% 0.15 260)" },
};

function alpha(color: string, a: number): string {
  // oklch(L C H) → oklch(L C H / a) — the design's soft-tint convention.
  return color.replace(/\)$/, ` / ${a})`);
}

function StateIcon({ state, color, size }: { state: CeoBriefingState; color: string; size: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (state) {
    case "critical":
      return (
        <svg {...common}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "launch":
      return (
        <svg {...common}>
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
          <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
      );
    case "opportunity":
      return (
        <svg {...common}>
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      );
    case "quiet":
      return (
        <svg {...common}>
          <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.36-6.36-2.12 2.12M8.76 15.24l-2.12 2.12m0-10.72 2.12 2.12m8.48 8.48 2.12 2.12" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
    case "ok":
    default:
      return (
        <svg {...common}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
  }
}

export default function CeoBriefing({ briefing }: { briefing: CeoBriefingDTO }) {
  const t = TINT[briefing.state];
  const c = t.color;
  const hasMeta = Boolean(briefing.estimate || briefing.affected);

  return (
    <div
      className="ceo-briefing"
      style={{
        display: "flex",
        gap: "16px",
        padding: "18px 22px",
        borderRadius: "14px",
        background: alpha(c, 0.07),
        border: `1px solid ${alpha(c, 0.22)}`,
        marginBottom: "18px",
      }}
    >
      <style>{`
        @media (max-width: 860px) {
          .ceo-briefing { padding: 14px 15px !important; gap: 12px; }
          .ceo-briefing-updated { display: none !important; }
          .ceo-briefing-actions { flex-direction: row !important; }
          .ceo-briefing-actions a { flex: 1 1 0 !important; text-align: center; justify-content: center; }
          .ceo-briefing-title { font-size: 13.5px !important; }
        }
      `}</style>

      {/* icon badge */}
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "11px",
          background: alpha(c, 0.16),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <StateIcon state={briefing.state} color={c} size={20} />
      </div>

      {/* body */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
        {/* title + priority pill + timestamp */}
        <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
          <span className="ceo-briefing-title" style={{ fontSize: "15.5px", fontWeight: 700, color: "#f2f2f5" }}>
            {briefing.title}
          </span>
          <span
            style={{
              fontSize: "10.5px",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "20px",
              background: alpha(c, 0.16),
              color: t.priorityColor,
              whiteSpace: "nowrap",
            }}
          >
            {briefing.priorityLabel}
          </span>
          <span className="ceo-briefing-updated" style={{ marginLeft: "auto", fontSize: "11px", color: "#6b6b76", whiteSpace: "nowrap" }}>
            Mis à jour à l&apos;instant
          </span>
        </div>

        {/* message */}
        <div style={{ fontSize: "13px", color: "#c7c7ce", lineHeight: 1.5 }}>{briefing.message}</div>

        {/* one summarized bullet line */}
        <div style={{ fontSize: "12px", color: "#8a8a95" }}>{briefing.bulletLine}</div>

        {/* optional metadata */}
        {hasMeta && (
          <div style={{ display: "flex", gap: "18px", marginTop: "2px" }}>
            {briefing.estimate && (
              <div style={{ fontSize: "11.5px", color: "#6b6b76" }}>
                Temps estimé <span style={{ color: "#d0d0d6", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{briefing.estimate}</span>
              </div>
            )}
            {briefing.affected && (
              <div style={{ fontSize: "11.5px", color: "#6b6b76" }}>
                Commandes affectées <span style={{ color: "#d0d0d6", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{briefing.affected}</span>
              </div>
            )}
          </div>
        )}

        {/* CTAs */}
        {briefing.actions.length > 0 && (
          <div className="ceo-briefing-actions" style={{ display: "flex", gap: "9px", marginTop: "8px" }}>
            {briefing.actions.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                scroll={false}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: "34px",
                  padding: "0 15px",
                  borderRadius: "9px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  textDecoration: "none",
                  background: a.primary ? c : "transparent",
                  color: a.primary ? "#0a0a0d" : "#e4e4ea",
                  border: a.primary ? "1px solid transparent" : "1px solid rgba(255,255,255,0.14)",
                }}
              >
                {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
