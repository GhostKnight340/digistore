"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Download,
  ExternalLink,
  FileText,
  ScanLine,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import AdminButton from "@/components/admin/ui/AdminButton";
import Badge from "@/components/admin/ui/Badge";
import EmptyState from "@/components/admin/ui/EmptyState";
import Modal from "@/components/admin/ui/Modal";
import Segmented from "@/components/admin/ui/Segmented";
import Skeleton from "@/components/admin/ui/Skeleton";
import { useToast } from "@/components/admin/ui/Toast";
import {
  AdminInput,
  AdminTextarea,
  FieldLabel,
} from "@/components/admin/ui/AdminInput";
import { getAdminOrderDetailAction } from "@/app/actions/admin";
import {
  approvePaymentAction,
  getPaymentEmailPreviewAction,
  getPaymentProofAction,
  sendPaymentReviewEmailAction,
} from "@/app/actions/payments";
import {
  formatAdminMAD,
  orderStatusMeta,
  paymentMethodLabel,
  shortOrderRef,
  waitingSince,
} from "@/lib/adminStatus";
import { formatDate } from "@/lib/format";
import type {
  AdminOrderDTO,
  AdminOrderSummaryDTO,
  AdminPaymentProofDTO,
} from "@/lib/dto";

type QueueFilter = "payment_submitted" | "payment_issue" | "rejected";

const FILTER_OPTIONS: { value: QueueFilter; label: string }[] = [
  { value: "payment_submitted", label: "Submitted" },
  { value: "payment_issue", label: "Issues" },
  { value: "rejected", label: "Rejected" },
];

function proofHref(proof: AdminPaymentProofDTO) {
  if (proof.source === "url") return proof.data;
  return `data:${proof.mimeType};base64,${proof.data}`;
}

type ReviewEmailState = {
  intent: "reject" | "request_proof";
  title: string;
  confirmLabel: string;
  subject: string;
  text: string;
  reason: string;
};

export default function PaymentReviewScreen({
  orders,
}: {
  orders: AdminOrderSummaryDTO[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(orders);
  const [filter, setFilter] = useState<QueueFilter>("payment_submitted");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminOrderDTO | null>(null);
  const [proof, setProof] = useState<AdminPaymentProofDTO | null | "loading">("loading");
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [reviewEmail, setReviewEmail] = useState<ReviewEmailState | null>(null);

  const queue = useMemo(
    () =>
      rows
        .filter((order) => order.status === filter)
        .sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
    [rows, filter],
  );

  const selected = queue.find((order) => order.id === selectedId) ?? queue[0] ?? null;

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      setProof("loading");
      return;
    }
    let cancelled = false;
    setDetail(null);
    setProof("loading");
    setZoom(1);
    getAdminOrderDetailAction(selected.id)
      .then((fresh) => {
        if (!cancelled) setDetail(fresh);
      })
      .catch(() => undefined);
    getPaymentProofAction(selected.id)
      .then((result) => {
        if (!cancelled) setProof(result);
      })
      .catch(() => {
        if (!cancelled) setProof(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const advance = useCallback(
    (resolvedId: string, newStatus: string) => {
      setRows((current) =>
        current.map((order) =>
          order.id === resolvedId
            ? { ...order, status: newStatus as AdminOrderSummaryDTO["status"] }
            : order,
        ),
      );
      const remaining = queue.filter(
        (order) => order.id !== resolvedId && order.status === filter,
      );
      setSelectedId(remaining[0]?.id ?? null);
      router.refresh();
    },
    [queue, filter, router],
  );

  async function confirmSelected() {
    if (!selected) return;
    setBusy(true);
    const result = await approvePaymentAction(selected.id);
    setBusy(false);
    if (result.ok) {
      toast("success", `${shortOrderRef(selected.id)} confirmed — ready to fulfill`);
      advance(selected.id, "payment_confirmed");
    } else {
      toast("danger", "Couldn't confirm payment", result.error);
    }
  }

  async function openReviewEmail(
    intent: ReviewEmailState["intent"],
    title: string,
    confirmLabel: string,
  ) {
    if (!selected) return;
    setBusy(true);
    try {
      const preview = await getPaymentEmailPreviewAction(selected.id, intent);
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
    if (!reviewEmail || !selected) return;
    setBusy(true);
    const result = await sendPaymentReviewEmailAction(
      selected.id,
      reviewEmail.intent,
      { subject: reviewEmail.subject, text: reviewEmail.text },
      reviewEmail.reason,
    );
    setBusy(false);
    setReviewEmail(null);
    if (result.ok) {
      toast("success", "Email sent and status updated");
      advance(
        selected.id,
        reviewEmail.intent === "reject" ? "rejected" : "payment_issue",
      );
    } else {
      toast("danger", "Action failed", result.error);
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Queue */}
      <div className="flex w-[330px] shrink-0 flex-col border-r border-white/[0.06]">
        <div className="shrink-0 space-y-3 px-4 pb-3 pt-5">
          <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-text">
            Payment review
          </h1>
          <Segmented options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {queue.length === 0 ? (
            <EmptyState
              icon={<ScanLine className="h-5 w-5" strokeWidth={1.8} />}
              title="Queue is clear"
              description="No payments waiting in this filter."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {queue.map((order) => {
                const active = selected?.id === order.id;
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => setSelectedId(order.id)}
                    className={`rounded-card border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                      active
                        ? "border-accent/30 bg-accent/[0.07] ring-1 ring-inset ring-accent/20"
                        : "border-white/[0.06] bg-admin-surface hover:bg-admin-elevated/60"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12.5px] font-semibold text-text">
                        {shortOrderRef(order.id)}
                      </span>
                      <span className="ml-auto font-mono text-[11px] text-warning">
                        {waitingSince(order.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">
                      {order.customerName} · {order.items[0]?.name ?? "—"}
                      {order.items.length > 1 ? ` +${order.items.length - 1}` : ""}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge tone="neutral">{paymentMethodLabel(order.paymentMethod)}</Badge>
                      <span className="ml-auto font-mono text-[12.5px] text-text">
                        {formatAdminMAD(order.totalMad)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Proof viewer */}
      <div className="flex min-w-0 flex-1 flex-col bg-admin-canvas/40">
        {!selected ? (
          <div className="grid flex-1 place-items-center">
            <EmptyState
              icon={<ScanLine className="h-5 w-5" strokeWidth={1.8} />}
              title="Nothing selected"
              description="Pick an order from the queue to review its payment proof."
            />
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-5 py-3">
              <p className="font-mono text-[13px] font-semibold text-text">
                {shortOrderRef(selected.id)}
              </p>
              <Badge tone={orderStatusMeta(selected.status).tone} dot>
                {orderStatusMeta(selected.status).label}
              </Badge>
              <div className="ml-auto flex items-center gap-1.5">
                <AdminButton
                  size="sm"
                  onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
                  disabled={proof === "loading" || proof === null}
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-3.5 w-3.5" strokeWidth={1.8} />
                </AdminButton>
                <span className="w-11 text-center font-mono text-[11px] text-faint">
                  {Math.round(zoom * 100)}%
                </span>
                <AdminButton
                  size="sm"
                  onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
                  disabled={proof === "loading" || proof === null}
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-3.5 w-3.5" strokeWidth={1.8} />
                </AdminButton>
                {proof && proof !== "loading" ? (
                  <a
                    href={proofHref(proof)}
                    download={proof.fileName}
                    className="ml-1 inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-white/[0.08] bg-admin-input px-3 text-xs font-medium text-text hover:bg-admin-elevated"
                  >
                    <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
                    Download
                  </a>
                ) : null}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-6">
              {proof === "loading" ? (
                <Skeleton className="mx-auto h-full max-h-[480px] w-full max-w-xl" />
              ) : proof === null ? (
                <div className="grid h-full place-items-center">
                  <div className="grid h-48 w-full max-w-md place-items-center rounded-card border border-dashed border-white/10">
                    <p className="text-xs text-faint">Awaiting proof upload</p>
                  </div>
                </div>
              ) : proof.mimeType.startsWith("image/") ? (
                <div className="flex min-h-full items-start justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proofHref(proof)}
                    alt="Payment proof"
                    style={{ width: `${zoom * 100}%` }}
                    className="max-w-none rounded-lg border border-white/[0.08]"
                  />
                </div>
              ) : (
                <div className="grid h-full place-items-center">
                  <a
                    href={proofHref(proof)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2.5 rounded-card border border-white/[0.08] bg-admin-surface px-5 py-4 text-[13px] text-text hover:border-accent/30"
                  >
                    <FileText className="h-4 w-4 text-muted" strokeWidth={1.8} />
                    Open {proof.mimeType === "application/pdf" ? "PDF proof" : "proof file"}
                  </a>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Decision panel */}
      <div className="flex w-[352px] shrink-0 flex-col border-l border-white/[0.06]">
        {!selected ? null : (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <section>
                <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fainter">
                  Verify against
                </p>
                <div className="space-y-2 rounded-card border border-white/[0.06] bg-admin-surface p-3.5">
                  <Fact label="Expected amount" value={formatAdminMAD(selected.totalMad)} mono />
                  <Fact label="Method" value={paymentMethodLabel(selected.paymentMethod)} />
                  <Fact label="Customer" value={selected.customerName} />
                  <Fact label="Placed" value={formatDate(selected.createdAt)} />
                </div>
              </section>

              <section>
                <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fainter">
                  Items
                </p>
                <div className="space-y-1.5 rounded-card border border-white/[0.06] bg-admin-surface p-3.5">
                  {selected.items.map((item) => (
                    <div key={item.id} className="flex items-baseline gap-2 text-[12.5px]">
                      <span className="min-w-0 truncate text-text">{item.name}</span>
                      <span className="ml-auto shrink-0 font-mono text-faint">
                        ×{item.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fainter">
                  Audit trail
                </p>
                <div className="rounded-card border border-white/[0.06] bg-admin-surface p-3.5">
                  {!detail ? (
                    <div className="space-y-2">
                      <Skeleton className="h-3.5 w-full" />
                      <Skeleton className="h-3.5 w-3/4" />
                    </div>
                  ) : detail.paymentEvents.length === 0 ? (
                    <p className="text-xs text-faint">No events yet.</p>
                  ) : (
                    <ol className="space-y-2.5">
                      {[...detail.paymentEvents].reverse().map((event) => (
                        <li key={event.id} className="flex gap-2.5">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                          <div className="min-w-0">
                            <p className="text-[12px] leading-snug text-text">
                              {event.note ??
                                (event.toStatus
                                  ? orderStatusMeta(event.toStatus).label
                                  : event.type)}
                            </p>
                            <p className="font-mono text-[10.5px] text-faint">
                              {formatDate(event.createdAt)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </section>

              <Link
                href={`/admin/orders/${selected.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9FB8FF] hover:underline"
              >
                Open full order
                <ExternalLink className="h-3 w-3" strokeWidth={1.8} />
              </Link>
            </div>

            <div className="shrink-0 space-y-2 border-t border-white/[0.08] bg-admin-sidebar/85 p-4 backdrop-blur">
              {selected.status !== "rejected" ? (
                <AdminButton
                  variant="success"
                  className="w-full"
                  disabled={busy}
                  onClick={confirmSelected}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={2} />
                  Confirm → fulfill
                </AdminButton>
              ) : null}
              {selected.status !== "payment_issue" ? (
                <AdminButton
                  className="w-full"
                  disabled={busy}
                  onClick={() =>
                    openReviewEmail("request_proof", "Request a new proof", "Send request")
                  }
                >
                  Request new proof
                </AdminButton>
              ) : null}
              {selected.status !== "rejected" ? (
                <AdminButton
                  variant="danger"
                  className="w-full"
                  disabled={busy}
                  onClick={() => openReviewEmail("reject", "Reject payment", "Send & reject")}
                >
                  Reject
                </AdminButton>
              ) : null}
            </div>
          </>
        )}
      </div>

      {reviewEmail && selected ? (
        <Modal
          wide
          title={reviewEmail.title}
          description={`${shortOrderRef(selected.id)} · edit this email if needed — changes apply to this send only.`}
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
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-faint">{label}</span>
      <span
        className={`min-w-0 truncate text-right text-[12.5px] text-text ${mono ? "font-mono font-semibold" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
