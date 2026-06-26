"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMAD, formatDate } from "@/lib/format";
import { orderStatusShort, orderStatusBadgeClass, isDelivered } from "@/lib/orderStatus";
import {
  getAdminPaymentOrdersAction,
  getAdminOrderDetailAction,
  getAvailableCodesAction,
  deliverOrderAction,
} from "@/app/actions/admin";
import {
  approvePaymentAction,
  rejectPaymentAction,
  markPaymentIssueAction,
  getPaymentProofAction,
} from "@/app/actions/payments";
import type { AdminOrderDTO, AdminOrderSummaryDTO, AdminCodeDTO, AssignmentEntry, ItemAssignment } from "@/lib/dto";

type TabFilter = "submitted" | "confirmed" | "issue" | "rejected" | "delivered" | "all";

const TABS: { id: TabFilter; label: string }[] = [
  { id: "submitted", label: "À vérifier" },
  { id: "confirmed", label: "Confirmés" },
  { id: "issue", label: "Problèmes" },
  { id: "rejected", label: "Rejetés" },
  { id: "delivered", label: "Livrés" },
  { id: "all", label: "Tous" },
];

const METHOD_LABELS: Record<string, string> = {
  bank: "Virement",
  usdt: "USDT",
  paypal: "PayPal",
  card: "Carte",
  test: "Test",
};

export default function PaymentsPanel() {
  const [orders, setOrders] = useState<AdminOrderSummaryDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<TabFilter>("submitted");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const data = await getAdminPaymentOrdersAction();
      setOrders(data);
    } catch (error) {
      console.error("Failed to load payments", error);
      setLoadError("Impossible de charger les paiements.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const countFor = (t: TabFilter) => {
    if (t === "all") return orders.length;
    if (t === "submitted") return orders.filter((o) => o.status === "payment_submitted").length;
    if (t === "confirmed") return orders.filter((o) => o.status === "payment_confirmed").length;
    if (t === "issue") return orders.filter((o) => o.status === "payment_issue").length;
    if (t === "rejected") return orders.filter((o) => o.status === "rejected").length;
    if (t === "delivered") return orders.filter((o) => o.status === "delivered").length;
    return 0;
  };

  const visible = useMemo(() => {
    if (tab === "all") return orders;
    if (tab === "submitted") return orders.filter((o) => o.status === "payment_submitted");
    if (tab === "confirmed") return orders.filter((o) => o.status === "payment_confirmed");
    if (tab === "issue") return orders.filter((o) => o.status === "payment_issue");
    if (tab === "rejected") return orders.filter((o) => o.status === "rejected");
    if (tab === "delivered") return orders.filter((o) => o.status === "delivered");
    return orders;
  }, [orders, tab]);

  const selected = selectedId ? orders.find((o) => o.id === selectedId) ?? null : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Gestion des paiements</h2>
        <p className="mt-1 text-sm text-muted">
          Vérifiez les paiements soumis, approuvez ou rejetez, et livrez les codes.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1 text-xs">
        {TABS.map((t) => {
          const count = countFor(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                tab === t.id ? "bg-accent/15 font-medium text-white" : "text-muted hover:text-white"
              }`}
            >
              {t.label}
              {count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    tab === t.id ? "bg-accent/30 text-white" : "bg-surface2 text-faint"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loadError && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-100">
          {loadError}
        </div>
      )}

      <section className="card overflow-hidden">
        {!loaded ? (
          <p className="px-5 py-8 text-sm text-muted">Chargement...</p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted">
            Aucun paiement dans cette catégorie.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 font-medium">Commande</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Méthode</th>
                  <th className="px-4 py-3 font-medium">Montant</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Preuve</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((order) => (
                  <tr key={order.id} className="border-b border-border/60 hover:bg-surface/40">
                    <td className="px-4 py-3 font-mono text-xs text-white">
                      {order.id.slice(0, 12)}…
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white">{order.customerName}</p>
                      <p className="text-xs text-muted">{order.customerEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">
                      {formatMAD(order.totalMad)}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {order.proofUploaded ? (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-xs text-accent">
                          ✓
                        </span>
                      ) : (
                        <span className="text-xs text-faint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`chip ${orderStatusBadgeClass(order.status)}`}>
                        {orderStatusShort(order.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedId(order.id)}
                        className="text-xs font-medium text-accent hover:text-accent-hover"
                      >
                        {isDelivered(order.status) ? "Voir" : "Gérer"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <PaymentDrawer
          orderId={selected.id}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function PaymentDrawer({
  orderId,
  onClose,
  onChanged,
}: {
  orderId: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [order, setOrder] = useState<AdminOrderDTO | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proof, setProof] = useState<{ data: string; mimeType: string; fileName: string } | null | "loading">("loading");

  // Delivery state
  const [entries, setEntries] = useState<Record<string, AssignmentEntry[]>>({});
  const [available, setAvailable] = useState<Record<string, AdminCodeDTO[]>>({});

  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    setError("");
    getAdminOrderDetailAction(orderId)
      .then((detail) => {
        if (!cancelled) setOrder(detail);
      })
      .catch((err) => {
        console.error("Failed to load payment detail", err);
        if (!cancelled) setError("Impossible de charger le detail du paiement.");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const delivered = order ? isDelivered(order.status) : false;
  const canApprove = order ? order.status === "payment_submitted" || order.status === "payment_issue" || order.status === "pending_payment" : false;
  const canReject = order ? order.status !== "delivered" && order.status !== "rejected" : false;
  const canIssue = order ? order.status !== "delivered" && order.status !== "rejected" && order.status !== "payment_issue" : false;
  const canDeliver = order?.status === "payment_confirmed";

  useEffect(() => {
    if (!order) return;
    getPaymentProofAction(order.id).then((p) => setProof(p)).catch(() => setProof(null));

    // Initialize delivery entries
    const init: Record<string, AssignmentEntry[]> = {};
    for (const item of order.items) {
      init[item.id] = Array.from({ length: item.quantity }, () => ({}));
    }
    setEntries(init);

    if (canDeliver) {
      const slugs = [...new Set(order.items.map((i) => i.productId))];
      Promise.all(slugs.map((s) => getAvailableCodesAction(s))).then((lists) => {
        const map: Record<string, AdminCodeDTO[]> = {};
        slugs.forEach((s, i) => (map[s] = lists[i]));
        setAvailable(map);
      });
    }
  }, [order, canDeliver]);

  if (detailLoading) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-black/60" />
        <div className="relative h-full w-full max-w-lg border-l border-border-strong bg-base px-5 py-5 shadow-card">
          <p className="text-sm text-muted">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-black/60" />
        <div className="relative h-full w-full max-w-lg border-l border-border-strong bg-base px-5 py-5 shadow-card">
          <p className="text-sm text-red-400">{error || "Paiement introuvable."}</p>
          <button type="button" onClick={onClose} className="btn-ghost mt-4 h-9 px-3 text-xs">
            Fermer
          </button>
        </div>
      </div>
    );
  }

  const chosenIds = useMemo(() => {
    const set = new Set<string>();
    for (const arr of Object.values(entries)) {
      for (const e of arr) if (e.digitalCodeId) set.add(e.digitalCodeId);
    }
    return set;
  }, [entries]);

  const allFilled = order.items.every((item) =>
    (entries[item.id] ?? [])
      .slice(0, item.quantity)
      .every((e) => e.digitalCodeId || e.manualCode?.trim()),
  );

  function setEntry(itemId: string, index: number, entry: AssignmentEntry) {
    setEntries((prev) => {
      const arr = [...(prev[itemId] ?? [])];
      arr[index] = entry;
      return { ...prev, [itemId]: arr };
    });
  }

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError("");
    const res = await fn();
    if (!res.ok) setError(res.error ?? "Échec de l'opération.");
    await onChanged();
    setBusy(false);
  }

  async function handleDeliver() {
    if (!order) return;
    const assignments: ItemAssignment[] = order.items.map((item) => ({
      orderItemId: item.id,
      codes: entries[item.id] ?? [],
    }));
    await act(() => deliverOrderAction(order.id, assignments));
    // Reload available codes on failure
    if (error) {
      const slugs = [...new Set(order.items.map((i) => i.productId))];
      const lists = await Promise.all(slugs.map((s) => getAvailableCodesAction(s)));
      const map: Record<string, AdminCodeDTO[]> = {};
      slugs.forEach((s, i) => (map[s] = lists[i]));
      setAvailable(map);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative h-full w-full max-w-lg overflow-y-auto border-l border-border-strong bg-base shadow-card">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-base/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="font-mono text-xs text-muted">{order.id}</p>
            <h3 className="text-lg font-bold text-white">Gestion du paiement</h3>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost h-9 px-3 text-xs">
            Fermer
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          {/* Customer info */}
          <section className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Client" value={order.customerName} />
            <Field label="Email" value={order.customerEmail} />
            <Field label="Méthode" value={METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod} />
            <Field label="Total" value={formatMAD(order.totalMad)} />
            <Field label="Date" value={formatDate(order.createdAt)} />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-faint">Statut</p>
              <span className={`chip mt-1 ${orderStatusBadgeClass(order.status)}`}>
                {orderStatusShort(order.status)}
              </span>
            </div>
          </section>

          {/* Proof */}
          <section className="rounded-xl border border-border bg-surface p-4">
            <h4 className="text-sm font-semibold text-white">Preuve de paiement</h4>
            {proof === "loading" ? (
              <p className="mt-2 text-xs text-muted">Chargement...</p>
            ) : proof === null ? (
              <p className="mt-2 text-xs text-muted">Aucune preuve uploadée.</p>
            ) : proof.mimeType.startsWith("image/") ? (
              <div className="mt-3">
                <p className="mb-2 text-xs text-muted">{proof.fileName}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${proof.mimeType};base64,${proof.data}`}
                  alt="Preuve de paiement"
                  className="max-h-64 w-full rounded-lg object-contain border border-border"
                />
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-base text-xl">
                  📄
                </span>
                <div>
                  <p className="text-sm text-white">{proof.fileName}</p>
                  <a
                    href={`data:${proof.mimeType};base64,${proof.data}`}
                    download={proof.fileName}
                    className="text-xs text-accent hover:text-accent-hover"
                  >
                    Télécharger le PDF
                  </a>
                </div>
              </div>
            )}
          </section>

          {/* Action buttons */}
          {!delivered && (
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-white">Actions</h4>
              {error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {canApprove && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(() => approvePaymentAction(order.id))}
                    className="btn-primary h-9 px-4 text-sm disabled:opacity-50"
                  >
                    Approuver
                  </button>
                )}
                {canIssue && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(() => markPaymentIssueAction(order.id))}
                    className="h-9 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 text-sm text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    Problème
                  </button>
                )}
                {canReject && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(() => rejectPaymentAction(order.id))}
                    className="h-9 rounded-lg border border-red-500/50 bg-red-500/10 px-4 text-sm text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    Rejeter
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Delivery section — only when payment_confirmed */}
          {canDeliver && (
            <section className="space-y-4">
              <h4 className="text-sm font-semibold text-white">Livrer les codes</h4>
              {order.items.map((item) => {
                const stock = available[item.productId] ?? [];
                const arr = entries[item.id] ?? [];
                return (
                  <div key={item.id} className="rounded-xl border border-border bg-surface p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-white">{item.name}</p>
                      <span className="text-xs text-muted">
                        ×{item.quantity} · {stock.length} en stock
                      </span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {Array.from({ length: item.quantity }).map((_, i) => {
                        const entry = arr[i] ?? {};
                        return (
                          <div key={i} className="space-y-1.5">
                            <p className="text-[11px] uppercase tracking-wide text-faint">
                              Unité {i + 1}
                            </p>
                            <select
                              value={entry.digitalCodeId ?? ""}
                              onChange={(e) =>
                                setEntry(
                                  item.id,
                                  i,
                                  e.target.value ? { digitalCodeId: e.target.value } : {},
                                )
                              }
                              className="input h-10 py-0 text-sm"
                            >
                              <option value="">Choisir un code du stock…</option>
                              {stock.map((c) => (
                                <option
                                  key={c.id}
                                  value={c.id}
                                  disabled={chosenIds.has(c.id) && entry.digitalCodeId !== c.id}
                                >
                                  {c.code}
                                </option>
                              ))}
                            </select>
                            <input
                              value={entry.manualCode ?? ""}
                              onChange={(e) =>
                                setEntry(item.id, i, { manualCode: e.target.value })
                              }
                              placeholder="Ou saisir un code manuellement"
                              className="input h-10 py-0 font-mono text-sm"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {error}
                </p>
              )}
              <button
                type="button"
                disabled={!allFilled || busy}
                onClick={handleDeliver}
                className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Livraison en cours…" : "Livrer les codes"}
              </button>
            </section>
          )}

          {/* Delivered codes */}
          {delivered && (
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-white">Codes livrés</h4>
              {order.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-border bg-surface p-4">
                  <p className="mb-3 text-sm font-medium text-white">{item.name}</p>
                  <ul className="space-y-2">
                    {order.deliveredCodes
                      .filter((d) => d.productId === item.productId)
                      .map((d, i) => (
                        <li
                          key={`${d.code}-${i}`}
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white"
                        >
                          {d.code}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
                ✓ Livré. Le client peut maintenant voir son code.
              </div>
            </section>
          )}

          {/* Payment timeline */}
          <section className="rounded-xl border border-border bg-surface p-4">
            <h4 className="mb-3 text-sm font-semibold text-white">Historique</h4>
            {order.paymentEvents.length === 0 ? (
              <p className="text-xs text-muted">Aucun événement.</p>
            ) : (
              <ol className="space-y-3">
                {order.paymentEvents.map((ev) => (
                  <li key={ev.id} className="flex gap-3">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
                    <div>
                      <p className="text-xs text-white">
                        {ev.note ?? `${ev.fromStatus ?? "—"} → ${ev.toStatus ?? "—"}`}
                      </p>
                      <p className="text-[11px] text-faint">{formatDate(ev.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Simulated email logs */}
          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white">Emails simulés</h4>
              <span className="text-xs text-muted">
                {order.emailLogs.length} enregistrés · non envoyés
              </span>
            </div>
            {order.emailLogs.length === 0 ? (
              <p className="mt-2 text-xs text-muted">Aucun email.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {order.emailLogs.map((log) => (
                  <li
                    key={log.id}
                    className="rounded-lg border border-border bg-base px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          log.type === "code_delivered"
                            ? "bg-green-500/15 text-green-400"
                            : log.type === "payment_confirmed"
                              ? "bg-accent/15 text-accent"
                              : "bg-amber-500/15 text-amber-400"
                        }`}
                      >
                        {log.type}
                      </span>
                      <span className="text-[11px] text-faint">{formatDate(log.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 text-xs font-medium text-white">{log.subject}</p>
                    <p className="mt-0.5 text-xs text-muted">{log.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-white">{value}</p>
    </div>
  );
}
