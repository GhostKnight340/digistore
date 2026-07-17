"use client";

import type { SupplierHealthLevel } from "@/lib/dto";

/** 🟢 / 🟡 / 🔴 health badge + admin states, shared by list & detail pages. */
export function SupplierHealthBadge({ health }: { health: SupplierHealthLevel }) {
  const styles: Record<SupplierHealthLevel, { dot: string; text: string; label: string; bg: string }> = {
    healthy: { dot: "#2EA067", text: "#5BC98C", bg: "rgba(46,160,103,0.12)", label: "Opérationnel" },
    warning: { dot: "#E8A838", text: "#F0C466", bg: "rgba(232,168,56,0.12)", label: "Attention" },
    offline: { dot: "#E5484D", text: "#F08084", bg: "rgba(229,72,77,0.12)", label: "Hors ligne" },
    disabled: { dot: "#646A77", text: "#9A9FAB", bg: "rgba(255,255,255,0.06)", label: "Désactivé" },
    unconfigured: { dot: "#646A77", text: "#9A9FAB", bg: "rgba(255,255,255,0.06)", label: "Non configuré" },
  };
  const s = styles[health];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium"
      style={{ background: s.bg, color: s.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

/** Supplier logo tile — brand-tinted initials (no official logo assets). */
export function SupplierLogoTile({
  initials,
  accentColor,
  size = 44,
}: {
  initials: string;
  accentColor: string;
  size?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        background: `linear-gradient(150deg, ${accentColor}55, ${accentColor}22)`,
        border: `1px solid ${accentColor}66`,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function EnvironmentBadge({ environment }: { environment: "sandbox" | "live" | null }) {
  if (!environment) return null;
  const live = environment === "live";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide"
      style={{
        background: live ? "rgba(46,160,103,0.12)" : "rgba(232,168,56,0.12)",
        color: live ? "#5BC98C" : "#F0C466",
      }}
    >
      {live ? "Live" : "Sandbox"}
    </span>
  );
}

export function formatSupplierDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
