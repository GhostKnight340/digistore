"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Check,
  Download,
  ExternalLink,
  FileText,
  Mail,
} from "lucide-react";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import AdminButton from "@/components/admin/ui/AdminButton";
import AdminCard from "@/components/admin/ui/AdminCard";
import Badge from "@/components/admin/ui/Badge";
import StatusBadge from "@/components/admin/ui/StatusBadge";
import Modal from "@/components/admin/ui/Modal";
import Skeleton from "@/components/admin/ui/Skeleton";
import { useToast } from "@/components/admin/ui/Toast";
import {
  AdminSelect,
  AdminTextarea,
  AdminInput,
  FieldLabel,
} from "@/components/admin/ui/AdminInput";
import {
  changeOrderStatusAction,
  getAdminOrderDetailAction,
  getAvailableCodesAction,
  deliverOrderAction,
} from "@/app/actions/admin";
import {
  approvePaymentAction,
  getPaymentEmailPreviewAction,
  sendPaymentReviewEmailAction,
  getPaymentProofAction,
} from "@/app/actions/payments";
import {
  EMAIL_STATUS_META,
  formatAdminMAD,
  orderStatusMeta,
  paymentMethodLabel,
  shortOrderRef,
  waitingSince,
} from "@/lib/adminStatus";
import { formatDate } from "@/lib/format";
import { isDelivered } from "@/lib/orderStatus";
import type {
  AdminCodeDTO,
  AdminOrderDTO,
  AdminPaymentProofDTO,
  AssignmentEntry,
  ItemAssignment,
} from "@/lib/dto";
import type { OrderStatus } from "@/lib/types";

const OrderDetailDeleteTools = dynamic(
  () => import("@/components/admin/orders/DevOrderDetailTools"),
);

const STATUS_OPTIONS: OrderStatus[] = [
  "pending_payment",
  "payment_submitted",
  "payment_confirmed",
  "payment_issue",
  "rejected",
  "refunded",
  "cancelled",
];

function proofHref(proof: AdminPaymentProofDTO) {
  if (proof.source === "url") return proof.data;
  return `data:${proof.mimeType};base64,${proof.data}`;
}

function formatBytes(value: number | null) {
  if (value == null) return "n/a";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function eventDate(order: AdminOrderDTO, toStatus: string) {
  return order.paymentEvents.find((event) => event.toStatus === toStatus)?.createdAt ?? null;
}

type ReviewEmailState = {
  intent: "reject" | "request_proof" | "refund_update";
  title: string;
  confirmLabel: string;
  subject: string;
  text: string;
  reason: string;
};

export default function OrderDetailScreen({ initialOrder }: { initialOrder: AdminOrderDTO }) {
  const { settings } = useStoreSettings();
  const toast = useToast();
  const [order, setOrder] = useState(initialOrder);
  const [proof, setProof] = useState<AdminPaymentProofDTO | null | "loading">("loading");
  const [entries, setEntries] = useState<Record<string, AssignmentEntry[]>>({});
  const [available, setAvailable] = useState<Record<string, AdminCodeDTO[]>>({});
  const [busy, setBusy] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<OrderStatus>(initialOrder.status);
  const [statusNote, setStatusNote] = useState("");
  const [reviewEmail, setReviewEmail] = useState<ReviewEmailState | null>(null);
  const manualMode = settings.inventoryMode === "manual";

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

  const refreshOrder = useCallback(async () => {
    const fresh = await getAdminOrderDetailAction(order.id);
    if (fresh) setOrder(fresh);
  }, [order.id]);

  useEffect(() => {
    setProof("loading");
    getPaymentProofAction(order.id)
      .then((result) => setProof(result))
      .catch(() => setProof(null));
  }, [order.id]);

  useEffect(() => {
    const init: Record<string, AssignmentEntry[]> = {};
    for (const item of order.items) {
      init[item.id] = Array.from({ length: item.quantity }, () => ({}));
    }
    setEntries(init);

    if (!canDeliver || manualMode) {
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
      .catch(() => setAvailable({}));
  }, [canDeliver, manualMode, order]);

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

  const manualCountsValid = order.items.every((item) => {
    const codes = (entries[item.id] ?? [])
      .slice(0, item.quantity)
      .map((entry) => entry.manualCode?.trim() ?? "")
      .filter(Boolean);
    return codes.length === item.quantity;
  });

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
    const result = await action();
    if (result.ok) {
      toast("success", label);
      await refreshOrder();
    } else {
      toast("danger", "Action failed", result.error ?? "Please try again.");
    }
    setBusy(false);
  }

  async function openReviewEmail(
    intent: ReviewEmailState["intent"],
    title: string,
    confirmLabel: string,
  ) {
    setBusy(true);
    try {
      const preview = await getPaymentEmailPreviewAction(order.id, intent);
      setReviewEmail({
        intent,
        title,
        confirmLabel,
        subject: preview.subject,
        text: preview.text,
        reason: "",
      });
    } catch (error) {
      toast(
        "danger",
        "Couldn't load email preview",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendReviewEmail() {
    if (!reviewEmail) return;
    await runAction("Email sent and status updated", () =>
      sendPaymentReviewEmailAction(
        order.id,
        reviewEmail.intent,
        { subject: reviewEmail.subject, text: reviewEmail.text },
        reviewEmail.reason,
      ),
    );
    setReviewEmail(null);
  }

  async function handleDeliver() {
    if (manualMode && !manualCountsValid) {
      toast("warning", "Enter exactly one code per unit before delivering.");
      return;
    }
    const assignments: ItemAssignment[] = order.items.map((item) => ({
      orderItemId: item.id,
      codes: entries[item.id] ?? [],
    }));
    await runAction("Order delivered — codes emailed to the customer", () =>
      deliverOrderAction(order.id, assignments),
    );
  }

  async function handleStatusChange() {
    if (nextStatus === order.status) {
      toast("warning", "Choose a status different from the current one.");
      return;
    }
    await runAction("Order status updated", () =>
      changeOrderStatusAction(order.id, nextStatus, statusNote),
    );
    setStatusModalOpen(false);
    setStatusNote("");
  }

  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header strip */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/[0.06] bg-admin-app/80 px-7 py-3.5 backdrop-blur">
        <Link
          href="/admin/orders"
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-admin-input text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          aria-label="Back to orders"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="font-mono text-[17px] font-semibold tracking-[-0.01em] text-text">
              {shortOrderRef(order.id)}
            </h1>
            <StatusBadge status={order.status} />
            {order.status === "payment_submitted" && submittedAt ? (
              <span className="font-mono text-xs text-warning">
                waiting {waitingSince(submittedAt)}
              </span>
            ) : null}
          </div>
          <p className="font-mono text-[10.5px] text-fainter">{order.id}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canReject ? (
            <AdminButton
              variant="danger"
              disabled={busy}
              onClick={() => openReviewEmail("reject", "Reject payment", "Send & reject")}
            >
              Reject
            </AdminButton>
          ) : null}
          {canIssue ? (
            <AdminButton
              disabled={busy}
              onClick={() =>
                openReviewEmail("request_proof", "Request a new proof", "Send request")
              }
            >
              Request new proof
            </AdminButton>
          ) : null}
          {canApprove ? (
            <AdminButton
              variant="success"
              disabled={busy}
              onClick={() =>
                runAction("Payment confirmed — ready to fulfill", () =>
                  approvePaymentAction(order.id),
                )
              }
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2} />
              Confirm payment
            </AdminButton>
          ) : null}
          <AdminButton
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setNextStatus(order.status === "delivered" ? "payment_confirmed" : order.status);
              setStatusModalOpen(true);
            }}
          >
            Change status
          </AdminButton>
        </div>
      </div>

      {/* Split body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-5">
        <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_372px]">
          <div className="flex min-w-0 flex-col gap-3.5">
            {/* Items */}
            <AdminCard title="Items" padded={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {["Product", "Qty", "Unit price", "Total"].map((label, index) => (
                        <th
                          key={label}
                          className={`px-[18px] py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fainter ${
                            index >= 2 ? "text-right" : ""
                          }`}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.id} className="border-b border-white/[0.04]">
                        <td className="px-[18px] py-3 text-[13px] font-medium text-text">
                          {item.name}
                        </td>
                        <td className="px-[18px] py-3 font-mono text-[13px] text-muted">
                          {item.quantity}
                        </td>
                        <td className="px-[18px] py-3 text-right font-mono text-[13px] text-muted">
                          {formatAdminMAD(item.unitPriceMad)}
                        </td>
                        <td className="px-[18px] py-3 text-right font-mono text-[13px] text-text">
                          {formatAdminMAD(item.unitPriceMad * item.quantity)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-admin-sidebar">
                      <td className="px-[18px] py-3 text-[13px] font-semibold text-text">
                        Total
                      </td>
                      <td className="px-[18px] py-3 font-mono text-[13px] text-muted">
                        {totalItems}
                      </td>
                      <td />
                      <td className="px-[18px] py-3 text-right font-mono text-[13.5px] font-semibold text-text">
                        {formatAdminMAD(order.totalMad)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </AdminCard>

            {/* Payment + proof */}
            <div className="grid gap-3.5 lg:grid-cols-2">
              <AdminCard title="Payment">
                <dl className="space-y-2.5">
                  <FactRow label="Method" value={paymentMethodLabel(order.paymentMethod)} />
                  <FactRow label="Expected amount" value={formatAdminMAD(order.totalMad)} mono />
                  <FactRow
                    label="Submitted"
                    value={submittedAt ? formatDate(submittedAt) : "Not submitted"}
                  />
                  <FactRow
                    label="Confirmed"
                    value={confirmedAt ? formatDate(confirmedAt) : "Not confirmed"}
                  />
                </dl>
              </AdminCard>

              <AdminCard title="Payment proof">
                {proof === "loading" ? (
                  <div className="space-y-2">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-3.5 w-2/3" />
                  </div>
                ) : proof === null ? (
                  <div className="grid h-28 place-items-center rounded-[10px] border border-dashed border-white/10 bg-admin-input/50">
                    <p className="text-xs text-faint">Awaiting proof</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {proof.mimeType.startsWith("image/") ? (
                      <a
                        href={proofHref(proof)}
                        target="_blank"
                        rel="noreferrer"
                        className="group relative block overflow-hidden rounded-[10px] border border-white/[0.08] bg-admin-input"
                        title="View full size"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={proofHref(proof)}
                          alt="Payment proof"
                          className="max-h-56 w-full object-contain"
                        />
                        <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
                            View full
                          </span>
                        </span>
                      </a>
                    ) : (
                      <a
                        href={proofHref(proof)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2.5 rounded-[10px] border border-white/[0.08] bg-admin-input px-3.5 py-3 text-[13px] text-text hover:border-accent/30"
                      >
                        <FileText className="h-4 w-4 text-muted" strokeWidth={1.8} />
                        Open {proof.mimeType === "application/pdf" ? "PDF" : "file"}
                      </a>
                    )}
                    <div className="flex items-center gap-3 text-[11.5px] text-faint">
                      <span className="truncate font-mono">{proof.fileName}</span>
                      <span>·</span>
                      <span className="font-mono">{formatBytes(proof.sizeBytes)}</span>
                      <a
                        href={proofHref(proof)}
                        download={proof.fileName}
                        className="ml-auto inline-flex items-center gap-1 text-muted hover:text-text"
                      >
                        <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
                        Download
                      </a>
                    </div>
                  </div>
                )}
              </AdminCard>
            </div>

            {/* Code delivery */}
            {canDeliver || delivered ? (
              <AdminCard
                title="Code delivery"
                actions={
                  delivered ? (
                    <Badge tone="success" dot>
                      Delivered
                    </Badge>
                  ) : null
                }
              >
                <div className="space-y-3.5">
                  {order.items.map((item) => {
                    const stock = available[item.productId] ?? [];
                    const list = entries[item.id] ?? [];
                    const deliveredCodes = order.deliveredCodes.filter(
                      (code) =>
                        code.orderItemId === item.id || code.productId === item.productId,
                    );
                    return (
                      <div
                        key={item.id}
                        className="rounded-[11px] border border-white/[0.06] bg-admin-input/60 p-3.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[13px] font-medium text-text">{item.name}</p>
                          <span className="font-mono text-[11.5px] text-faint">
                            {item.quantity} unit{item.quantity === 1 ? "" : "s"}
                            {!delivered && !manualMode
                              ? ` · ${stock.length} in stock`
                              : ""}
                          </span>
                        </div>

                        {delivered ? (
                          <div className="mt-3 space-y-1.5">
                            {deliveredCodes.map((code, index) => (
                              <div
                                key={`${code.code}-${index}`}
                                className="rounded-lg border border-success/[0.28] bg-success/[0.07] px-3 py-2 font-mono text-[13px] text-success-fg"
                              >
                                {code.code}
                              </div>
                            ))}
                          </div>
                        ) : manualMode ? (
                          <div className="mt-3">
                            <FieldLabel>Paste one code per line</FieldLabel>
                            <AdminTextarea
                              value={(entries[item.id] ?? [])
                                .slice(0, item.quantity)
                                .map((entry) => entry.manualCode ?? "")
                                .join("\n")}
                              onChange={(event) => {
                                const lines = event.target.value
                                  .split(/\r?\n/)
                                  .map((line) => line.trim())
                                  .filter(Boolean)
                                  .slice(0, item.quantity);
                                for (let index = 0; index < item.quantity; index += 1) {
                                  setEntry(
                                    item.id,
                                    index,
                                    lines[index] ? { manualCode: lines[index] } : {},
                                  );
                                }
                              }}
                              rows={Math.max(3, item.quantity + 1)}
                              placeholder={Array.from({ length: item.quantity }, (_, index) =>
                                index === 0 ? "AAAA-BBBB-CCCC" : "DDDD-EEEE-FFFF",
                              ).join("\n")}
                              className="font-mono"
                            />
                            <p className="mt-1.5 font-mono text-[11px] text-faint">
                              {
                                (entries[item.id] ?? [])
                                  .slice(0, item.quantity)
                                  .filter((entry) => entry.manualCode?.trim()).length
                              }{" "}
                              / {item.quantity} entered
                            </p>
                          </div>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {Array.from({ length: item.quantity }).map((_, index) => {
                              const entry = list[index] ?? {};
                              return (
                                <div key={index} className="grid gap-2 md:grid-cols-2">
                                  <AdminSelect
                                    value={entry.digitalCodeId ?? ""}
                                    onChange={(event) =>
                                      setEntry(
                                        item.id,
                                        index,
                                        event.target.value
                                          ? { digitalCodeId: event.target.value }
                                          : {},
                                      )
                                    }
                                    className="font-mono text-[12.5px]"
                                  >
                                    <option value="">Pick a code from stock…</option>
                                    {stock.map((code) => (
                                      <option
                                        key={code.id}
                                        value={code.id}
                                        disabled={
                                          chosenIds.has(code.id) &&
                                          entry.digitalCodeId !== code.id
                                        }
                                      >
                                        {code.code}
                                      </option>
                                    ))}
                                  </AdminSelect>
                                  <AdminInput
                                    value={entry.manualCode ?? ""}
                                    onChange={(event) =>
                                      setEntry(item.id, index, {
                                        manualCode: event.target.value,
                                      })
                                    }
                                    placeholder="…or type a code manually"
                                    className="font-mono text-[12.5px]"
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
                    <div className="flex items-center gap-3 border-t border-white/[0.06] pt-3.5">
                      <p className="text-xs text-faint">
                        {manualMode
                          ? "Manual entry — stock is neither reserved nor consumed."
                          : "Delivery emails the codes and marks stock as used."}
                      </p>
                      <AdminButton
                        variant="primary"
                        className="ml-auto"
                        disabled={(manualMode ? !manualCountsValid : !allFilled) || busy}
                        onClick={handleDeliver}
                      >
                        {busy ? "Delivering…" : "Deliver order & send email"}
                      </AdminButton>
                    </div>
                  ) : null}
                </div>
              </AdminCard>
            ) : null}
          </div>

          {/* Right rail */}
          <div className="flex min-w-0 flex-col gap-3.5">
            <AdminCard title="Customer">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-admin-elevated font-mono text-xs font-semibold text-muted ring-1 ring-inset ring-white/[0.08]">
                  {order.customerName
                    .split(/\s+/)
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase() || "?"}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-text">
                    {order.customerName}
                  </p>
                  <p className="truncate text-xs text-faint">{order.customerEmail}</p>
                </div>
              </div>
              <dl className="mt-3.5 space-y-2.5 border-t border-white/[0.06] pt-3.5">
                <FactRow label="Order placed" value={formatDate(order.createdAt)} />
                <FactRow label="Public reference" value={order.publicOrderNumber} mono />
              </dl>
            </AdminCard>

            <AdminCard title="Timeline">
              {order.paymentEvents.length === 0 ? (
                <p className="text-xs text-faint">No events yet.</p>
              ) : (
                <ol className="relative space-y-0">
                  {[...order.paymentEvents].reverse().map((event, index, all) => {
                    const tone = orderStatusMeta(event.toStatus ?? "").tone;
                    const dotClass =
                      tone === "success"
                        ? "bg-success-fg"
                        : tone === "warning"
                          ? "bg-warning"
                          : tone === "danger"
                            ? "bg-danger"
                            : "bg-accent";
                    return (
                      <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                        {index < all.length - 1 ? (
                          <span className="absolute left-[3.5px] top-3 h-full w-[1.5px] bg-white/[0.07]" />
                        ) : null}
                        <span
                          className={`relative mt-1 h-2 w-2 shrink-0 rounded-full ${dotClass}`}
                        />
                        <div className="min-w-0">
                          <p className="text-[12.5px] leading-snug text-text">
                            {event.note ??
                              (event.toStatus
                                ? orderStatusMeta(event.toStatus).label
                                : event.type)}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-faint">
                            {formatDate(event.createdAt)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </AdminCard>

            <AdminCard title="Emails sent">
              {order.emailLogs.length === 0 ? (
                <p className="text-xs text-faint">No emails logged for this order.</p>
              ) : (
                <div className="space-y-1">
                  {order.emailLogs.map((log) => {
                    const meta = EMAIL_STATUS_META[log.status] ?? {
                      label: log.status,
                      tone: "neutral" as const,
                    };
                    return (
                      <details key={log.id} className="group rounded-lg">
                        <summary className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
                          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" strokeWidth={1.8} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-medium text-text">
                              {log.subject}
                            </span>
                            <span className="block font-mono text-[11px] text-faint">
                              {formatDate(log.createdAt)}
                            </span>
                          </span>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </summary>
                        <div className="mx-2 mb-2 rounded-lg border border-white/[0.06] bg-admin-input/60 p-3">
                          <p className="font-mono text-[11px] text-faint">
                            to {log.recipient} · {log.templateKey ?? log.type}
                          </p>
                          {log.errorMessage ? (
                            <p className="mt-2 rounded-md border border-danger/[0.28] bg-danger/10 px-2 py-1.5 text-[11.5px] text-danger">
                              {log.errorMessage}
                            </p>
                          ) : null}
                          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted">
                            {log.text || log.body}
                          </pre>
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </AdminCard>

            <AdminCard title="Danger zone" tone="danger">
              <OrderDetailDeleteTools
                orderId={order.id}
                onError={(message) => toast("danger", "Action failed", message)}
              />
            </AdminCard>
          </div>
        </div>
      </div>

      {/* Review email modal (reject / request proof) */}
      {reviewEmail ? (
        <Modal
          wide
          title={reviewEmail.title}
          description="Edit this email if needed — changes apply to this send only."
          onClose={() => setReviewEmail(null)}
        >
          <div className="space-y-3.5">
            <div>
              <FieldLabel>Subject</FieldLabel>
              <AdminInput
                value={reviewEmail.subject}
                onChange={(event) =>
                  setReviewEmail((current) =>
                    current ? { ...current, subject: event.target.value } : current,
                  )
                }
              />
            </div>
            <div>
              <FieldLabel>Internal / customer reason (optional)</FieldLabel>
              <AdminInput
                value={reviewEmail.reason}
                onChange={(event) =>
                  setReviewEmail((current) =>
                    current ? { ...current, reason: event.target.value } : current,
                  )
                }
                placeholder="Optional"
              />
            </div>
            <div>
              <FieldLabel>Message</FieldLabel>
              <AdminTextarea
                rows={9}
                value={reviewEmail.text}
                onChange={(event) =>
                  setReviewEmail((current) =>
                    current ? { ...current, text: event.target.value } : current,
                  )
                }
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <AdminButton size="sm" onClick={() => setReviewEmail(null)}>
                Cancel
              </AdminButton>
              <AdminButton
                variant={reviewEmail.intent === "reject" ? "danger" : "primary"}
                size="sm"
                disabled={busy || !reviewEmail.subject.trim() || !reviewEmail.text.trim()}
                onClick={sendReviewEmail}
              >
                {busy ? "Sending…" : reviewEmail.confirmLabel}
              </AdminButton>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* Change status modal */}
      {statusModalOpen ? (
        <Modal
          title="Change status"
          description={`Current status: ${orderStatusMeta(order.status).label}. An audit event records the change; no email is sent automatically.`}
          onClose={() => setStatusModalOpen(false)}
        >
          <div className="space-y-3.5">
            <div>
              <FieldLabel>New status</FieldLabel>
              <AdminSelect
                value={nextStatus}
                onChange={(event) => setNextStatus(event.target.value as OrderStatus)}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {orderStatusMeta(status).label}
                  </option>
                ))}
              </AdminSelect>
            </div>
            <div>
              <FieldLabel>Admin note (optional)</FieldLabel>
              <AdminTextarea
                rows={3}
                value={statusNote}
                onChange={(event) => setStatusNote(event.target.value)}
                placeholder="Reason for the change…"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <AdminButton size="sm" onClick={() => setStatusModalOpen(false)}>
                Cancel
              </AdminButton>
              <AdminButton
                variant="primary"
                size="sm"
                disabled={busy || nextStatus === order.status}
                onClick={handleStatusChange}
              >
                {busy ? "Applying…" : "Apply change"}
              </AdminButton>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function FactRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-faint">{label}</dt>
      <dd
        className={`min-w-0 truncate text-right text-[12.5px] text-text ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
