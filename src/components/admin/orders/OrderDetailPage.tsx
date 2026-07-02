"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { formatMAD, formatDate } from "@/lib/format";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import {
  isDelivered,
  orderStatusLabel,
  orderStatusBadgeClass,
  orderStatusShort,
} from "@/lib/orderStatus";
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
import type {
  AdminCodeDTO,
  AdminOrderDTO,
  AdminPaymentProofDTO,
  AssignmentEntry,
  ItemAssignment,
  PaymentEventDTO,
  EmailLogDTO,
} from "@/lib/dto";
import type { OrderStatus } from "@/lib/types";

const OrderDetailDeleteTools = dynamic(() =>
  import("@/components/admin/orders/DevOrderDetailTools"),
);

const METHOD_LABELS: Record<string, string> = {
  bank: "Virement bancaire",
  usdt: "USDT",
  paypal: "PayPal",
  card: "Carte bancaire",
  test: "Test",
};

const STATUS_OPTIONS: OrderStatus[] = [
  "pending_payment",
  "payment_submitted",
  "payment_confirmed",
  "payment_issue",
  "rejected",
  "refunded",
  "cancelled",
];

// Design tokens (admin surface is slightly darker than the storefront).
const PANEL = "rounded-[14px] border border-white/[0.07] bg-[#0f1015]";

function orderNumber(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 1000000;
  }
  return `#${String(hash).padStart(6, "0")}`;
}

function formatBytes(value: number | null) {
  if (value == null) return "Non disponible";
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

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function waitingLabel(fromIso: string, now: number) {
  const minutes = Math.max(0, Math.round((now - new Date(fromIso).getTime()) / 60000));
  if (minutes < 60) return `en attente ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `en attente ${hours} h`;
  const days = Math.floor(hours / 24);
  return `en attente ${days} j`;
}

export default function OrderDetailPage({
  initialOrder,
}: {
  initialOrder: AdminOrderDTO;
}) {
  const { settings } = useStoreSettings();
  const [order, setOrder] = useState(initialOrder);
  const [proof, setProof] = useState<AdminPaymentProofDTO | null | "loading">("loading");
  const [entries, setEntries] = useState<Record<string, AssignmentEntry[]>>({});
  const [available, setAvailable] = useState<Record<string, AdminCodeDTO[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<OrderStatus>(initialOrder.status);
  const [statusNote, setStatusNote] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const [reviewEmail, setReviewEmail] = useState<{
    intent: "reject" | "request_proof" | "refund_update";
    title: string;
    subject: string;
    text: string;
    reason: string;
  } | null>(null);
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
  const issueReason =
    eventNote(order, "payment_issue") ??
    eventNote(order, "rejected") ??
    null;

  const refreshOrder = useCallback(async () => {
    const fresh = await getAdminOrderDetailAction(order.id);
    if (fresh) setOrder(fresh);
  }, [order.id]);

  useEffect(() => {
    setNow(Date.now());
  }, [order]);

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
      .catch((loadError) => {
        console.error("Failed to load available codes", loadError);
        setAvailable({});
      });
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

  const totalUnits = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const readyUnits = order.items.reduce(
    (sum, item) =>
      sum +
      (entries[item.id] ?? [])
        .slice(0, item.quantity)
        .filter((entry) => entry.digitalCodeId || entry.manualCode?.trim()).length,
    0,
  );
  const deliverReady = canDeliver && (manualMode ? manualCountsValid : allFilled);

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
      setError(result.error ?? "Action impossible.");
    }
    setBusy(false);
  }

  async function openReviewEmail(
    intent: "reject" | "request_proof" | "refund_update",
    title: string,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const preview = await getPaymentEmailPreviewAction(order.id, intent);
      setReviewEmail({
        intent,
        title,
        subject: preview.subject,
        text: preview.text,
        reason: "",
      });
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Aperçu email impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function sendReviewEmail() {
    if (!reviewEmail) return;
    await runAction("Email envoyé et statut mis à jour.", () =>
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
      setError("Saisissez exactement un code par unité avant la livraison.");
      return;
    }
    if (!window.confirm("Livrer ces codes au client maintenant ?")) return;
    const assignments: ItemAssignment[] = order.items.map((item) => ({
      orderItemId: item.id,
      codes: entries[item.id] ?? [],
    }));
    await runAction("Commande livrée.", () => deliverOrderAction(order.id, assignments));
  }

  async function handleStatusChange() {
    if (nextStatus === order.status) {
      setError("Choisissez un statut différent du statut actuel.");
      return;
    }
    const confirmed = window.confirm(
      `Confirmer le changement de statut de "${orderStatusShort(order.status)}" vers "${orderStatusShort(nextStatus)}" ? Un événement d'audit sera ajouté.`,
    );
    if (!confirmed) return;

    await runAction("Statut de commande mis à jour.", () =>
      changeOrderStatusAction(order.id, nextStatus, statusNote),
    );
    setStatusModalOpen(false);
    setStatusNote("");
  }

  const waitFrom = submittedAt ?? order.createdAt;
  const showWaiting = now !== null && !delivered && order.status !== "rejected" && order.status !== "cancelled";

  return (
    <div className="space-y-4">
      {/* ── Order header strip ── */}
      <div className={`${PANEL} flex flex-wrap items-center gap-4 px-4 py-3.5 sm:px-6`}>
        <Link
          href="/admin"
          aria-label="Retour à l'administration"
          className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-[9px] border border-white/10 bg-[#121319] text-muted transition hover:text-white"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-xl font-semibold tracking-[-0.01em] text-white">
              {orderNumber(order.id)}
            </h1>
            <span className={`rounded-md border px-2 py-0.5 text-[11.5px] font-semibold ${orderStatusBadgeClass(order.status)}`}>
              {orderStatusShort(order.status)}
            </span>
          </div>
          <p className="mt-0.5 text-[12.5px] text-faint">
            Passée le {formatDate(order.createdAt)}
            {showWaiting ? ` · ${waitingLabel(waitFrom, now!)}` : ""}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          {canReject ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => openReviewEmail("reject", "Refuser le paiement")}
              className="flex h-[38px] items-center gap-1.5 rounded-[9px] border border-[#e05c5c]/30 bg-[#e05c5c]/[0.08] px-4 text-[13px] font-semibold text-[#e05c5c] transition hover:bg-[#e05c5c]/[0.16] disabled:opacity-50"
            >
              Refuser le paiement
            </button>
          ) : null}
          {canIssue ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => openReviewEmail("request_proof", "Demander un nouveau justificatif")}
              className="h-[38px] rounded-[9px] border border-white/[0.12] bg-[#121319] px-4 text-[13px] font-medium text-white transition hover:border-white/25 disabled:opacity-50"
            >
              Demander un justificatif
            </button>
          ) : null}
          {canApprove ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction("Paiement confirmé.", () => approvePaymentAction(order.id))}
              className="flex h-[38px] items-center gap-1.5 rounded-[9px] bg-[#2ea067] px-[18px] text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(46,160,103,0.3)] transition hover:bg-[#2eae70] disabled:opacity-50"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Confirmer le paiement
            </button>
          ) : null}
        </div>
      </div>

      {message ? (
        <div className="rounded-[14px] border border-[#2ea067]/40 bg-[#2ea067]/10 px-4 py-3 text-sm text-[#5bc98c]">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-[14px] border border-[#e05c5c]/40 bg-[#e05c5c]/10 px-4 py-3 text-sm text-[#f0a5a5]">
          {error}
        </div>
      ) : null}

      {/* ── Split layout: work area + context rail ── */}
      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_372px]">
        {/* Left: fulfillment work area */}
        <div className="flex min-w-0 flex-col gap-[18px]">
          <ItemsPanel order={order} />

          <div className="grid gap-[18px] md:grid-cols-2">
            <PaymentPanel order={order} submittedAt={submittedAt} confirmedAt={confirmedAt} issueReason={issueReason} />
            <PaymentProofPanel proof={proof} />
          </div>

          <CodeDeliveryPanel
            order={order}
            delivered={delivered}
            canDeliver={canDeliver}
            manualMode={manualMode}
            available={available}
            entries={entries}
            chosenIds={chosenIds}
            busy={busy}
            totalUnits={totalUnits}
            readyUnits={readyUnits}
            deliverReady={deliverReady}
            onSetEntry={setEntry}
            onDeliver={handleDeliver}
          />
        </div>

        {/* Right: context rail */}
        <aside className="flex flex-col gap-[18px]">
          <CustomerPanel order={order} />
          <OrderSummaryPanel order={order} />
          <TimelinePanel events={order.paymentEvents} />
          <EmailsPanel logs={order.emailLogs} />
          <QuickActionsPanel
            busy={busy}
            order={order}
            onChangeStatus={() => {
              setNextStatus(order.status === "delivered" ? "payment_confirmed" : order.status);
              setStatusModalOpen(true);
            }}
            onError={(errorMessage) => setError(errorMessage)}
          />
        </aside>
      </div>

      {reviewEmail ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-8">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">{reviewEmail.title}</h2>
                <p className="mt-1 text-sm text-muted">
                  Modifiez cet email si nécessaire. Les changements s'appliquent uniquement à cet envoi.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewEmail(null)}
                className="text-sm text-muted hover:text-white"
              >
                Fermer
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block text-sm">
                <span className="mb-2 block text-xs uppercase tracking-wide text-muted">
                  Sujet
                </span>
                <input
                  value={reviewEmail.subject}
                  onChange={(event) =>
                    setReviewEmail((current) =>
                      current ? { ...current, subject: event.target.value } : current,
                    )
                  }
                  className="input h-11 py-0"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-2 block text-xs uppercase tracking-wide text-muted">
                  Raison interne / client
                </span>
                <input
                  value={reviewEmail.reason}
                  onChange={(event) =>
                    setReviewEmail((current) =>
                      current ? { ...current, reason: event.target.value } : current,
                    )
                  }
                  className="input h-11 py-0"
                  placeholder="Optionnel"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-2 block text-xs uppercase tracking-wide text-muted">
                  Message
                </span>
                <textarea
                  value={reviewEmail.text}
                  onChange={(event) =>
                    setReviewEmail((current) =>
                      current ? { ...current, text: event.target.value } : current,
                    )
                  }
                  rows={10}
                  className="input min-h-64 py-3"
                />
              </label>

              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Aperçu</p>
                <h3 className="mt-2 text-base font-semibold text-white">
                  {reviewEmail.subject}
                </h3>
                <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                  {reviewEmail.text}
                </pre>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setReviewEmail(null)}
                  className="btn-ghost w-full justify-center"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={busy || !reviewEmail.subject.trim() || !reviewEmail.text.trim()}
                  onClick={sendReviewEmail}
                  className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Envoyer et appliquer
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {statusModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-8">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">Changer le statut</h2>
                <p className="mt-1 text-sm text-muted">
                  Statut actuel: {orderStatusLabel(order.status)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStatusModalOpen(false)}
                className="text-sm text-muted hover:text-white"
              >
                Fermer
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block text-sm">
                <span className="mb-2 block text-xs uppercase tracking-wide text-muted">
                  Nouveau statut
                </span>
                <select
                  value={nextStatus}
                  onChange={(event) => setNextStatus(event.target.value as OrderStatus)}
                  className="input h-11 py-0"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {orderStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-2 block text-xs uppercase tracking-wide text-muted">
                  Note admin optionnelle
                </span>
                <textarea
                  value={statusNote}
                  onChange={(event) => setStatusNote(event.target.value)}
                  rows={4}
                  className="input min-h-28 py-3"
                  placeholder="Raison du changement..."
                />
              </label>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
                Ce changement ajoute un evenement d'audit avec l'ancien statut, le nouveau statut,
                l'horodatage et la note. Aucun email n'est envoye automatiquement.
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setStatusModalOpen(false)}
                  className="btn-ghost w-full justify-center"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={busy || nextStatus === order.status}
                  onClick={handleStatusChange}
                  className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Confirmer le changement
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Panel primitives ──────────────────────────────────────────────────────────

function PanelTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="text-[13px] font-semibold text-white">{children}</span>
      {right ? <span className="ml-auto">{right}</span> : null}
    </div>
  );
}

function KeyValue({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className={`text-right text-white ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

// ─── Items ──────────────────────────────────────────────────────────────────────

function ItemsPanel({ order }: { order: AdminOrderDTO }) {
  return (
    <section className={`${PANEL} overflow-hidden`}>
      <div className="border-b border-white/[0.06] px-4 py-3 text-[13px] font-semibold text-white">
        Articles commandés
      </div>
      {order.items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3.5 border-b border-white/[0.05] px-4 py-3.5"
        >
          <div className="h-10 w-10 flex-shrink-0 rounded-[9px] bg-gradient-to-br from-[#1d2638] to-[#0d1017]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium text-white">{item.name}</p>
            <p className="truncate font-mono text-[11.5px] text-faint">
              {item.productId} × {item.quantity}
            </p>
          </div>
          <span className="font-mono text-[13.5px] text-white">
            {formatMAD(item.unitPriceMad * item.quantity)}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-white/[0.06] bg-[#0c0d11] px-4 py-3">
        <span className="text-[13px] font-semibold text-white">Total</span>
        <span className="font-mono text-base font-semibold text-white">{formatMAD(order.totalMad)}</span>
      </div>
    </section>
  );
}

// ─── Payment + Proof ────────────────────────────────────────────────────────────

function PaymentPanel({
  order,
  submittedAt,
  confirmedAt,
  issueReason,
}: {
  order: AdminOrderDTO;
  submittedAt: string | null;
  confirmedAt: string | null;
  issueReason: string | null;
}) {
  return (
    <section className={`${PANEL} p-4`}>
      <PanelTitle>Paiement</PanelTitle>
      <div className="space-y-2.5">
        <KeyValue label="Mode" value={METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod} />
        <KeyValue label="Référence" value={order.publicOrderNumber} mono />
        <KeyValue label="Montant" value={formatMAD(order.totalMad)} mono />
        <KeyValue label="Soumis" value={submittedAt ? formatDate(submittedAt) : "Non soumis"} />
        <KeyValue label="Confirmé" value={confirmedAt ? formatDate(confirmedAt) : "Non confirmé"} />
        {issueReason ? (
          <div className="border-t border-white/[0.06] pt-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#e8a838]">Motif</p>
            <p className="mt-1 text-[12.5px] text-[#d9c48a]">{issueReason}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PaymentProofPanel({ proof }: { proof: AdminPaymentProofDTO | null | "loading" }) {
  const ready = proof && proof !== "loading";
  const href = ready ? proofHref(proof) : "";
  const isImage = ready && proof.mimeType.startsWith("image/");
  const isPdf = ready && proof.mimeType === "application/pdf";

  return (
    <section className={`${PANEL} flex flex-col p-4`}>
      <PanelTitle
        right={
          ready ? (
            <a href={href} target="_blank" rel="noreferrer" className="text-[11px] text-accent-strong hover:underline">
              Voir en grand
            </a>
          ) : null
        }
      >
        Justificatif de paiement
      </PanelTitle>

      {proof === "loading" ? (
        <div className="flex min-h-[96px] flex-1 items-center justify-center rounded-[10px] border border-white/[0.08] bg-[#121319] text-[12px] text-faint">
          Chargement…
        </div>
      ) : proof === null ? (
        <div className="flex min-h-[96px] flex-1 flex-col items-center justify-center gap-1.5 rounded-[10px] border border-white/[0.08] text-faint"
          style={{ background: "repeating-linear-gradient(135deg,#15161d,#15161d 8px,#121319 8px,#121319 16px)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
          </svg>
          <span className="text-[10.5px]">Aucun justificatif téléchargé</span>
        </div>
      ) : isImage ? (
        <a href={href} target="_blank" rel="noreferrer" className="block flex-1 overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#121319]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={href} alt="Justificatif de paiement" className="max-h-[220px] w-full object-contain" />
        </a>
      ) : (
        <div className="flex min-h-[96px] flex-1 flex-col items-center justify-center gap-2 rounded-[10px] border border-white/[0.08] bg-[#121319] p-3 text-center">
          <span className="font-mono text-[11px] text-muted">{proof.fileName}</span>
          <span className="text-[11px] text-faint">
            {proof.mimeType} · {formatBytes(proof.sizeBytes)}
          </span>
          <a
            href={href}
            target={isPdf ? "_blank" : undefined}
            rel="noreferrer"
            download={isPdf ? undefined : proof.fileName}
            className="mt-1 rounded-[9px] border border-white/[0.12] bg-[#0f1015] px-3 py-1.5 text-[12px] font-medium text-white hover:border-white/25"
          >
            {isPdf ? "Ouvrir le PDF" : "Télécharger"}
          </a>
        </div>
      )}
    </section>
  );
}

// ─── Code delivery ──────────────────────────────────────────────────────────────

type CodeRow = {
  item: AdminOrderDTO["items"][number];
  index: number;
};

function CodeDeliveryPanel({
  order,
  delivered,
  canDeliver,
  manualMode,
  available,
  entries,
  chosenIds,
  busy,
  totalUnits,
  readyUnits,
  deliverReady,
  onSetEntry,
  onDeliver,
}: {
  order: AdminOrderDTO;
  delivered: boolean;
  canDeliver: boolean;
  manualMode: boolean;
  available: Record<string, AdminCodeDTO[]>;
  entries: Record<string, AssignmentEntry[]>;
  chosenIds: Set<string>;
  busy: boolean;
  totalUnits: number;
  readyUnits: number;
  deliverReady: boolean;
  onSetEntry: (itemId: string, index: number, entry: AssignmentEntry) => void;
  onDeliver: () => Promise<void>;
}) {
  const rows: CodeRow[] = order.items.flatMap((item) =>
    Array.from({ length: item.quantity }, (_, index) => ({ item, index })),
  );

  const deliveredByItem = (itemId: string, productId: string) =>
    order.deliveredCodes.filter((code) => code.orderItemId === itemId || code.productId === productId);

  const helper = delivered
    ? ""
    : !canDeliver
    ? "Confirmez le paiement pour activer la livraison."
    : !deliverReady
    ? "Saisissez tous les codes pour activer la livraison."
    : "";

  return (
    <section id="assign-codes" className={`${PANEL} p-4`}>
      <PanelTitle
        right={
          <span className="text-[11.5px] text-faint">
            {delivered ? `${totalUnits} code${totalUnits > 1 ? "s" : ""} livré${totalUnits > 1 ? "s" : ""}` : `${readyUnits} sur ${totalUnits} code${totalUnits > 1 ? "s" : ""} prêt${readyUnits > 1 ? "s" : ""}`}
          </span>
        }
      >
        <span className="inline-flex items-center gap-2">
          Livraison des codes
          <span className="rounded-md bg-accent/[0.13] px-2 py-0.5 text-[11px] font-semibold text-accent-strong">
            {manualMode ? "Saisie manuelle" : "Depuis le stock"}
          </span>
        </span>
      </PanelTitle>

      {delivered ? (
        <div className="flex flex-col gap-2.5">
          {order.items.map((item) =>
            deliveredByItem(item.id, item.productId).map((code, index) => (
              <div
                key={`${item.id}-${code.code}-${index}`}
                className="flex items-center gap-3 rounded-[10px] border border-[#2ea067]/[0.22] bg-[#121319] px-3 py-2.5"
              >
                <span className="w-24 flex-shrink-0 truncate text-[12px] text-muted">{item.name}</span>
                <span className="flex-1 truncate font-mono text-[12.5px] text-[#5bc98c]">{code.code}</span>
                <span className="flex-shrink-0 text-[11px] text-[#5bc98c]">✓ livré</span>
              </div>
            )),
          )}
          <div className="mt-1 rounded-[10px] border border-[#2ea067]/30 bg-[#2ea067]/10 px-3 py-2.5 text-[12.5px] text-[#5bc98c]">
            Commande livrée. Le client peut consulter ses codes.
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            {rows.map(({ item, index }) => {
              const entry = entries[item.id]?.[index] ?? {};
              const filled = Boolean(entry.digitalCodeId || entry.manualCode?.trim());
              const stock = available[item.productId] ?? [];
              const border = filled
                ? "border-[#2ea067]/[0.22]"
                : canDeliver
                ? "border-accent/30"
                : "border-white/[0.08]";
              return (
                <div
                  key={`${item.id}-${index}`}
                  className={`flex flex-wrap items-center gap-2.5 rounded-[10px] border bg-[#121319] px-3 py-2.5 ${border}`}
                >
                  <span className="w-24 flex-shrink-0 truncate text-[12px] text-muted" title={item.name}>
                    {item.name}
                  </span>

                  {manualMode ? (
                    <input
                      value={entry.manualCode ?? ""}
                      disabled={!canDeliver}
                      onChange={(event) => onSetEntry(item.id, index, { manualCode: event.target.value })}
                      placeholder="Saisir le code…"
                      className="min-w-[120px] flex-1 bg-transparent font-mono text-[12.5px] text-white outline-none placeholder:text-faint disabled:opacity-50"
                    />
                  ) : (
                    <>
                      <select
                        value={entry.digitalCodeId ?? ""}
                        disabled={!canDeliver}
                        onChange={(event) =>
                          onSetEntry(
                            item.id,
                            index,
                            event.target.value ? { digitalCodeId: event.target.value } : {},
                          )
                        }
                        className="min-w-[140px] flex-1 rounded-[8px] border border-white/10 bg-[#0f1015] px-2 py-1 text-[12.5px] text-white outline-none focus:border-accent disabled:opacity-50"
                      >
                        <option value="">Choisir un code…</option>
                        {stock.map((code) => (
                          <option
                            key={code.id}
                            value={code.id}
                            disabled={chosenIds.has(code.id) && entry.digitalCodeId !== code.id}
                          >
                            {code.code}
                          </option>
                        ))}
                      </select>
                      <input
                        value={entry.manualCode ?? ""}
                        disabled={!canDeliver}
                        onChange={(event) => onSetEntry(item.id, index, { manualCode: event.target.value })}
                        placeholder="ou manuel"
                        className="w-32 rounded-[8px] border border-white/10 bg-[#0f1015] px-2 py-1 font-mono text-[12px] text-white outline-none focus:border-accent disabled:opacity-50"
                      />
                    </>
                  )}

                  <span className={`flex-shrink-0 text-[11px] ${filled ? "text-[#5bc98c]" : "text-faint"}`}>
                    {filled ? "✓ saisi" : `#${index + 1}`}
                  </span>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            disabled={!deliverReady || busy}
            onClick={onDeliver}
            className="mt-3.5 h-[42px] w-full rounded-[10px] bg-accent text-[13.5px] font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-[0.55]"
          >
            {busy ? "Livraison en cours…" : "Livrer la commande et envoyer l'email"}
          </button>
          {helper ? (
            <p className="mt-2 text-center text-[11.5px] text-faint">{helper}</p>
          ) : null}
        </>
      )}
    </section>
  );
}

// ─── Right rail ─────────────────────────────────────────────────────────────────

function CustomerPanel({ order }: { order: AdminOrderDTO }) {
  return (
    <section className={`${PANEL} p-4`}>
      <div className="flex items-center gap-3">
        <div className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-[#2c3445] to-[#171b26] text-[13px] font-semibold text-accent-strong">
          {initials(order.customerName)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-white">{order.customerName}</p>
          <p className="truncate text-[11.5px] text-faint">{order.customerEmail}</p>
        </div>
      </div>
      <div className="mt-3.5 flex items-center justify-between border-t border-white/[0.06] pt-3 text-[12.5px]">
        <span className="text-muted">Contact</span>
        <a href={`mailto:${order.customerEmail}`} className="text-accent-strong hover:underline">
          Envoyer un e-mail
        </a>
      </div>
    </section>
  );
}

function OrderSummaryPanel({ order }: { order: AdminOrderDTO }) {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <section className={`${PANEL} p-4`}>
      <PanelTitle>Résumé de la commande</PanelTitle>
      <div className="space-y-2.5">
        <KeyValue label="Référence" value={order.publicOrderNumber} mono />
        <KeyValue label="Passée le" value={formatDate(order.createdAt)} />
        <KeyValue label="Articles" value={`${itemCount} article${itemCount > 1 ? "s" : ""}`} />
        <KeyValue label="Paiement" value={METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod} />
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-2.5">
          <span className="text-[13px] font-semibold text-white">Total</span>
          <span className="font-mono text-[15px] font-semibold text-white">{formatMAD(order.totalMad)}</span>
        </div>
      </div>
    </section>
  );
}

function timelineDotColor(event: PaymentEventDTO) {
  switch (event.toStatus) {
    case "delivered":
    case "payment_confirmed":
      return "#5bc98c";
    case "payment_submitted":
    case "payment_issue":
    case "pending_payment":
      return "#e8a838";
    case "rejected":
    case "cancelled":
      return "#e05c5c";
    default:
      return "#3e7bfa";
  }
}

function TimelinePanel({ events }: { events: PaymentEventDTO[] }) {
  return (
    <section className={`${PANEL} p-4`}>
      <PanelTitle>Historique</PanelTitle>
      {events.length === 0 ? (
        <p className="text-[12.5px] text-faint">Aucun événement pour le moment.</p>
      ) : (
        <div className="flex flex-col">
          {events.map((event, index) => {
            const last = index === events.length - 1;
            return (
              <div key={event.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className="mt-1 h-[9px] w-[9px] flex-shrink-0 rounded-full"
                    style={{ background: timelineDotColor(event) }}
                  />
                  {!last ? <span className="w-[1.5px] flex-1 bg-white/[0.08]" /> : null}
                </div>
                <div className={last ? "" : "pb-4"}>
                  <p className="text-[12.5px] font-medium text-white">
                    {event.note ?? `${event.fromStatus ?? "Début"} → ${event.toStatus ?? event.type}`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-faint">{formatDate(event.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function EmailsPanel({ logs }: { logs: EmailLogDTO[] }) {
  return (
    <section className={`${PANEL} p-4`}>
      <PanelTitle>Emails envoyés</PanelTitle>
      {logs.length === 0 ? (
        <p className="text-[12.5px] text-faint">Aucun email journalisé.</p>
      ) : (
        <div className="space-y-2.5">
          {logs.map((log) => {
            const sent = log.status === "sent";
            const failed = log.status === "failed";
            return (
              <details key={log.id} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2.5 text-[12.5px]">
                  {failed ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e05c5c" strokeWidth="2" aria-hidden>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M15 9l-6 6M9 9l6 6" />
                    </svg>
                  ) : sent ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5bc98c" strokeWidth="2" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#646a77" strokeWidth="2" aria-hidden>
                      <circle cx="12" cy="12" r="9" />
                      <polyline points="12 7 12 12 15 14" />
                    </svg>
                  )}
                  <span className={`min-w-0 flex-1 truncate ${sent ? "text-muted" : failed ? "text-[#f0a5a5]" : "text-faint"}`}>
                    {log.subject}
                  </span>
                  <span className="flex-shrink-0 text-[11px] text-faint">{formatDate(log.createdAt)}</span>
                </summary>
                <div className="mt-2 space-y-2 rounded-[10px] border border-white/[0.06] bg-[#121319] p-3">
                  <p className="text-[11px] text-faint">
                    {log.recipient} · {log.templateKey ?? log.type} · {log.provider || "simulation"}
                  </p>
                  {log.errorMessage ? (
                    <p className="rounded border border-[#e05c5c]/30 bg-[#e05c5c]/10 px-2 py-1 text-[11px] text-[#f0a5a5]">
                      {log.errorMessage}
                    </p>
                  ) : null}
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-muted">
                    {log.text || log.body}
                  </pre>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}

function QuickActionsPanel({
  busy,
  order,
  onChangeStatus,
  onError,
}: {
  busy: boolean;
  order: AdminOrderDTO;
  onChangeStatus: () => void;
  onError: (message: string) => void;
}) {
  return (
    <section className={`${PANEL} p-4`}>
      <PanelTitle>Actions rapides</PanelTitle>
      <div className="space-y-2">
        <button
          type="button"
          disabled={busy}
          onClick={onChangeStatus}
          className="h-[38px] w-full rounded-[9px] border border-white/10 bg-[#121319] text-[12.5px] font-medium text-white transition hover:border-white/25 disabled:opacity-50"
        >
          Changer le statut
        </button>
        <button
          type="button"
          disabled
          title="Les notes internes ne sont pas encore configurées."
          className="h-[38px] w-full cursor-not-allowed rounded-[9px] border border-white/10 bg-transparent text-[12.5px] font-medium text-faint"
        >
          + Note interne (bientôt)
        </button>
        <OrderDetailDeleteTools orderId={order.id} onError={onError} />
      </div>
    </section>
  );
}
