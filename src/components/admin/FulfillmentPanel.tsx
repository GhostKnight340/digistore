"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMAD, formatDate } from "@/lib/format";
import {
  orderStatusShort,
  orderStatusBadgeClass,
  isDelivered,
} from "@/lib/orderStatus";
import {
  getAdminOrdersAction,
  getAvailableCodesAction,
  confirmPaymentAction,
  deliverOrderAction,
} from "@/app/actions/admin";
import type {
  AdminOrderDTO,
  AdminCodeDTO,
  AssignmentEntry,
  ItemAssignment,
} from "@/lib/dto";

type Filter = "todo" | "all";

export default function FulfillmentPanel() {
  const [orders, setOrders] = useState<AdminOrderDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dbError, setDbError] = useState(false);
  const [filter, setFilter] = useState<Filter>("todo");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDbError(false);
    try {
      const data = await getAdminOrdersAction();
      setOrders(data);
    } catch {
      setDbError(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleOrders = useMemo(
    () =>
      filter === "all"
        ? orders
        : orders.filter((o) => o.status !== "delivered"),
    [orders, filter],
  );
  const todoCount = orders.filter((o) => o.status !== "delivered").length;
  const selected = selectedId
    ? orders.find((o) => o.id === selectedId) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Manual fulfillment</h2>
          <p className="mt-1 text-sm text-muted">
            Review payments, assign codes from the database, and deliver orders.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1 text-xs">
          <button
            type="button"
            onClick={() => setFilter("todo")}
            className={`rounded-md px-3 py-1.5 ${
              filter === "todo" ? "bg-accent/15 text-white" : "text-muted"
            }`}
          >
            To process ({todoCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-md px-3 py-1.5 ${
              filter === "all" ? "bg-accent/15 text-white" : "text-muted"
            }`}
          >
            All ({orders.length})
          </button>
        </div>
      </div>

      <section className="card overflow-hidden">
        {!loaded ? (
          <p className="px-5 py-8 text-sm text-muted">Loading...</p>
        ) : dbError ? (
          <p className="px-5 py-8 text-sm text-red-400">
            Connexion à la base de données impossible. Vérifiez DATABASE_URL.
          </p>
        ) : visibleOrders.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted">
            {filter === "todo"
              ? "No pending orders. Everything is delivered."
              : "No orders yet. Place a test order to see it here."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr className="border-b border-border">
                  <th className="px-5 py-3 font-medium">Order</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Total</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr key={order.id} className="border-b border-border/60">
                    <td className="px-5 py-3 font-mono text-xs text-white">
                      {order.id}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {order.customerEmail}
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
                      <button
                        type="button"
                        onClick={() => setSelectedId(order.id)}
                        className="text-xs font-medium text-accent hover:text-accent-hover"
                      >
                        {isDelivered(order.status) ? "View" : "Fulfill"}
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
        <OrderDrawer
          order={selected}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function OrderDrawer({
  order,
  onClose,
  onChanged,
}: {
  order: AdminOrderDTO;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  // Per-item entries: orderItemId -> array (length = quantity).
  const [entries, setEntries] = useState<Record<string, AssignmentEntry[]>>({});
  const [available, setAvailable] = useState<Record<string, AdminCodeDTO[]>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const delivered = isDelivered(order.status);
  const paymentConfirmed =
    order.status === "payment_confirmed" || delivered;

  // Initialize per-unit entries and load available codes when the order opens.
  useEffect(() => {
    const init: Record<string, AssignmentEntry[]> = {};
    for (const item of order.items) {
      init[item.id] = Array.from({ length: item.quantity }, () => ({}));
    }
    setEntries(init);
    setError("");

    const slugs = [...new Set(order.items.map((i) => i.productId))];
    Promise.all(slugs.map((s) => getAvailableCodesAction(s))).then((lists) => {
      const map: Record<string, AdminCodeDTO[]> = {};
      slugs.forEach((s, i) => (map[s] = lists[i]));
      setAvailable(map);
    });
  }, [order.id, order.items]);

  function setEntry(itemId: string, index: number, entry: AssignmentEntry) {
    setEntries((prev) => {
      const arr = [...(prev[itemId] ?? [])];
      arr[index] = entry;
      return { ...prev, [itemId]: arr };
    });
  }

  // Inventory code ids already chosen in this form (avoid double-assigning).
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

  async function handleConfirmPayment() {
    setBusy(true);
    setError("");
    const res = await confirmPaymentAction(order.id);
    if (!res.ok) setError(res.error ?? "Failed to confirm payment.");
    await onChanged();
    setBusy(false);
  }

  async function handleDeliver() {
    setError("");
    if (!paymentConfirmed) {
      setError("Confirm the payment before delivering.");
      return;
    }
    const assignments: ItemAssignment[] = order.items.map((item) => ({
      orderItemId: item.id,
      codes: entries[item.id] ?? [],
    }));
    setBusy(true);
    const res = await deliverOrderAction(order.id, assignments);
    if (!res.ok) {
      setError(res.error ?? "Delivery failed.");
      // Reload available codes in case stock changed underneath us.
      const slugs = [...new Set(order.items.map((i) => i.productId))];
      const lists = await Promise.all(
        slugs.map((s) => getAvailableCodesAction(s)),
      );
      const map: Record<string, AdminCodeDTO[]> = {};
      slugs.forEach((s, i) => (map[s] = lists[i]));
      setAvailable(map);
    }
    await onChanged();
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative h-full w-full max-w-lg overflow-y-auto border-l border-border-strong bg-base shadow-card">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-base/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="font-mono text-xs text-muted">{order.id}</p>
            <h3 className="text-lg font-bold text-white">Order fulfillment</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost h-9 px-3 text-xs"
          >
            Close
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          <section className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Customer" value={order.customerName} />
            <Field label="Email" value={order.customerEmail} />
            <Field label="Date" value={formatDate(order.createdAt)} />
            <Field label="Total" value={formatMAD(order.totalMad)} />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-faint">
                Status
              </p>
              <span
                className={`chip mt-1 ${orderStatusBadgeClass(order.status)}`}
              >
                {orderStatusShort(order.status)}
              </span>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-white">Payment</h4>
                <p className="mt-0.5 text-xs text-muted">
                  {paymentConfirmed
                    ? "Confirmed."
                    : "Awaiting manual confirmation."}
                </p>
              </div>
              {paymentConfirmed ? (
                <span className="chip border-green-500/40 text-green-400">
                  ✓ Confirmed
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleConfirmPayment}
                  className="btn-primary h-9 px-4 text-xs disabled:opacity-50"
                >
                  Confirm payment
                </button>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h4 className="text-sm font-semibold text-white">Assign codes</h4>
            {order.items.map((item) => {
              const stock = available[item.productId] ?? [];
              const arr = entries[item.id] ?? [];
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-border bg-surface p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white">
                      {item.name}
                    </p>
                    <span className="text-xs text-muted">
                      ×{item.quantity} · {stock.length} in stock
                    </span>
                  </div>

                  {delivered ? (
                    <ul className="mt-3 space-y-2">
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
                  ) : (
                    <div className="mt-3 space-y-3">
                      {Array.from({ length: item.quantity }).map((_, i) => {
                        const entry = arr[i] ?? {};
                        return (
                          <div key={i} className="space-y-1.5">
                            <p className="text-[11px] uppercase tracking-wide text-faint">
                              Unit {i + 1}
                            </p>
                            <select
                              value={entry.digitalCodeId ?? ""}
                              onChange={(e) =>
                                setEntry(
                                  item.id,
                                  i,
                                  e.target.value
                                    ? { digitalCodeId: e.target.value }
                                    : {},
                                )
                              }
                              className="input h-10 py-0 text-sm"
                            >
                              <option value="">
                                Choisir un code du stock…
                              </option>
                              {stock.map((c) => (
                                <option
                                  key={c.id}
                                  value={c.id}
                                  disabled={
                                    chosenIds.has(c.id) &&
                                    entry.digitalCodeId !== c.id
                                  }
                                >
                                  {c.code}
                                </option>
                              ))}
                            </select>
                            <input
                              value={entry.manualCode ?? ""}
                              onChange={(e) =>
                                setEntry(item.id, i, {
                                  manualCode: e.target.value,
                                })
                              }
                              placeholder="Ou saisir un code manuellement"
                              className="input h-10 py-0 font-mono text-sm"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {!delivered && (
            <section className="space-y-3">
              {error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={handleDeliver}
                disabled={!paymentConfirmed || !allFilled || busy}
                className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Working…" : "Confirm and deliver"}
              </button>
              {!paymentConfirmed && (
                <p className="text-center text-xs text-muted">
                  Confirm the payment first.
                </p>
              )}
            </section>
          )}

          {delivered && (
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
              ✓ Delivered. The customer can now reveal the code.
            </div>
          )}

          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white">
                Simulated emails
              </h4>
              <span className="text-xs text-muted">
                {order.emailLogs.length} logged · none actually sent
              </span>
            </div>
            {order.emailLogs.length === 0 ? (
              <p className="mt-2 text-xs text-muted">No emails yet.</p>
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
                      <span className="text-[11px] text-faint">
                        {formatDate(log.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted">
                      To: <span className="text-white">{log.recipient}</span>
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-white">
                      {log.subject}
                    </p>
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
