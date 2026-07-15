"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getFeedbackListAction, setFeedbackStatusAction } from "@/app/actions/feedback";
import {
  feedbackTypeLabel,
  FEEDBACK_TYPES,
  FEEDBACK_STATUSES,
  FEEDBACK_PRIORITIES,
} from "@/lib/feedback";
import type { FeedbackListFilters, FeedbackListResult } from "@/lib/feedbackDto";
import { formatAdminDate } from "@/components/admin/clients/shared";
import { FeedbackStatusBadge, FeedbackPriorityBadge } from "./badges";

export default function FeedbackListView({
  initial,
  initialFilters,
}: {
  initial: FeedbackListResult;
  initialFilters: FeedbackListFilters;
}) {
  const [filters, setFilters] = useState<FeedbackListFilters>(initialFilters);
  const [result, setResult] = useState<FeedbackListResult>(initial);
  const [loading, setLoading] = useState(false);
  const [queryInput, setQueryInput] = useState(initialFilters.query ?? "");
  const first = useRef(true);

  const fetchPage = useCallback(async (next: FeedbackListFilters) => {
    setLoading(true);
    try {
      setResult(await getFeedbackListAction(next));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
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

  function apply(patch: Partial<FeedbackListFilters>) {
    const next = { ...filters, ...patch, page: patch.page ?? 1 };
    setFilters(next);
    void fetchPage(next);
  }

  // Inline triage: mark a row's status straight from the list. Optimistic, then
  // refetch so the row re-sorts / drops out if a status filter is active.
  async function mark(id: string, status: string) {
    setResult((r) => ({
      ...r,
      items: r.items.map((it) =>
        it.id === id ? { ...it, status: status as (typeof it)["status"] } : it,
      ),
    }));
    await setFeedbackStatusAction(id, status);
    void fetchPage(filters);
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="min-w-0">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-white">Feedback</h1>
        <p className="text-sm text-muted">
          {result.total} retour{result.total === 1 ? "" : "s"} · suggestions, demandes de produit
          et retours d’expérience (distinct du support).
        </p>
      </header>

      <div className="mb-4 space-y-3">
        <div className="relative">
          <input
            type="search"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Rechercher (référence, sujet, message, client, page)…"
            aria-label="Rechercher un retour"
            className="input h-11 w-full pl-10"
          />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.6" y2="16.6" />
          </svg>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select label="Type" value={filters.type ?? ""} onChange={(v) => apply({ type: v })}
            options={[["", "Tous les types"], ...FEEDBACK_TYPES.map((t) => [t.value, t.label] as [string, string])]} />
          <Select label="Statut" value={filters.status ?? ""} onChange={(v) => apply({ status: v })}
            options={[["", "Tous les statuts"], ...FEEDBACK_STATUSES.map((s) => [s.value, s.label] as [string, string])]} />
          <Select label="Priorité" value={filters.priority ?? ""} onChange={(v) => apply({ priority: v })}
            options={[["", "Toutes priorités"], ...FEEDBACK_PRIORITIES.map((p) => [p.value, p.label] as [string, string])]} />
          <Select label="Public" value={filters.audience ?? ""} onChange={(v) => apply({ audience: v as FeedbackListFilters["audience"] })}
            options={[["", "Client / visiteur"], ["customer", "Client connecté"], ["guest", "Visiteur"]]} />
          <Select label="Pièce jointe" value={filters.attachment ?? ""} onChange={(v) => apply({ attachment: v as FeedbackListFilters["attachment"] })}
            options={[["", "Pièce jointe"], ["has", "Avec pièce jointe"]]} />
          <Select label="Attribution" value={filters.assignment ?? ""} onChange={(v) => apply({ assignment: v as FeedbackListFilters["assignment"] })}
            options={[["", "Attribué / non"], ["assigned", "Attribué"], ["unassigned", "Non attribué"]]} />
          <Select label="Tri" value={filters.sort ?? "newest"} onChange={(v) => apply({ sort: v as FeedbackListFilters["sort"] })}
            options={[["newest", "Plus récents"], ["oldest", "Plus anciens"], ["priority", "Priorité"], ["updated", "Récemment mis à jour"]]} />
        </div>
      </div>

      {/* Desktop */}
      <section className="card hidden overflow-x-auto md:block" aria-busy={loading}>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="px-4 py-3">Réf.</th>
              <th scope="col" className="px-4 py-3">Type</th>
              <th scope="col" className="px-4 py-3">Sujet</th>
              <th scope="col" className="px-4 py-3">Auteur</th>
              <th scope="col" className="px-4 py-3">Statut</th>
              <th scope="col" className="px-4 py-3">Priorité</th>
              <th scope="col" className="px-4 py-3">Date</th>
              <th scope="col" className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {result.items.map((f) => (
              <tr key={f.id} className="border-b border-border/60 hover:bg-surface">
                <td className="px-4 py-3 font-mono text-xs">{f.reference}</td>
                <td className="px-4 py-3 text-muted">{feedbackTypeLabel(f.type)}</td>
                <td className="max-w-[280px] px-4 py-3">
                  <div className="truncate text-white">{f.subject}</div>
                  {f.relatedRoute && <div className="truncate text-xs text-faint">{f.relatedRoute}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className="text-muted">{f.senderLabel}</span>
                  <span className="ml-1 text-[11px] text-faint">{f.isGuest ? "· visiteur" : ""}</span>
                  {f.hasAttachment && <span className="ml-1 text-[11px] text-accent">📎</span>}
                </td>
                <td className="px-4 py-3">
                  <select
                    className="input h-8 w-auto py-0 text-xs"
                    value={f.status}
                    aria-label={`Statut de ${f.reference}`}
                    onChange={(e) => mark(f.id, e.target.value)}
                  >
                    {FEEDBACK_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3"><FeedbackPriorityBadge priority={f.priority} /></td>
                <td className="px-4 py-3 text-muted">{formatAdminDate(f.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/feedback/${f.id}`} className="text-sm font-medium text-accent hover:text-accent-hover">Ouvrir</Link>
                </td>
              </tr>
            ))}
            {result.items.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">Aucun retour ne correspond.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Mobile */}
      <section className="space-y-3 md:hidden" aria-busy={loading}>
        {result.items.map((f) => (
          <Link key={f.id} href={`/admin/feedback/${f.id}`} className="card block p-4 active:bg-surface">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium text-white">{f.subject}</div>
                <div className="truncate text-xs text-faint">
                  {f.reference} · {feedbackTypeLabel(f.type)} · {f.senderLabel}
                </div>
              </div>
              <FeedbackPriorityBadge priority={f.priority} />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <FeedbackStatusBadge status={f.status} />
              <span className="text-xs text-faint">{formatAdminDate(f.createdAt)}</span>
            </div>
          </Link>
        ))}
        {result.items.length === 0 && <div className="card p-8 text-center text-sm text-muted">Aucun retour.</div>}
      </section>

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3 text-sm" aria-label="Pagination">
          <button type="button" className="btn-ghost h-9 px-4" disabled={result.page <= 1 || loading} onClick={() => apply({ page: result.page - 1 })}>Précédent</button>
          <span className="text-muted">Page {result.page} / {totalPages}</span>
          <button type="button" className="btn-ghost h-9 px-4" disabled={result.page >= totalPages || loading} onClick={() => apply({ page: result.page + 1 })}>Suivant</button>
        </nav>
      )}
    </div>
  );
}

function Select({
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
    <select className="input h-9 w-auto text-sm" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}
