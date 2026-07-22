"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getRefundQueueAction, createAdminRefundAction } from "@/app/actions/adminRefunds";
import {
  REFUND_QUEUE_TABS,
  REFUND_REASONS,
  REFUND_REASON_LABELS,
  REFUND_SOURCE_LABELS,
  refundReasonLabel,
  refundStatusBadgeClass,
  refundStatusLabel,
  type RefundQueueTab,
} from "@/lib/refunds/status";
import { formatMAD } from "@/lib/format";
import type { RefundQueueItem, RefundQueueResult, RefundQueueFilters } from "@/lib/db/refundsQuery";
import type { RefundReason, RefundSource } from "@/lib/types";

type MethodOpt = { id: string; name: string };

/** Admin refunds queue — support inbox + processing queue. */
export default function RefundsQueueView({
  initial,
  initialFilters,
  paymentMethods,
}: {
  initial: RefundQueueResult;
  initialFilters: RefundQueueFilters;
  paymentMethods: MethodOpt[];
}) {
  const router = useRouter();
  const [result, setResult] = useState(initial);
  const [filters, setFilters] = useState<RefundQueueFilters>(initialFilters);
  const [q, setQ] = useState(initialFilters.q ?? "");
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);

  const methodName = useMemo(() => {
    const map = new Map(paymentMethods.map((m) => [m.id, m.name]));
    return (id: string) => map.get(id) ?? id;
  }, [paymentMethods]);

  const apply = useCallback(
    (patch: Partial<RefundQueueFilters>) => {
      const next = { ...filters, ...patch, page: patch.page ?? 1 };
      setFilters(next);
      // Keep the URL shareable.
      const params = new URLSearchParams();
      if (next.tab && next.tab !== "new") params.set("tab", next.tab);
      if (next.reason) params.set("reason", next.reason);
      if (next.paymentMethod) params.set("method", next.paymentMethod);
      if (next.q) params.set("q", next.q);
      if (next.dateFrom) params.set("from", next.dateFrom);
      if (next.dateTo) params.set("to", next.dateTo);
      if (next.page && next.page > 1) params.set("page", String(next.page));
      router.replace(`/admin/refunds${params.toString() ? `?${params}` : ""}`, { scroll: false });
      startTransition(async () => {
        setResult(await getRefundQueueAction(next));
      });
    },
    [filters, router],
  );

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.q ?? "") !== q) apply({ q: q || null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const { items, counts, total, page, pageSize } = result;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeTab = filters.tab ?? "new";

  return (
    <div className="admin-panel-pad">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">Support</div>
          <h1 className="text-xl font-semibold text-foreground">Remboursements</h1>
          <p className="mt-1 text-sm text-muted">
            File de traitement des demandes de remboursement — examen, contact client et résolution.
          </p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary">
          Nouvelle demande
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {REFUND_QUEUE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => apply({ tab: t.id })}
            className={`chip border transition-colors ${
              activeTab === t.id
                ? "border-accent/40 bg-accent/15 text-accent"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {t.label}
            <span className="ml-1.5 opacity-70">{counts[t.id as RefundQueueTab] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher (n° demande, commande, nom, e-mail, téléphone)"
          className="min-w-[240px] flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
        <select
          value={filters.reason ?? ""}
          onChange={(e) => apply({ reason: (e.target.value as RefundReason) || null })}
          className="rounded-lg border border-border bg-card px-2.5 py-2 text-sm text-foreground"
        >
          <option value="">Tous les motifs</option>
          {REFUND_REASONS.map((r) => (
            <option key={r} value={r}>
              {REFUND_REASON_LABELS[r]}
            </option>
          ))}
        </select>
        <select
          value={filters.paymentMethod ?? ""}
          onChange={(e) => apply({ paymentMethod: e.target.value || null })}
          className="rounded-lg border border-border bg-card px-2.5 py-2 text-sm text-foreground"
        >
          <option value="">Tous les paiements</option>
          {paymentMethods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filters.dateFrom ?? ""}
          onChange={(e) => apply({ dateFrom: e.target.value || null })}
          className="rounded-lg border border-border bg-card px-2.5 py-2 text-sm text-foreground"
        />
        <input
          type="date"
          value={filters.dateTo ?? ""}
          onChange={(e) => apply({ dateTo: e.target.value || null })}
          className="rounded-lg border border-border bg-card px-2.5 py-2 text-sm text-foreground"
        />
      </div>

      <section className="card overflow-hidden">
        {items.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-foreground">
              Aucune demande de remboursement ne nécessite votre attention.
            </p>
            <p className="mt-1 text-sm text-muted">
              Les nouvelles demandes apparaîtront ici dès qu’un client en soumettra une.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3">Demande</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Produit</th>
                    <th className="px-4 py-3">Montant</th>
                    <th className="px-4 py-3">Motif</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3">Âge</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 hover:bg-accent/[0.03]">
                      <td className="px-4 py-3 align-top">
                        <Link href={`/admin/refunds/${r.id}`} className="font-semibold text-accent">
                          {r.number}
                        </Link>
                        <div className="text-xs text-muted">{r.orderNumber}</div>
                        {r.legacy && <div className="text-[10px] text-amber-400">Historique</div>}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-foreground">{r.customerName}</div>
                        <div className="text-xs text-muted">{r.customerEmail}</div>
                        {r.customerPhone && (
                          <div className="text-xs text-muted">{r.customerPhone}</div>
                        )}
                      </td>
                      <td className="max-w-[220px] px-4 py-3 align-top text-xs text-muted">
                        {r.productSummary}
                        <div className="mt-0.5 text-[11px]">{methodName(r.paymentMethod)}</div>
                      </td>
                      <td className="px-4 py-3 align-top font-medium text-foreground">
                        {formatMAD(r.requestedAmountMad)}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-muted">
                        {refundReasonLabel(r.reason)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`chip border ${refundStatusBadgeClass(r.status)}`}>
                          {refundStatusLabel(r.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-muted">{ageLabel(r.ageHours)}</td>
                      <td className="px-4 py-3 align-top text-xs text-muted">{r.nextAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-border md:hidden">
              {items.map((r) => (
                <Link
                  key={r.id}
                  href={`/admin/refunds/${r.id}`}
                  className="block px-4 py-3 active:bg-accent/[0.05]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-accent">{r.number}</span>
                    <span className={`chip border ${refundStatusBadgeClass(r.status)}`}>
                      {refundStatusLabel(r.status)}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-foreground">{r.customerName}</div>
                  <div className="text-xs text-muted">{r.customerEmail}</div>
                  {r.customerPhone && <div className="text-xs text-muted">{r.customerPhone}</div>}
                  <div className="mt-1 flex items-center justify-between text-xs text-muted">
                    <span>
                      {r.orderNumber} · {refundReasonLabel(r.reason)}
                    </span>
                    <span className="font-medium text-foreground">
                      {formatMAD(r.requestedAmountMad)}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted">
                    {ageLabel(r.ageHours)} · {r.nextAction}
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1 || pending}
            onClick={() => apply({ page: page - 1 })}
            className="rounded-lg border border-border px-3 py-1.5 text-muted disabled:opacity-40"
          >
            Précédent
          </button>
          <span className="text-muted">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || pending}
            onClick={() => apply({ page: page + 1 })}
            className="rounded-lg border border-border px-3 py-1.5 text-muted disabled:opacity-40"
          >
            Suivant
          </button>
        </nav>
      )}

      {createOpen && (
        <AdminCreateRefundModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            router.push(`/admin/refunds/${id}`);
          }}
        />
      )}
    </div>
  );
}

function ageLabel(hours: number): string {
  if (hours < 1) return "à l’instant";
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} j`;
}

function AdminCreateRefundModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [orderNumber, setOrderNumber] = useState("");
  const [source, setSource] = useState<RefundSource>("WHATSAPP");
  const [reason, setReason] = useState<RefundReason>("other");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError("");
    if (!orderNumber.trim()) {
      setError("Indiquez le numéro de commande.");
      return;
    }
    if (description.trim().length < 5) {
      setError("Décrivez brièvement la demande.");
      return;
    }
    setSaving(true);
    try {
      const res = await createAdminRefundAction({
        orderNumber: orderNumber.trim(),
        source,
        reason,
        description: description.trim(),
        requestedAmountMad: amount ? Math.round(Number(amount)) : undefined,
      });
      if (res.ok) onCreated(res.id);
      else setError(res.error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Nouvelle demande de remboursement</h2>
        <p className="mt-1 text-xs text-muted">
          Pour une demande reçue par WhatsApp, e-mail ou support. Les coordonnées client sont
          reprises de la commande.
        </p>

        <label className="mt-4 block text-sm font-medium text-foreground">N° de commande</label>
        <input
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          placeholder="#000008"
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as RefundSource)}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground"
            >
              {(Object.keys(REFUND_SOURCE_LABELS) as RefundSource[]).map((s) => (
                <option key={s} value={s}>
                  {REFUND_SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">Motif</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as RefundReason)}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground"
            >
              {REFUND_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REFUND_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="mt-4 block text-sm font-medium text-foreground">
          Montant (MAD, facultatif)
        </label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="Par défaut : total de la commande"
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />

        <label className="mt-4 block text-sm font-medium text-foreground">Résumé</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1.5 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border py-2 text-sm text-muted"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="btn-primary flex-1 disabled:opacity-60"
          >
            {saving ? "Création…" : "Créer la demande"}
          </button>
        </div>
      </div>
    </div>
  );
}
