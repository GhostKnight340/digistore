"use client";

import type { CustomerStatus } from "@/lib/customerAdminDto";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const DATETIME_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatAdminDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return DATE_FMT.format(d);
}

export function formatAdminDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return DATETIME_FMT.format(d);
}

const STATUS_META: Record<CustomerStatus, { label: string; className: string }> = {
  active: { label: "Actif", className: "border-green-500/40 text-green-400" },
  disabled: { label: "Désactivé", className: "border-red-500/40 text-red-400" },
  review: { label: "En revue", className: "border-amber-500/40 text-amber-400" },
  fraud_hold: { label: "Blocage fraude", className: "border-red-500/50 text-red-300" },
  deleted: { label: "Supprimé", className: "border-zinc-500/40 text-zinc-400" },
};

/**
 * Account status pill. Status is conveyed by the text label (not colour alone),
 * with a leading glyph for the non-active states so it is distinguishable
 * without relying on colour.
 */
export function CustomerStatusBadge({
  status,
  verified,
}: {
  status: CustomerStatus;
  verified?: boolean;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.active;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
      >
        {status !== "active" && <span aria-hidden>●</span>}
        {meta.label}
      </span>
      {verified === false && (
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-faint">
          Non vérifié
        </span>
      )}
    </span>
  );
}
