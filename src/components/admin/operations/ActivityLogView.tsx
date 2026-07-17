"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getActivityLogAction } from "@/app/actions/operations";
import type { OpsActivityKind, OpsActivityLogFilters, OpsActivityLogPageDTO } from "@/lib/dto";
import { relativeTime } from "./shared";

const TYPE_FILTERS: { value: OpsActivityLogFilters["type"]; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "order", label: "Commandes" },
  { value: "payment", label: "Paiements" },
  { value: "supplier", label: "Fournisseurs" },
  { value: "email", label: "E-mails" },
];

const KIND_DOT: Record<OpsActivityKind, string> = {
  order: "#7FA6FF",
  payment: "#5BC98C",
  supplier: "#E8A838",
  email: "#E05C5C",
};

function fullDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ActivityLogView({ initial }: { initial: OpsActivityLogPageDTO }) {
  const [result, setResult] = useState(initial);
  const [filters, setFilters] = useState<OpsActivityLogFilters>({ type: "all", sort: "newest", page: 1 });
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const firstRender = useRef(true);

  const fetchPage = useCallback(async (next: OpsActivityLogFilters) => {
    setLoading(true);
    try {
      setResult(await getActivityLogAction(next));
    } finally {
      setLoading(false);
    }
  }, []);

  function apply(patch: Partial<OpsActivityLogFilters>) {
    const next = { ...filters, ...patch, page: patch.page ?? 1 };
    setFilters(next);
    void fetchPage(next);
  }

  // Debounce the search box.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(() => apply({ search: searchInput }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="h-full min-w-0 overflow-y-auto px-6 pb-8 pt-5 lg:px-7">
      <div className="mb-4 text-xs text-faint">
        <Link href="/admin/operations" className="hover:text-white hover:underline">
          Centre de contrôle
        </Link>{" "}
        / <span className="text-muted">Activité</span>
      </div>

      <header className="mb-5">
        <h1 className="text-xl font-semibold text-white">Journal d’activité</h1>
        <p className="text-sm text-muted">
          {result.total} événement{result.total === 1 ? "" : "s"}
          {result.windowSaturated && " (fenêtre récente)"}
        </p>
      </header>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <input
            className="input h-9 py-0 text-sm"
            placeholder="Rechercher dans l’activité…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => apply({ type: f.value })}
              className="rounded-lg px-3 py-1.5 text-xs"
              style={
                filters.type === f.value
                  ? { color: "#EAF0FF", background: "rgba(62,123,250,0.13)", border: "1px solid rgba(62,123,250,0.25)" }
                  : { color: "#9A9FAB", background: "#121319", border: "1px solid rgba(255,255,255,0.06)" }
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          className="input h-9 w-auto py-0 text-xs"
          value={filters.sort}
          onChange={(e) => apply({ sort: e.target.value as OpsActivityLogFilters["sort"] })}
        >
          <option value="newest">Plus récents</option>
          <option value="oldest">Plus anciens</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead>
            <tr className="border-b border-border text-[10.5px] uppercase tracking-wide text-faint">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Événement</th>
              <th className="px-4 py-3 font-medium">Détail</th>
              <th className="px-4 py-3 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border/60">
                  {Array.from({ length: 5 }).map((_, c) => (
                    <td key={c} className="px-4 py-3">
                      <span className="block h-3 w-full max-w-[120px] animate-pulse rounded bg-white/10" />
                    </td>
                  ))}
                </tr>
              ))
            ) : result.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted">
                  Aucun événement ne correspond à ces filtres.
                </td>
              </tr>
            ) : (
              result.rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60 text-muted hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-4 py-3 font-mono">{fullDate(row.at)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_DOT[row.kind] }} />
                      {row.kindLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white">{row.title}</td>
                  <td className="max-w-[220px] truncate px-4 py-3">{row.detail || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {row.href && (
                      <Link href={row.href} className="text-accent-blue hover:underline">
                        Ouvrir
                      </Link>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-xs text-muted">
          <span>
            Page {result.page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost h-8 px-3 text-xs disabled:opacity-50"
              disabled={result.page <= 1 || loading}
              onClick={() => apply({ page: result.page - 1 })}
            >
              Précédent
            </button>
            <button
              type="button"
              className="btn-ghost h-8 px-3 text-xs disabled:opacity-50"
              disabled={result.page >= totalPages || loading}
              onClick={() => apply({ page: result.page + 1 })}
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
