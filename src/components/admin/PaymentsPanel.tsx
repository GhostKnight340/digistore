"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMAD, formatDate } from "@/lib/format";
import { orderStatusShort, orderStatusBadgeClass, isDelivered } from "@/lib/orderStatus";
import { getAdminPaymentOrdersAction } from "@/app/actions/admin";
import { useAutoRefresh } from "@/lib/useAutoRefresh";
import type { AdminOrderSummaryDTO } from "@/lib/dto";

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

  // Live updates: refresh the payment queue after confirm/reject happens
  // elsewhere or on another device, without a manual reload.
  useAutoRefresh(load);

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Gestion des paiements</h2>
        <p className="mt-1 text-sm text-muted">
          Vérifiez les paiements soumis, approuvez ou rejetez, et livrez les codes.
        </p>
      </div>

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
                      {order.id.slice(0, 12)}...
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
                          Oui
                        </span>
                      ) : (
                        <span className="text-xs text-faint">Aucun</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`chip ${orderStatusBadgeClass(order.status)}`}>
                        {orderStatusShort(order.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="text-xs font-medium text-accent hover:text-accent-hover"
                      >
                        {isDelivered(order.status) ? "Voir" : "Gérer"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
