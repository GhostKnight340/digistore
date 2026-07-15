"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatMAD } from "@/lib/format";
import { getCustomerListAction } from "@/app/actions/customers";
import type {
  AdminCustomerListResult,
  CustomerListFilters,
} from "@/lib/customerAdminDto";
import { CustomerStatusBadge, formatAdminDate } from "./shared";

const SORTS: { value: NonNullable<CustomerListFilters["sort"]>; label: string }[] = [
  { value: "newest", label: "Plus récents" },
  { value: "oldest", label: "Plus anciens" },
  { value: "most_orders", label: "Plus de commandes" },
  { value: "highest_spend", label: "Dépense la plus élevée" },
  { value: "recent_activity", label: "Activité récente" },
];

export default function ClientsListView({
  initial,
  initialFilters,
}: {
  initial: AdminCustomerListResult;
  initialFilters: CustomerListFilters;
}) {
  const [filters, setFilters] = useState<CustomerListFilters>(initialFilters);
  const [result, setResult] = useState<AdminCustomerListResult>(initial);
  const [loading, setLoading] = useState(false);
  const [queryInput, setQueryInput] = useState(initialFilters.query ?? "");
  const firstRender = useRef(true);

  const fetchPage = useCallback(async (next: CustomerListFilters) => {
    setLoading(true);
    try {
      const data = await getCustomerListAction(next);
      setResult(data);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce the search box; other filters apply immediately.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      const next = { ...filters, query: queryInput, page: 1 };
      setFilters(next);
      void fetchPage(next);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryInput]);

  function apply(patch: Partial<CustomerListFilters>) {
    const next = { ...filters, ...patch, page: patch.page ?? 1 };
    setFilters(next);
    void fetchPage(next);
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="min-w-0">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-white">Clients</h1>
        <p className="text-sm text-muted">
          {result.total} compte{result.total === 1 ? "" : "s"} client
          {result.total === 1 ? "" : "s"}
        </p>
      </header>

      {/* Search + filters */}
      <div className="mb-4 space-y-3">
        <div className="relative">
          <input
            type="search"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Rechercher par nom, e-mail, téléphone ou n° de commande…"
            aria-label="Rechercher un client"
            className="input h-11 w-full pl-10"
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.6" y2="16.6" />
          </svg>
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label="Statut"
            value={filters.status ?? ""}
            onChange={(v) => apply({ status: v as CustomerListFilters["status"] })}
            options={[
              ["", "Tous les statuts"],
              ["active", "Actif"],
              ["disabled", "Désactivé"],
              ["review", "En revue"],
              ["fraud_hold", "Blocage fraude"],
            ]}
          />
          <FilterSelect
            label="Vérification"
            value={filters.verified ?? ""}
            onChange={(v) => apply({ verified: v as CustomerListFilters["verified"] })}
            options={[
              ["", "Vérifié / non"],
              ["verified", "Vérifié"],
              ["unverified", "Non vérifié"],
            ]}
          />
          <FilterSelect
            label="Commandes"
            value={filters.orders ?? ""}
            onChange={(v) => apply({ orders: v as CustomerListFilters["orders"] })}
            options={[
              ["", "Avec / sans commandes"],
              ["has", "A des commandes"],
              ["none", "Sans commande"],
            ]}
          />
          <FilterSelect
            label="Ghost Credit"
            value={filters.ghostCredit ?? ""}
            onChange={(v) => apply({ ghostCredit: v as CustomerListFilters["ghostCredit"] })}
            options={[
              ["", "Ghost Credit"],
              ["has", "Avec solde"],
            ]}
          />
          <FilterSelect
            label="Support"
            value={filters.openSupport ?? ""}
            onChange={(v) => apply({ openSupport: v as CustomerListFilters["openSupport"] })}
            options={[
              ["", "Support"],
              ["has", "Tickets ouverts"],
            ]}
          />
          <FilterSelect
            label="Tri"
            value={filters.sort ?? "newest"}
            onChange={(v) => apply({ sort: v as CustomerListFilters["sort"] })}
            options={SORTS.map((s) => [s.value, s.label])}
          />
        </div>
      </div>

      {/* Desktop table */}
      <section className="card hidden overflow-x-auto md:block" aria-busy={loading}>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="px-4 py-3">Client</th>
              <th scope="col" className="px-4 py-3">Statut</th>
              <th scope="col" className="px-4 py-3">Création</th>
              <th scope="col" className="px-4 py-3">Activité</th>
              <th scope="col" className="px-4 py-3 text-right">Cmd.</th>
              <th scope="col" className="px-4 py-3 text-right">Dépense</th>
              <th scope="col" className="px-4 py-3 text-right">Ghost Credit</th>
              <th scope="col" className="px-4 py-3 text-right">Support</th>
              <th scope="col" className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {result.items.map((c) => (
              <tr key={c.id} className="border-b border-border/60 hover:bg-surface">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{c.name}</div>
                  <div className="text-xs text-faint">{c.email}</div>
                </td>
                <td className="px-4 py-3">
                  <CustomerStatusBadge status={c.status} verified={c.emailVerified} />
                </td>
                <td className="px-4 py-3 text-muted">{formatAdminDate(c.createdAt)}</td>
                <td className="px-4 py-3 text-muted">{formatAdminDate(c.lastActivityAt)}</td>
                <td className="px-4 py-3 text-right font-mono">{c.orderCount}</td>
                <td className="px-4 py-3 text-right font-mono">{formatMAD(c.completedSpendMad)}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatMAD(c.ghostCreditBalanceMad)}
                  {c.walletFrozen && <span className="ml-1 text-[11px] text-amber-400">gelé</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  {c.openSupportCount > 0 ? (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">
                      {c.openSupportCount}
                    </span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/clients/${c.id}`}
                    className="text-sm font-medium text-accent hover:text-accent-hover"
                  >
                    Ouvrir
                  </Link>
                </td>
              </tr>
            ))}
            {result.items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted">
                  Aucun client ne correspond à ces critères.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Mobile cards */}
      <section className="space-y-3 md:hidden" aria-busy={loading}>
        {result.items.map((c) => (
          <Link
            key={c.id}
            href={`/admin/clients/${c.id}`}
            className="card block p-4 active:bg-surface"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium text-white">{c.name}</div>
                <div className="truncate text-xs text-faint">{c.email}</div>
              </div>
              <CustomerStatusBadge status={c.status} verified={c.emailVerified} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <Meta label="Commandes" value={String(c.orderCount)} />
              <Meta label="Dépense" value={formatMAD(c.completedSpendMad)} />
              <Meta label="Ghost Credit" value={formatMAD(c.ghostCreditBalanceMad)} />
              <Meta label="Support ouvert" value={String(c.openSupportCount)} />
            </dl>
          </Link>
        ))}
        {result.items.length === 0 && (
          <div className="card p-8 text-center text-sm text-muted">Aucun client.</div>
        )}
      </section>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3 text-sm" aria-label="Pagination">
          <button
            type="button"
            className="btn-ghost h-9 px-4"
            disabled={result.page <= 1 || loading}
            onClick={() => apply({ page: result.page - 1 })}
          >
            Précédent
          </button>
          <span className="text-muted">
            Page {result.page} / {totalPages}
          </span>
          <button
            type="button"
            className="btn-ghost h-9 px-4"
            disabled={result.page >= totalPages || loading}
            onClick={() => apply({ page: result.page + 1 })}
          >
            Suivant
          </button>
        </nav>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      className="input h-9 w-auto text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-faint">{label}</dt>
      <dd className="font-mono text-muted">{value}</dd>
    </div>
  );
}
