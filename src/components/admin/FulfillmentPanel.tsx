"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMAD, formatDate } from "@/lib/format";
import { DEV_ONLY_ORDER_TOOLS_ENABLED } from "@/lib/devMode";
import {
  orderStatusShort,
  orderStatusBadgeClass,
  isDelivered,
} from "@/lib/orderStatus";
import { getAdminFulfillmentOrdersAction } from "@/app/actions/admin";
import type { AdminOrderSummaryDTO } from "@/lib/dto";

const DevOrderListTools =
  DEV_ONLY_ORDER_TOOLS_ENABLED
    ? dynamic(() => import("@/components/admin/DevOrderListTools"))
    : null;
const DevOrderRowDelete =
  DEV_ONLY_ORDER_TOOLS_ENABLED
    ? dynamic(() =>
        import("@/components/admin/DevOrderListTools").then((mod) => mod.DevOrderRowDelete),
      )
    : null;

type Filter = "all" | "pending" | "awaiting" | "ready" | "delivered" | "refunded";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Toutes les commandes" },
  { id: "pending", label: "En attente de paiement" },
  { id: "awaiting", label: "En attente de confirmation" },
  { id: "ready", label: "Prêtes à livrer" },
  { id: "delivered", label: "Livrées" },
  { id: "refunded", label: "Remboursées" },
];

const LOAD_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(
        () => reject(new Error(`${label} took too long to respond.`)),
        LOAD_TIMEOUT_MS,
      );
    }),
  ]);
}

export default function FulfillmentPanel() {
  const [orders, setOrders] = useState<AdminOrderSummaryDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoadError("");
    setLoaded(false);
    try {
      const data = await withTimeout(getAdminFulfillmentOrdersAction(), "Orders");
      setOrders(data);
    } catch (error) {
      console.error("Failed to load fulfillment orders", error);
      setLoadError("Impossible d'actualiser les commandes. Les dernières données chargées restent affichées.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleOrders = useMemo(() => {
    if (filter === "pending") return orders.filter((order) => order.status === "pending_payment");
    if (filter === "awaiting") return orders.filter((order) => order.status === "payment_submitted" || order.status === "payment_issue");
    if (filter === "ready") return orders.filter((order) => order.status === "payment_confirmed");
    if (filter === "delivered") return orders.filter((order) => order.status === "delivered");
    if (filter === "refunded") return orders.filter((order) => order.status === "refunded");
    return orders;
  }, [orders, filter]);

  const countFor = (id: Filter) => {
    if (id === "pending") return orders.filter((order) => order.status === "pending_payment").length;
    if (id === "awaiting") return orders.filter((order) => order.status === "payment_submitted" || order.status === "payment_issue").length;
    if (id === "ready") return orders.filter((order) => order.status === "payment_confirmed").length;
    if (id === "delivered") return orders.filter((order) => order.status === "delivered").length;
    if (id === "refunded") return orders.filter((order) => order.status === "refunded").length;
    return orders.length;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Commandes</h2>
          <p className="mt-1 text-sm text-muted">
            Vérifiez chaque commande, ouvrez le détail, attribuez les codes et livrez les produits.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DevOrderListTools ? (
            <DevOrderListTools
              onSuccess={async (successMessage) => {
                setMessage(successMessage);
                setLoadError("");
                await load();
              }}
              onError={(errorMessage) => {
                setLoadError(errorMessage);
                setMessage("");
              }}
            />
          ) : null}
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1 text-xs">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`rounded-md px-3 py-1.5 ${
                  filter === item.id ? "bg-accent/15 text-white" : "text-muted hover:text-white"
                }`}
              >
                {item.label} ({countFor(item.id)})
              </button>
            ))}
          </div>
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-green-500/40 bg-green-500/10 px-5 py-4 text-sm text-green-200">
          {message}
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-100">
          {loadError}
        </div>
      ) : null}

      <section className="card overflow-hidden">
        {!loaded ? (
          <p className="px-5 py-8 text-sm text-muted">Chargement...</p>
        ) : visibleOrders.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted">
            Aucune commande ne correspond à ce filtre.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr className="border-b border-border">
                  <th className="px-5 py-3 font-medium">Commande</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Total</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr key={order.id} className="border-b border-border/60">
                    <td className="px-5 py-3 font-mono text-xs text-white">
                      {order.id}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-white">{order.customerName}</p>
                      <p className="text-xs text-muted">{order.customerEmail}</p>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-white">
                      {formatMAD(order.totalMad)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`chip ${orderStatusBadgeClass(order.status)}`}
                      >
                        {orderStatusShort(order.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="text-xs font-medium text-accent hover:text-accent-hover"
                        >
                          {isDelivered(order.status) ? "Voir" : "Traiter"}
                        </Link>
                        {DevOrderRowDelete ? (
                          <DevOrderRowDelete
                            orderId={order.id}
                            onSuccess={async (successMessage) => {
                              setMessage(successMessage);
                              setLoadError("");
                              await load();
                            }}
                            onError={(errorMessage) => {
                              setLoadError(errorMessage);
                              setMessage("");
                            }}
                          />
                        ) : null}
                      </div>
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
