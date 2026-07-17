"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupplierLogsAction } from "@/app/actions/supplierManagement";
import type { SupplierLogFilters, SupplierLogsPageDTO } from "@/lib/dto";
import { formatSupplierDate } from "./shared";

const REQUEST_TYPES: { value: string; label: string }[] = [
  { value: "", label: "Tous les types" },
  { value: "purchase", label: "Achat" },
  { value: "health_check", label: "Test de connexion" },
  { value: "balance", label: "Solde" },
  { value: "status_poll", label: "Suivi de statut" },
];

const TYPE_LABELS: Record<string, string> = {
  purchase: "Achat",
  health_check: "Test",
  balance: "Solde",
  status_poll: "Suivi",
};

/**
 * /admin/suppliers/[slug]/logs — outcome-only operation log. No request or
 * response payloads are stored server-side, so nothing sensitive can appear
 * here; errorMessage is the admin-safe French message shown at the time.
 */
export default function SupplierLogsView({
  slug,
  supplierName,
  initial,
}: {
  slug: string;
  supplierName: string;
  initial: SupplierLogsPageDTO;
}) {
  const [filters, setFilters] = useState<SupplierLogFilters>({});
  const [result, setResult] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function apply(patch: Partial<SupplierLogFilters>) {
    const next = { ...filters, ...patch, page: patch.page ?? 1 };
    setFilters(next);
    setLoading(true);
    try {
      setResult(await getSupplierLogsAction(slug, next));
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="min-w-0">
      <div className="mb-4 text-xs text-faint">
        <Link href="/admin/suppliers" className="hover:text-white hover:underline">
          Fournisseurs
        </Link>{" "}
        /{" "}
        <Link href={`/admin/suppliers/${slug}`} className="hover:text-white hover:underline">
          {supplierName}
        </Link>{" "}
        / <span className="text-muted">Journaux</span>
      </div>

      <header className="mb-5">
        <h1 className="text-xl font-semibold text-white">Journaux — {supplierName}</h1>
        <p className="text-sm text-muted">
          {result.total} opération{result.total === 1 ? "" : "s"} enregistrée
          {result.total === 1 ? "" : "s"}
        </p>
      </header>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <FilterField label="Du">
          <input
            type="date"
            className="input h-9 text-xs"
            value={filters.from ?? ""}
            onChange={(e) => apply({ from: e.target.value || undefined })}
          />
        </FilterField>
        <FilterField label="Au">
          <input
            type="date"
            className="input h-9 text-xs"
            value={filters.to ?? ""}
            onChange={(e) => apply({ to: e.target.value || undefined })}
          />
        </FilterField>
        <FilterField label="Résultat">
          <select
            className="input h-9 text-xs"
            value={filters.result ?? ""}
            onChange={(e) => apply({ result: (e.target.value as SupplierLogFilters["result"]) || "" })}
          >
            <option value="">Tous</option>
            <option value="ok">Succès</option>
            <option value="failed">Échecs</option>
          </select>
        </FilterField>
        <FilterField label="Type">
          <select
            className="input h-9 text-xs"
            value={filters.requestType ?? ""}
            onChange={(e) => apply({ requestType: e.target.value || undefined })}
          >
            {REQUEST_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Produit">
          <input
            className="input h-9 text-xs"
            placeholder="Filtrer par produit…"
            defaultValue={filters.product ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply({ product: e.currentTarget.value || undefined });
            }}
            onBlur={(e) => {
              if ((filters.product ?? "") !== e.currentTarget.value) {
                apply({ product: e.currentTarget.value || undefined });
              }
            }}
          />
        </FilterField>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead>
            <tr className="border-b border-border text-[10.5px] uppercase tracking-wide text-faint">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Commande</th>
              <th className="px-4 py-3 font-medium">Produit</th>
              <th className="px-4 py-3 font-medium">Réf. fournisseur</th>
              <th className="px-4 py-3 font-medium">Résultat</th>
              <th className="px-4 py-3 text-right font-medium">Temps</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <tr key={index} className="border-b border-border/60">
                  {Array.from({ length: 7 }).map((_, cell) => (
                    <td key={cell} className="px-4 py-3">
                      <span className="block h-3 w-full max-w-[90px] animate-pulse rounded bg-white/10" />
                    </td>
                  ))}
                </tr>
              ))
            ) : result.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">
                  Aucune opération ne correspond à ces filtres.
                </td>
              </tr>
            ) : (
              result.rows.map((row) => (
                <>
                  <tr key={row.id} className="border-b border-border/60 text-muted">
                    <td className="whitespace-nowrap px-4 py-3">{formatSupplierDate(row.createdAt)}</td>
                    <td className="px-4 py-3">{TYPE_LABELS[row.requestType] ?? row.requestType}</td>
                    <td className="px-4 py-3">
                      {row.orderId ? (
                        <Link
                          href={`/admin/orders/${row.orderId}`}
                          className="text-accent-blue hover:underline"
                        >
                          Voir la commande
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3">{row.productName ?? "—"}</td>
                    <td className="max-w-[140px] truncate px-4 py-3 font-mono">
                      {row.providerRef ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {row.ok ? (
                        <span className="text-green-400">✓ Succès</span>
                      ) : (
                        <span className="text-red-400">✕ Échec</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {row.responseTimeMs != null ? `${row.responseTimeMs} ms` : "—"}
                    </td>
                  </tr>
                  {!row.ok && row.errorMessage && (
                    <tr key={`${row.id}-error`} className="border-b border-border/60">
                      <td colSpan={7} className="px-4 pb-3 pt-0">
                        <span className="block rounded-lg bg-red-500/10 px-3 py-1.5 text-[11.5px] text-red-400">
                          {row.errorMessage}
                        </span>
                      </td>
                    </tr>
                  )}
                </>
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

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-faint">{label}</span>
      {children}
    </label>
  );
}
