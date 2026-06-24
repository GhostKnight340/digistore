"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore, type CodeAssignments } from "@/context/StoreContext";
import { formatMAD, formatDate } from "@/lib/format";
import {
  orderStatusShort,
  orderStatusBadgeClass,
  isDelivered,
} from "@/lib/orderStatus";
import type { Order } from "@/lib/types";

type Filter = "todo" | "all";

export default function FulfillmentPanel() {
  const { orders, ready } = useStore();
  const [filter, setFilter] = useState<Filter>("todo");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visibleOrders = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((o) => o.status !== "delivered");
  }, [orders, filter]);

  const todoCount = useMemo(
    () => orders.filter((o) => o.status !== "delivered").length,
    [orders],
  );

  const selected = selectedId
    ? orders.find((o) => o.id === selectedId) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Manual fulfillment</h2>
          <p className="mt-1 text-sm text-muted">
            Review payments, assign codes, and deliver orders manually.
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
        {!ready ? (
          <p className="px-5 py-8 text-sm text-muted">Loading...</p>
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
                    <td className="px-5 py-3 text-muted">{order.email}</td>
                    <td className="px-5 py-3 text-muted">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-white">
                      {formatMAD(order.total)}
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
        />
      )}
    </div>
  );
}

function OrderDrawer({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const {
    confirmPayment,
    deliverOrder,
    getAvailableCodes,
    emailLogsForOrder,
  } = useStore();

  // Per-item code inputs: productId -> array of length `quantity`.
  const [inputs, setInputs] = useState<CodeAssignments>({});
  const [error, setError] = useState("");

  // Initialize the inputs whenever a different order opens.
  useEffect(() => {
    const initial: CodeAssignments = {};
    for (const item of order.items) {
      const existing = item.codes ?? [];
      initial[item.productId] = Array.from(
        { length: item.quantity },
        (_, i) => existing[i] ?? "",
      );
    }
    setInputs(initial);
    setError("");
  }, [order.id, order.items]);

  const delivered = isDelivered(order.status);
  const paymentConfirmed =
    order.status === "payment_confirmed" || delivered;

  const logs = emailLogsForOrder(order.id);

  function setCode(productId: string, index: number, value: string) {
    setInputs((prev) => {
      const arr = [...(prev[productId] ?? [])];
      arr[index] = value;
      return { ...prev, [productId]: arr };
    });
  }

  // Codes already chosen in this form (to avoid double-assigning stock codes).
  const chosen = useMemo(() => {
    const set = new Set<string>();
    for (const arr of Object.values(inputs)) {
      for (const v of arr) if (v.trim()) set.add(v.trim());
    }
    return set;
  }, [inputs]);

  const allFilled = order.items.every((item) =>
    (inputs[item.productId] ?? [])
      .slice(0, item.quantity)
      .every((c) => c.trim().length > 0),
  );

  function handleDeliver() {
    setError("");
    if (!paymentConfirmed) {
      setError("Confirm the payment before delivering.");
      return;
    }
    const ok = deliverOrder(order.id, inputs);
    if (!ok) {
      setError("Please assign a code to every unit before delivering.");
      return;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* backdrop */}
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
          {/* Meta */}
          <section className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Customer" value={order.fullName} />
            <Field label="Email" value={order.email} />
            <Field label="Date" value={formatDate(order.createdAt)} />
            <Field label="Total" value={formatMAD(order.total)} />
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

          {/* Payment */}
          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-white">Payment</h4>
                <p className="mt-0.5 text-xs text-muted">
                  {paymentConfirmed
                    ? `Confirmed${
                        order.paymentConfirmedAt
                          ? ` · ${formatDate(order.paymentConfirmedAt)}`
                          : ""
                      }`
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
                  onClick={() => confirmPayment(order.id)}
                  className="btn-primary h-9 px-4 text-xs"
                >
                  Confirm payment
                </button>
              )}
            </div>
          </section>

          {/* Code assignment */}
          <section className="space-y-4">
            <h4 className="text-sm font-semibold text-white">Assign codes</h4>
            {order.items.map((item) => {
              const available = getAvailableCodes(item.productId);
              const arr = inputs[item.productId] ?? [];
              return (
                <div
                  key={item.productId}
                  className="rounded-xl border border-border bg-surface p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white">
                      {item.name}
                    </p>
                    <span className="text-xs text-muted">
                      ×{item.quantity} · {available.length} in stock
                    </span>
                  </div>

                  {delivered ? (
                    <ul className="mt-3 space-y-2">
                      {item.codes.map((code, i) => (
                        <li
                          key={`${code}-${i}`}
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white"
                        >
                          {code}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {Array.from({ length: item.quantity }).map((_, i) => (
                        <div key={i} className="space-y-1.5">
                          <p className="text-[11px] uppercase tracking-wide text-faint">
                            Unit {i + 1}
                          </p>
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value)
                                setCode(item.productId, i, e.target.value);
                            }}
                            className="input h-10 py-0 text-sm"
                          >
                            <option value="">
                              Choisir un code du stock…
                            </option>
                            {available.map((c) => (
                              <option
                                key={c.id}
                                value={c.code}
                                disabled={
                                  chosen.has(c.code) && arr[i] !== c.code
                                }
                              >
                                {c.code}
                                {chosen.has(c.code) && arr[i] !== c.code
                                  ? " (used in form)"
                                  : ""}
                              </option>
                            ))}
                          </select>
                          <input
                            value={arr[i] ?? ""}
                            onChange={(e) =>
                              setCode(item.productId, i, e.target.value)
                            }
                            placeholder="Ou saisir un code manuellement"
                            className="input h-10 py-0 font-mono text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {/* Deliver action */}
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
                disabled={!paymentConfirmed || !allFilled}
                className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirm and deliver
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
              ✓ Delivered
              {order.deliveredAt ? ` · ${formatDate(order.deliveredAt)}` : ""}.
              The customer can now reveal the code.
            </div>
          )}

          {/* Simulated email log */}
          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white">
                Simulated emails
              </h4>
              <span className="text-xs text-muted">
                {logs.length} logged · none actually sent
              </span>
            </div>
            {logs.length === 0 ? (
              <p className="mt-2 text-xs text-muted">No emails yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {logs.map((log) => (
                  <li
                    key={log.id}
                    className="rounded-lg border border-border bg-base px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          log.type === "code_delivered"
                            ? "bg-green-500/15 text-green-400"
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
