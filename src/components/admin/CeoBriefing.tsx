"use client";

/**
 * CEO Briefing card — the one-glance executive synthesis at the top of the
 * Operations dashboard ("Centre de contrôle"), directly below the greeting.
 *
 * Purely presentational: it renders whatever single {@link CeoBriefingDTO} the
 * server resolved (AI or deterministic fallback) — never a stacked list. The
 * visual state (icon + soft per-state tint) is driven by `briefing.state`, using
 * the same calm-tint convention (background/border/badge derived from one accent,
 * never a solid alarm fill). Layout, position, and dimensions are unchanged from
 * the previous card; only the information hierarchy and interactivity are richer:
 * an eyebrow, a priority badge, a source + last-updated indicator, an on-demand
 * refresh, and a subtle "Pourquoi cette priorité ?" reasoning reveal.
 */

import Link from "next/link";
import { useState } from "react";
import type { CeoBriefingDTO, CeoBriefingState } from "@/lib/dto";

/** One accent per state → soft tints derived from it. */
const TINT: Record<CeoBriefingState, { color: string; priorityColor: string }> = {
  critical: { color: "oklch(65% 0.18 25)", priorityColor: "oklch(72% 0.18 25)" },
  attention: { color: "oklch(75% 0.15 80)", priorityColor: "oklch(82% 0.14 80)" },
  opportunity: { color: "oklch(65% 0.18 300)", priorityColor: "oklch(80% 0.15 300)" },
  healthy: { color: "oklch(70% 0.15 150)", priorityColor: "oklch(80% 0.15 150)" },
  launch: { color: "oklch(65% 0.18 260)", priorityColor: "oklch(78% 0.15 260)" },
};

function alpha(color: string, a: number): string {
  return color.replace(/\)$/, ` / ${a})`);
}

function updatedLabel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const secs = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (secs < 45) return "à l'instant";
  if (secs < 3600) return `il y a ${Math.round(secs / 60)} min`;
  return new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
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
    case "attention":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case "opportunity":
      return (
        <svg {...common}>
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
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
    case "healthy":
    default:
      return (
        <svg {...common}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
  }
}

export default function CeoBriefing({
  briefing,
  onRefresh,
  refreshing = false,
  stale = false,
}: {
  briefing: CeoBriefingDTO;
  onRefresh?: () => void;
  refreshing?: boolean;
  stale?: boolean;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const t = TINT[briefing.state];
  const c = t.color;

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
      }}
    >
      <style>{`
        @media (max-width: 860px) {
          .ceo-briefing { padding: 14px 15px !important; gap: 12px; }
          .ceo-briefing-meta { display: none !important; }
          .ceo-briefing-actions { flex-direction: row !important; }
          .ceo-briefing-actions a { flex: 1 1 0 !important; text-align: center; justify-content: center; }
          .ceo-briefing-title { font-size: 14px !important; }
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
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "5px" }}>
        {briefing.eyebrow && (
          <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: t.priorityColor }}>
            {briefing.eyebrow}
          </div>
        )}

        {/* title + priority pill + meta */}
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
          <div className="ceo-briefing-meta" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" }}>
            <span
              title={briefing.source === "ai" ? "Rédigé par l'IA" : "Généré automatiquement"}
              style={{
                fontSize: "9.5px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                padding: "2px 6px",
                borderRadius: "5px",
                color: briefing.source === "ai" ? "#c7b8ff" : "#8a8a95",
                background: briefing.source === "ai" ? "rgba(167,139,250,0.14)" : "rgba(255,255,255,0.05)",
              }}
            >
              {briefing.source === "ai" ? "IA" : "AUTO"}
            </span>
            <span style={{ fontSize: "11px", color: "#6b6b76" }}>Mis à jour {updatedLabel(briefing.generatedAt)}</span>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                title="Régénérer le briefing"
                aria-label="Régénérer le briefing"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "26px",
                  height: "26px",
                  borderRadius: "7px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: stale ? alpha(c, 0.16) : "transparent",
                  color: stale ? t.priorityColor : "#9a9aa5",
                  cursor: refreshing ? "default" : "pointer",
                  opacity: refreshing ? 0.6 : 1,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={refreshing ? { animation: "ceo-spin 0.9s linear infinite" } : undefined}>
                  <path d="M23 4v6h-6" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                <style>{`@keyframes ceo-spin{to{transform:rotate(360deg)}}`}</style>
              </button>
            )}
          </div>
        </div>

        {/* summary */}
        <div style={{ fontSize: "13px", color: "#c7c7ce", lineHeight: 1.5 }}>{briefing.summary}</div>

        {/* supporting context */}
        {briefing.context && <div style={{ fontSize: "12px", color: "#8a8a95" }}>{briefing.context}</div>}

        {stale && (
          <button
            type="button"
            onClick={onRefresh}
            style={{ alignSelf: "flex-start", fontSize: "11.5px", color: t.priorityColor, background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
          >
            La situation a évolué — actualiser le briefing →
          </button>
        )}

        {/* CTAs */}
        {briefing.actions.length > 0 && (
          <div className="ceo-briefing-actions" style={{ display: "flex", gap: "9px", marginTop: "8px" }}>
            {briefing.actions.map((a) => (
              <Link
                key={a.actionId}
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

        {/* Pourquoi cette priorité ? — safe factual justification only */}
        {briefing.reasoningSummary && (
          <div style={{ marginTop: "6px" }}>
            <button
              type="button"
              onClick={() => setShowWhy((v) => !v)}
              style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#7d7d88", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Pourquoi cette priorité ?
            </button>
            {showWhy && (
              <div style={{ marginTop: "6px", fontSize: "11.5px", color: "#9a9aa5", lineHeight: 1.5, paddingLeft: "17px", borderLeft: `2px solid ${alpha(c, 0.3)}` }}>
                {briefing.reasoningSummary}
                {briefing.source === "ai" && briefing.confidence != null && (
                  <span style={{ color: "#6b6b76" }}> · confiance {Math.round(briefing.confidence * 100)}%</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
