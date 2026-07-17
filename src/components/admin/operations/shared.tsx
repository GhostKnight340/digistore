"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { OpsHealthStatus, OpsWarningSeverity } from "@/lib/dto";

/** Calm, operational palette — red is reserved for real problems only. */
const STATUS_STYLE: Record<OpsHealthStatus, { dot: string; text: string; label: string }> = {
  healthy: { dot: "#2EA067", text: "#5BC98C", label: "Opérationnel" },
  warning: { dot: "#E8A838", text: "#F0C466", label: "Attention" },
  offline: { dot: "#E5484D", text: "#F08084", label: "Hors ligne" },
  unknown: { dot: "#646A77", text: "#9A9FAB", label: "Inconnu" },
};

export function StatusDot({ status, pulse = false }: { status: OpsHealthStatus; pulse?: boolean }) {
  const s = STATUS_STYLE[status];
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {pulse && status !== "unknown" && (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
          style={{ background: s.dot }}
        />
      )}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: s.dot }} />
    </span>
  );
}

export function StatusBadge({ status, label }: { status: OpsHealthStatus; label?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{ background: `${s.dot}1f`, color: s.text }}
    >
      <StatusDot status={status} />
      {label ?? s.label}
    </span>
  );
}

const SEVERITY_STYLE: Record<OpsWarningSeverity, { border: string; bg: string; text: string; icon: string }> = {
  critical: { border: "rgba(229,72,77,0.35)", bg: "rgba(229,72,77,0.08)", text: "#F08084", icon: "🔴" },
  warning: { border: "rgba(232,168,56,0.3)", bg: "rgba(232,168,56,0.08)", text: "#F0C466", icon: "🟡" },
  info: { border: "rgba(127,166,255,0.28)", bg: "rgba(127,166,255,0.07)", text: "#9FB8FF", icon: "🔵" },
};

export function WarningRow({
  severity,
  title,
  description,
  href,
}: {
  severity: OpsWarningSeverity;
  title: string;
  description: string;
  href?: string;
}) {
  const s = SEVERITY_STYLE[severity];
  const body = (
    <div
      className="flex items-start gap-3 rounded-xl border px-3.5 py-2.5"
      style={{ borderColor: s.border, background: s.bg }}
    >
      <span className="mt-0.5 text-[11px]">{s.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold" style={{ color: s.text }}>
          {title}
        </p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      {href && <span className="mt-0.5 shrink-0 text-xs text-faint">→</span>}
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-opacity hover:opacity-90">
      {body}
    </Link>
  ) : (
    body
  );
}

/**
 * Consistent dashboard card shell: title, optional icon + status badge +
 * action, and a body. Handles the empty/error states inline so every card
 * looks the same.
 */
export function OpsCard({
  title,
  icon,
  status,
  headerRight,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  status?: OpsHealthStatus;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card flex flex-col p-4 ${className}`}>
      <div className="mb-3 flex items-center gap-2">
        {icon && <span className="text-muted">{icon}</span>}
        <h2 className="text-[13.5px] font-semibold text-white">{title}</h2>
        {status && <StatusDot status={status} />}
        <span className="flex-1" />
        {headerRight}
      </div>
      {children}
    </section>
  );
}

/**
 * A single metric tile: label + value, optional secondary text + status tint,
 * click-through to a filtered admin view. Reserved-red only when `tone` says so.
 */
export function MetricTile({
  label,
  value,
  hint,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  href?: string;
}) {
  const toneColor =
    tone === "bad" ? "#F08084" : tone === "warn" ? "#F0C466" : tone === "good" ? "#5BC98C" : "#F3F4F7";
  const inner = (
    <div className="rounded-xl border border-border bg-surface2/40 px-3 py-2.5 transition-colors hover:border-border-strong">
      <p className="text-[10px] font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color: toneColor }}>
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card space-y-3 p-4">
      <div className="h-4 w-1/3 animate-pulse rounded bg-white/10" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: rows * 2 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return "à l’instant";
  if (diffSec < 3600) return `il y a ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `il y a ${Math.floor(diffSec / 3600)} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}
