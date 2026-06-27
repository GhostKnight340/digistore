"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMAD, formatDate } from "@/lib/format";
import {
  isDelivered,
  orderStatusBadgeClass,
  orderStatusShort,
} from "@/lib/orderStatus";
import {
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
import type {
  AdminCodeDTO,
  AdminOrderDTO,
  AdminPaymentProofDTO,
  AssignmentEntry,
  ItemAssignment,
} from "@/lib/dto";

const METHOD_LABELS: Record<string, string> = {
  bank: "Bank transfer",
  usdt: "USDT",
  paypal: "PayPal",
  card: "Card",
  test: "Test",
};

function orderNumber(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 1000000;
  }
  return `#${String(hash).padStart(6, "0")}`;
}

function formatBytes(value: number | null) {
  if (value == null) return "Not available";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function proofHref(proof: AdminPaymentProofDTO) {
  if (proof.source === "url") return proof.data;
  return `data:${proof.mimeType};base64,${proof.data}`;
}

function eventDate(order: AdminOrderDTO, toStatus: string) {
  return order.paymentEvents.find((event) => event.toStatus === toStatus)?.createdAt ?? null;
}

function eventNote(order: AdminOrderDTO, toStatus: string) {
  return order.paymentEvents.find((event) => event.toStatus === toStatus)?.note ?? null;
}

export default function OrderDetailPage({
  initialOrder,
}: {
  initialOrder: AdminOrderDTO;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [proof, setProof] = useState<AdminPaymentProofDTO | null | "loading">("loading");
  const [entries, setEntries] = useState<Record<string, AssignmentEntry[]>>({});
  const [available, setAvailable] = useState<Record<string, AdminCodeDTO[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const delivered = isDelivered(order.status);
  const canApprove =
    order.status === "payment_submitted" ||
    order.status === "payment_issue" ||
    order.status === "pending_payment";
  const canReject =
    order.status !== "delivered" &&
    order.status !== "rejected" &&
    order.status !== "cancelled";
  const canIssue =
    order.status !== "delivered" &&
    order.status !== "rejected" &&
    order.status !== "payment_issue" &&
    order.status !== "cancelled";
  const canDeliver = order.status === "payment_confirmed";
  const submittedAt = eventDate(order, "payment_submitted");
  const confirmedAt = eventDate(order, "payment_confirmed");
  const issueReason =
    eventNote(order, "payment_issue") ??
    eventNote(order, "rejected") ??
    null;

  const refreshOrder = useCallback(async () => {
    const fresh = await getAdminOrderDetailAction(order.id);
    if (fresh) setOrder(fresh);
  }, [order.id]);

  useEffect(() => {
    setProof("loading");
    getPaymentProofAction(order.id)
      .then((result) => setProof(result))
      .catch((loadError) => {
        console.error("Failed to load proof", loadError);
        setProof(null);
      });
  }, [order.id]);

  useEffect(() => {
    const init: Record<string, AssignmentEntry[]> = {};
    for (const item of order.items) {
      init[item.id] = Array.from({ length: item.quantity }, () => ({}));
    }
    setEntries(init);

    if (!canDeliver) {
      setAvailable({});
      return;
    }

    const productIds = [...new Set(order.items.map((item) => item.productId))];
    Promise.all(productIds.map((productId) => getAvailableCodesAction(productId)))
      .then((lists) => {
        const map: Record<string, AdminCodeDTO[]> = {};
        productIds.forEach((productId, index) => {
          map[productId] = lists[index];
        });
        setAvailable(map);
      })
      .catch((loadError) => {
        console.error("Failed to load available codes", loadError);
        setAvailable({});
      });
  }, [canDeliver, order]);

  const chosenIds = useMemo(() => {
    const ids = new Set<string>();
    for (const list of Object.values(entries)) {
      for (const entry of list) {
        if (entry.digitalCodeId) ids.add(entry.digitalCodeId);
      }
    }
    return ids;
  }, [entries]);

  const allFilled = order.items.every((item) =>
    (entries[item.id] ?? [])
      .slice(0, item.quantity)
      .every((entry) => entry.digitalCodeId || entry.manualCode?.trim()),
  );

  function setEntry(itemId: string, index: number, entry: AssignmentEntry) {
    setEntries((previous) => {
      const list = [...(previous[itemId] ?? [])];
      list[index] = entry;
      return { ...previous, [itemId]: list };
    });
  }

  async function runAction(
    label: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    const result = await action();
    if (result.ok) {
      setMessage(label);
      await refreshOrder();
    } else {
      setError(result.error ?? "Action failed.");
    }
    setBusy(false);
  }

  async function handleDeliver() {
    const assignments: ItemAssignment[] = order.items.map((item) => ({
      orderItemId: item.id,
      codes: entries[item.id] ?? [],
    }));
    await runAction("Order delivered.", () => deliverOrderAction(order.id, assignments));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Admin order detail</p>
          <h1 className="mt-1 text-3xl font-bold text-white">
            Order {orderNumber(order.id)}
          </h1>
          <p className="mt-1 font-mono text-xs text-muted">{order.id}</p>
        </div>
        <span className={`chip ${orderStatusBadgeClass(order.status)}`}>
          {orderStatusShort(order.status)}
        </span>
      </div>

      {message ? (
        <div className="rounded-2xl border border-green-500/40 bg-green-500/10 px-5 py-4 text-sm text-green-200">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-4">
        <SummaryCard label="Customer" value={order.customerName} detail={order.customerEmail} />
        <SummaryCard label="Date" value={formatDate(order.createdAt)} />
        <SummaryCard label="Total" value={formatMAD(order.totalMad)} />
        <SummaryCard
          label="Fulfillment"
          value={delivered ? "Delivered" : canDeliver ? "Ready to deliver" : "Pending"}
          detail={METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="card overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-bold text-white">Ordered items</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted">
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 font-medium">Product</th>
                    <th className="px-5 py-3 font-medium">Qty</th>
                    <th className="px-5 py-3 font-medium">Unit price</th>
                    <th className="px-5 py-3 font-medium">Total</th>
                    <th className="px-5 py-3 font-medium">Assigned code</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => {
                    const codes = order.deliveredCodes.filter(
                      (code) => code.orderItemId === item.id || code.productId === item.productId,
                    );
                    return (
                      <tr key={item.id} className="border-b border-border/60">
                        <td className="px-5 py-3 text-white">{item.name}</td>
                        <td className="px-5 py-3 text-muted">{item.quantity}</td>
                        <td className="px-5 py-3 text-muted">{formatMAD(item.unitPriceMad)}</td>
                        <td className="px-5 py-3 text-white">
                          {formatMAD(item.unitPriceMad * item.quantity)}
                        </td>
                        <td className="px-5 py-3">
                          {codes.length === 0 ? (
                            <span className="text-xs text-faint">Not assigned</span>
                          ) : (
                            <div className="space-y-1">
                              {codes.map((code, index) => (
                                <div
                                  key={`${code.code}-${index}`}
                                  className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 font-mono text-xs text-white"
                                >
                                  {code.code}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <PaymentProofSection proof={proof} />

          {canDeliver || delivered ? (
            <DeliverySection
              order={order}
              delivered={delivered}
              available={available}
              entries={entries}
              chosenIds={chosenIds}
              busy={busy}
              allFilled={allFilled}
              onSetEntry={setEntry}
              onDeliver={handleDeliver}
            />
          ) : null}

          <TimelineSection order={order} />
        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="font-bold text-white">Payment</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <InfoRow label="Method" value={METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod} />
              <InfoRow label="Status" value={orderStatusShort(order.status)} />
              <InfoRow label="Submitted" value={submittedAt ? formatDate(submittedAt) : "Not submitted"} />
              <InfoRow label="Confirmed" value={confirmedAt ? formatDate(confirmedAt) : "Not confirmed"} />
              {issueReason ? <InfoRow label="Reason" value={issueReason} /> : null}
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="font-bold text-white">Actions</h2>
            <div className="mt-4 space-y-2">
              {canApprove ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    runAction("Payment confirmed.", () => approvePaymentAction(order.id))
                  }
                  className="btn-primary w-full justify-center disabled:opacity-50"
                >
                  Confirm payment
                </button>
              ) : null}
              {canIssue ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    runAction("Payment issue marked.", () => markPaymentIssueAction(order.id))
                  }
                  className="w-full rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                >
                  Mark payment issue
                </button>
              ) : null}
              {canReject ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    runAction("Order rejected.", () => rejectPaymentAction(order.id))
                  }
                  className="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                >
                  Reject order
                </button>
              ) : null}
              {canDeliver ? (
                <a href="#assign-codes" className="btn-ghost block w-full text-center">
                  Assign/deliver codes
                </a>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-muted">
              Cancel and internal notes are not configured in the current order workflow.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 break-words text-lg font-bold text-white">{value}</p>
      {detail ? <p className="mt-1 break-words text-xs text-muted">{detail}</p> : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 break-words text-white">{value}</dd>
    </div>
  );
}

function PaymentProofSection({
  proof,
}: {
  proof: AdminPaymentProofDTO | null | "loading";
}) {
  const href = proof && proof !== "loading" ? proofHref(proof) : "";
  const isImage = proof && proof !== "loading" && proof.mimeType.startsWith("image/");
  const isPdf = proof && proof !== "loading" && proof.mimeType === "application/pdf";

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-bold text-white">Payment proof</h2>
      </div>
      <div className="px-5 py-5">
        {proof === "loading" ? (
          <p className="text-sm text-muted">Loading proof...</p>
        ) : proof === null ? (
          <p className="text-sm text-muted">Aucun justificatif téléchargé.</p>
        ) : (
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <InfoRow label="File name" value={proof.fileName} />
              <InfoRow label="Uploaded" value={formatDate(proof.uploadedAt)} />
              <InfoRow label="File type" value={proof.mimeType} />
              <InfoRow label="File size" value={formatBytes(proof.sizeBytes)} />
            </dl>

            {isImage ? (
              <div className="rounded-xl border border-border bg-surface p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={href}
                  alt="Payment proof"
                  className="max-h-[620px] w-full rounded-lg object-contain"
                />
              </div>
            ) : null}

            {isPdf ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="btn-primary inline-flex"
              >
                Open PDF proof
              </a>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <a href={href} target="_blank" rel="noreferrer" className="btn-ghost">
                Open proof in new tab
              </a>
              <a href={href} download={proof.fileName} className="btn-ghost">
                Download proof
              </a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function DeliverySection({
  order,
  delivered,
  available,
  entries,
  chosenIds,
  busy,
  allFilled,
  onSetEntry,
  onDeliver,
}: {
  order: AdminOrderDTO;
  delivered: boolean;
  available: Record<string, AdminCodeDTO[]>;
  entries: Record<string, AssignmentEntry[]>;
  chosenIds: Set<string>;
  busy: boolean;
  allFilled: boolean;
  onSetEntry: (itemId: string, index: number, entry: AssignmentEntry) => void;
  onDeliver: () => Promise<void>;
}) {
  return (
    <section id="assign-codes" className="card overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-bold text-white">Assign and deliver codes</h2>
      </div>
      <div className="space-y-4 px-5 py-5">
        {order.items.map((item) => {
          const stock = available[item.productId] ?? [];
          const list = entries[item.id] ?? [];
          const deliveredCodes = order.deliveredCodes.filter(
            (code) => code.orderItemId === item.id || code.productId === item.productId,
          );

          return (
            <div key={item.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-white">{item.name}</p>
                <span className="text-xs text-muted">
                  {item.quantity} unit{item.quantity === 1 ? "" : "s"} · {stock.length} available
                </span>
              </div>

              {delivered ? (
                <div className="mt-3 space-y-2">
                  {deliveredCodes.map((code, index) => (
                    <div
                      key={`${code.code}-${index}`}
                      className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white"
                    >
                      {code.code}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {Array.from({ length: item.quantity }).map((_, index) => {
                    const entry = list[index] ?? {};
                    return (
                      <div key={index} className="grid gap-2 md:grid-cols-2">
                        <select
                          value={entry.digitalCodeId ?? ""}
                          onChange={(event) =>
                            onSetEntry(
                              item.id,
                              index,
                              event.target.value ? { digitalCodeId: event.target.value } : {},
                            )
                          }
                          className="input h-10 py-0 text-sm"
                        >
                          <option value="">Choose a stock code...</option>
                          {stock.map((code) => (
                            <option
                              key={code.id}
                              value={code.id}
                              disabled={
                                chosenIds.has(code.id) && entry.digitalCodeId !== code.id
                              }
                            >
                              {code.code}
                            </option>
                          ))}
                        </select>
                        <input
                          value={entry.manualCode ?? ""}
                          onChange={(event) =>
                            onSetEntry(item.id, index, { manualCode: event.target.value })
                          }
                          placeholder="Or enter a manual code"
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

        {!delivered ? (
          <button
            type="button"
            disabled={!allFilled || busy}
            onClick={onDeliver}
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Delivering..." : "Deliver codes"}
          </button>
        ) : (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
            Delivered. The customer can see the assigned code.
          </div>
        )}
      </div>
    </section>
  );
}

function TimelineSection({ order }: { order: AdminOrderDTO }) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-bold text-white">Timeline</h2>
      </div>
      <div className="px-5 py-5">
        {order.paymentEvents.length === 0 ? (
          <p className="text-sm text-muted">No events yet.</p>
        ) : (
          <ol className="space-y-4">
            {order.paymentEvents.map((event) => (
              <li key={event.id} className="flex gap-3">
                <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />
                <div>
                  <p className="text-sm text-white">
                    {event.note ??
                      `${event.fromStatus ?? "Start"} to ${event.toStatus ?? event.type}`}
                  </p>
                  <p className="mt-1 text-xs text-muted">{formatDate(event.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
