"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { formatMAD, formatDate } from "@/lib/format";
import RegionBadge from "@/components/RegionBadge";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { isInventoryEnabled } from "@/lib/storeSettings";
import { isDelivered, orderStatusLabel, orderStatusShort } from "@/lib/orderStatus";
import {
  changeOrderStatusAction,
  getAdminOrderDetailAction,
  getAvailableCodesAction,
  deliverOrderAction,
  markDiscordDeliverySentAction,
} from "@/app/actions/admin";
import {
  approvePaymentAction,
  getPaymentEmailPreviewAction,
  renderPaymentReviewEmailAction,
  sendPaymentReviewEmailAction,
  getPaymentProofAction,
} from "@/app/actions/payments";
import { getReloadlyDeliveryChecksAction } from "@/app/actions/suppliers";
import { createAdminRefundAction } from "@/app/actions/adminRefunds";
import {
  isValidPaymentRecipient,
  PAYMENT_PROOF_REQUEST_REASONS,
} from "@/lib/paymentProofRequest";
import type {
  AdminCodeDTO,
  AdminOrderDTO,
  AdminPaymentProofDTO,
  AssignmentEntry,
  ItemAssignment,
} from "@/lib/dto";
import type { OrderStatus } from "@/lib/types";

const OrderDetailDeleteTools = dynamic(() =>
  import("@/components/admin/orders/DevOrderDetailTools"),
);

/** Literal design tokens from the admin handoff (docs/admin-handoff/05-Design-Tokens.md). */
const C = {
  base: "#0C0D11",
  panel: "#0F1015",
  panelSunken: "#0C0D11",
  surfaceInput: "#121319",
  text: "#F3F4F7",
  muted: "#9A9FAB",
  faint: "#646A77",
  fainter: "#4d525d",
  accent: "#3E7BFA",
  accentSoft: "rgba(62,123,250,0.13)",
  accentBorder: "rgba(62,123,250,0.3)",
  accentText: "#9FB8FF",
  warning: "#E8A838",
  warningSoft: "rgba(232,168,56,0.14)",
  warningBorder: "rgba(232,168,56,0.28)",
  success: "#2EA067",
  successText: "#5BC98C",
  successSoft: "rgba(46,160,103,0.12)",
  successBorder: "rgba(46,160,103,0.28)",
  danger: "#E05C5C",
  dangerSoft: "rgba(224,92,92,0.08)",
  dangerBorder: "rgba(224,92,92,0.3)",
  borderHairline: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.07)",
  borderInput: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.1)",
  borderStronger: "rgba(255,255,255,0.12)",
} as const;

const MONO = "var(--font-mono)";

const cardStyle: CSSProperties = {
  borderRadius: 14,
  background: C.panel,
  border: `1px solid ${C.border}`,
  overflow: "hidden",
};

const METHOD_LABELS: Record<string, string> = {
  bank: "Virement bancaire",
  usdt: "USDT",
  paypal: "PayPal",
  card: "Carte bancaire",
  test: "Test",
};

// "refunded" is intentionally NOT selectable here: a refund is an auditable
// case created and processed from Admin > Remboursements, never a bare status
// flip (the server rejects a manual "refunded" transition too).
const STATUS_OPTIONS: OrderStatus[] = [
  "pending_payment",
  "payment_submitted",
  "payment_confirmed",
  "payment_issue",
  "rejected",
  "cancelled",
];

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

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

type Tone = { color: string; bg: string; border: string };

function statusTone(status: string): Tone {
  switch (status) {
    case "delivered":
      return { color: C.successText, bg: C.successSoft, border: C.successBorder };
    case "payment_confirmed":
    case "payment_submitted":
    case "payment_issue":
    case "processing":
      return { color: C.accentText, bg: C.accentSoft, border: C.accentBorder };
    case "rejected":
    case "cancelled":
      return { color: C.danger, bg: "rgba(224,92,92,0.12)", border: C.dangerBorder };
    case "refunded":
      return { color: "#C79BFF", bg: "rgba(160,110,240,0.12)", border: "rgba(160,110,240,0.3)" };
    default:
      return { color: C.warning, bg: C.warningSoft, border: C.warningBorder };
  }
}

function formatWaiting(ms: number) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ${mins % 60} min`;
  const days = Math.floor(hours / 24);
  return `${days} j ${hours % 24} h`;
}

export default function OrderDetailPage({
  initialOrder,
  paymentMethodLabel,
}: {
  initialOrder: AdminOrderDTO;
  /** Resolved customer-facing method name (orders store the method id, not a
   * friendly label). Falls back to the legacy label map / raw value. */
  paymentMethodLabel?: string;
}) {
  const { settings } = useStoreSettings();
  const [order, setOrder] = useState(initialOrder);
  const [reloadlyChecks, setReloadlyChecks] = useState<
    Record<string, { ok: boolean; message: string | null }>
  >({});
  const [proof, setProof] = useState<AdminPaymentProofDTO | null | "loading">("loading");
  const [entries, setEntries] = useState<Record<string, AssignmentEntry[]>>({});
  const [available, setAvailable] = useState<Record<string, AdminCodeDTO[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<OrderStatus>(initialOrder.status);
  const [statusNote, setStatusNote] = useState("");
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [reviewEmail, setReviewEmail] = useState<{
    intent: "reject" | "request_proof" | "refund_update";
    title: string;
    subject: string;
    message: string;
    reason: string;
    recipient: { name: string; email: string };
    idempotencyKey: string;
  } | null>(null);
  // Live server-rendered preview — identical rendering path to the sent email.
  const [reviewPreview, setReviewPreview] = useState<{ html: string; loading: boolean }>({
    html: "",
    loading: false,
  });
  // Inventory OFF also forces manual/provider fulfillment (no local code pool).
  const manualMode = settings.inventoryMode === "manual" || !isInventoryEnabled(settings);

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

  // Pre-delivery Reloadly denomination check: warn on the order page if a
  // mapped Reloadly product doesn't offer the variant's face value, so the
  // admin can fix the mapping/price before attempting delivery.
  const hasReloadlyItem = useMemo(
    () =>
      // Route fields are mapping-derived server-side (orders.ts); presence
      // alone means the supplier route is usable.
      order.items.some((i) => i.variantReloadlyProductId != null),
    [order.items],
  );
  useEffect(() => {
    if (!hasReloadlyItem || delivered) return;
    let cancelled = false;
    getReloadlyDeliveryChecksAction(order.id)
      .then((checks) => {
        if (!cancelled) setReloadlyChecks(checks);
      })
      .catch(() => {
        /* fail open — no warning if the check can't run */
      });
    return () => {
      cancelled = true;
    };
  }, [hasReloadlyItem, delivered, order.id]);

  const submittedAt = eventDate(order, "payment_submitted");
  const confirmedAt = eventDate(order, "payment_confirmed");
  const issueReason =
    eventNote(order, "payment_issue") ??
    eventNote(order, "rejected") ??
    null;
  const tone = statusTone(order.status);
  const displayNumber = order.publicOrderNumber || orderNumber(order.id);
  const paymentReference = order.publicOrderNumber || displayNumber;

  const refreshOrder = useCallback(async () => {
    const fresh = await getAdminOrderDetailAction(order.id);
    if (!fresh) return;
    // Keep the same object when nothing changed: downstream effects re-init the
    // code-assignment entries on `order` identity, and a no-op poll must not
    // wipe codes the admin is currently typing.
    setOrder((current) =>
      JSON.stringify(fresh) === JSON.stringify(current) ? current : fresh,
    );
  }, [order.id]);

  // Inbound live updates: a proof resubmitted or a webhook confirmation while
  // this page is open must appear without a manual reload. Terminal orders
  // stop polling.
  useEffect(() => {
    if (order.status === "delivered" || order.status === "cancelled") return;
    const interval = setInterval(() => {
      void refreshOrder();
    }, 15_000);
    return () => clearInterval(interval);
  }, [order.status, refreshOrder]);

  useEffect(() => {
    setProof("loading");
    getPaymentProofAction(order.id)
      .then((result) => setProof(result))
      .catch((loadError) => {
        console.error("Failed to load proof", loadError);
        setProof(null);
      });
  }, [order.id]);

  // Live "waiting" clock — mounted-only so SSR/CSR stay consistent.
  useEffect(() => {
    const reference = submittedAt ?? order.createdAt;
    if (!reference || delivered || order.status === "rejected" || order.status === "cancelled") {
      setWaiting(null);
      return;
    }
    const anchor = new Date(reference).getTime();
    const update = () => setWaiting(formatWaiting(Date.now() - anchor));
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [submittedAt, order.createdAt, order.status, delivered]);

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
      .every((entry) => entry.digitalCodeId || entry.manualCode?.trim() || entry.reloadlyProductId),
  );

  const manualCountsValid = order.items.every((item) => {
    const filled = (entries[item.id] ?? [])
      .slice(0, item.quantity)
      .filter((entry) => entry.manualCode?.trim() || entry.reloadlyProductId).length;
    return filled === item.quantity;
  });

  const totalCodes = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const readyCodes = order.items.reduce((sum, item) => {
    const filled = (entries[item.id] ?? [])
      .slice(0, item.quantity)
      .filter((entry) => entry.digitalCodeId || entry.manualCode?.trim() || entry.reloadlyProductId).length;
    return sum + filled;
  }, 0);
  const deliverReady = (manualMode ? manualCountsValid : allFilled) && canDeliver;

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
        message: preview.message,
        reason: preview.reason,
        recipient: preview.recipient,
        idempotencyKey: crypto.randomUUID(),
      });
      setReviewPreview({ html: preview.html, loading: false });
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Aperçu email impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function startRefund() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await createAdminRefundAction({
        orderId: order.id,
        source: "ADMIN_CREATED",
        reason: "other",
        description: "Demande de remboursement créée depuis la commande.",
      });
      if (result.ok) {
        window.location.href = `/admin/refunds/${result.id}`;
        return;
      }
      setError(result.error);
    } finally {
      setBusy(false);
    }
  }

  async function sendReviewEmail() {
    if (!reviewEmail) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await sendPaymentReviewEmailAction(order.id, reviewEmail.intent, {
        subject: reviewEmail.subject,
        message: reviewEmail.message,
        reason: reviewEmail.reason,
        idempotencyKey: reviewEmail.idempotencyKey,
      });
      if (!result.ok) {
        setError(result.error ?? "Envoi impossible.");
        return;
      }
      setMessage(
        reviewEmail.intent === "request_proof"
          ? "Nouveau justificatif demandé au client."
          : "E-mail envoyé et statut mis à jour.",
      );
      setReviewEmail(null);
      await refreshOrder();
    } finally {
      setBusy(false);
    }
  }

  // Keep the modal preview truthful: re-render server-side (same path as the
  // sent email) whenever the admin edits the subject, message, or motif.
  const reviewIntent = reviewEmail?.intent;
  const reviewSubject = reviewEmail?.subject;
  const reviewMessage = reviewEmail?.message;
  const reviewReason = reviewEmail?.reason;
  useEffect(() => {
    if (!reviewIntent) return;
    let cancelled = false;
    setReviewPreview((current) => ({ ...current, loading: true }));
    const timer = setTimeout(async () => {
      try {
        const rendered = await renderPaymentReviewEmailAction(order.id, reviewIntent, {
          subject: reviewSubject ?? "",
          message: reviewMessage ?? "",
          reason: reviewReason ?? "",
        });
        if (!cancelled) setReviewPreview({ html: rendered.html, loading: false });
      } catch {
        if (!cancelled) setReviewPreview((current) => ({ ...current, loading: false }));
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [order.id, reviewIntent, reviewSubject, reviewMessage, reviewReason]);

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

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <style>{`
        .s4-body { display:grid; grid-template-columns:1fr 372px; flex:1; min-height:0; }
        .s4-col { overflow-y:auto; }
        .s4-pay { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        @media (max-width:1120px){
          .s4-body { grid-template-columns:1fr; overflow-y:auto; }
          .s4-col { overflow:visible; }
          .s4-right { border-left:none !important; border-top:1px solid ${C.border}; }
        }
        @media (max-width:640px){ .s4-pay { grid-template-columns:1fr; } .s4-actions { width:100%; } }
        .s4-input::placeholder { color:${C.faint}; }
        .s4-mobile-bar { display:none; }
        @media (max-width:720px){
          .s4-header-actions { display:none; }
          .s4-mobile-bar { display:flex; }
          .s4-body { padding-bottom:74px; }
        }
      `}</style>

      {/* ===== Header strip ===== */}
      <div
        style={{
          flexShrink: 0,
          padding: "18px 28px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/admin?tab=orders"
          aria-label="Retour aux commandes"
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            border: `1px solid ${C.borderStrong}`,
            background: C.surfaceInput,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.muted,
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
            <h3
              style={{
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                margin: 0,
                fontFamily: MONO,
                color: C.text,
              }}
            >
              {displayNumber}
            </h3>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: tone.color,
                background: tone.bg,
                border: `1px solid ${tone.border}`,
                borderRadius: 6,
                padding: "2px 9px",
              }}
            >
              {orderStatusShort(order.status)}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: C.faint, marginTop: 3 }}>
            Passée le {formatDate(order.createdAt)}
            {waiting ? ` · en attente ${waiting}` : null}
          </div>
        </div>

        <div className="s4-actions s4-header-actions" style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <HeaderButton tone="accent" disabled={busy} onClick={() => void startRefund()}>
            Démarrer un remboursement
          </HeaderButton>
          {canReject ? (
            <HeaderButton
              tone="danger"
              disabled={busy}
              onClick={() => openReviewEmail("reject", "Refuser le paiement")}
            >
              Refuser
            </HeaderButton>
          ) : null}
          {canIssue ? (
            <HeaderButton
              tone="neutral"
              disabled={busy}
              onClick={() => openReviewEmail("request_proof", "Demander un nouveau justificatif")}
            >
              Demander un justificatif
            </HeaderButton>
          ) : null}
          <HeaderButton
            tone="neutral"
            disabled={busy}
            onClick={() => {
              setNextStatus(order.status === "delivered" ? "payment_confirmed" : order.status);
              setStatusModalOpen(true);
            }}
          >
            Changer le statut
          </HeaderButton>
          {canApprove ? (
            <HeaderButton
              tone="success"
              disabled={busy}
              onClick={() => runAction("Paiement confirmé.", () => approvePaymentAction(order.id))}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              }
            >
              Confirmer le paiement
            </HeaderButton>
          ) : null}
        </div>
      </div>

      {/* ===== Toast strip ===== */}
      {message || error ? (
        <div style={{ flexShrink: 0, padding: "12px 28px 0" }}>
          {message ? (
            <Banner tone="success" onClose={() => setMessage("")}>
              {message}
            </Banner>
          ) : null}
          {error ? (
            <Banner tone="danger" onClose={() => setError("")}>
              {error}
            </Banner>
          ) : null}
        </div>
      ) : null}

      {/* ===== Split body ===== */}
      <div className="s4-body">
        {/* Left */}
        <div
          className="s4-col"
          style={{
            padding: "22px 26px",
            borderRight: `1px solid ${C.border}`,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <ItemsCard order={order} />

          <div className="s4-pay">
            <PaymentCard
              method={paymentMethodLabel ?? METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
              reference={paymentReference}
              total={formatMAD(order.totalMad)}
              submittedAt={submittedAt ? formatDate(submittedAt) : "Non soumis"}
              confirmedAt={confirmedAt ? formatDate(confirmedAt) : "Non confirmé"}
              issueReason={issueReason}
            />
            <ProofCard proof={proof} onViewFull={() => setProofModalOpen(true)} />
          </div>

          <DeliverySection
            order={order}
            delivered={delivered}
            canDeliver={canDeliver}
            available={available}
            entries={entries}
            chosenIds={chosenIds}
            busy={busy}
            manualMode={manualMode}
            reloadlyChecks={reloadlyChecks}
            readyCodes={readyCodes}
            totalCodes={totalCodes}
            deliverReady={deliverReady}
            onSetEntry={setEntry}
            onDeliver={handleDeliver}
          />
        </div>

        {/* Right */}
        <div
          className="s4-col s4-right"
          style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18 }}
        >
          <CustomerCard
            name={order.customerName}
            email={order.customerEmail}
            total={formatMAD(order.totalMad)}
            itemCount={totalCodes}
          />
          <TimelineCard order={order} />
          <DiscordCard
            order={order}
            busy={busy}
            onMarkSent={() =>
              runAction("Livraison Discord marquée comme envoyée.", () =>
                markDiscordDeliverySentAction(order.id),
              )
            }
          />
          <EmailsCard order={order} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setNextStatus(order.status);
                setStatusModalOpen(true);
              }}
              style={{
                height: 38,
                borderRadius: 9,
                border: `1px solid ${C.borderStrong}`,
                background: "transparent",
                color: C.muted,
                fontSize: 12.5,
                fontWeight: 500,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.5 : 1,
              }}
            >
              + Ajouter une note interne
            </button>
            <OrderDetailDeleteTools orderId={order.id} onError={(m) => setError(m)} />
          </div>
        </div>
      </div>

      {/* ===== Mobile sticky fulfillment action bar ===== */}
      <div
        className="s4-mobile-bar"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          gap: 8,
          padding: "10px 12px calc(10px + env(safe-area-inset-bottom))",
          overflowX: "auto",
          background: "rgba(12,13,17,0.92)",
          backdropFilter: "blur(12px)",
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <HeaderButton tone="accent" disabled={busy} onClick={() => void startRefund()}>
          Rembourser
        </HeaderButton>
        {canApprove ? (
          <HeaderButton
            tone="success"
            disabled={busy}
            onClick={() => runAction("Paiement confirmé.", () => approvePaymentAction(order.id))}
          >
            Confirmer le paiement
          </HeaderButton>
        ) : null}
        <HeaderButton
          tone="neutral"
          disabled={busy}
          onClick={() => {
            setNextStatus(order.status === "delivered" ? "payment_confirmed" : order.status);
            setStatusModalOpen(true);
          }}
        >
          Changer le statut
        </HeaderButton>
        {canIssue ? (
          <HeaderButton
            tone="neutral"
            disabled={busy}
            onClick={() => openReviewEmail("request_proof", "Demander un nouveau justificatif")}
          >
            Justificatif
          </HeaderButton>
        ) : null}
        {canReject ? (
          <HeaderButton
            tone="danger"
            disabled={busy}
            onClick={() => openReviewEmail("reject", "Refuser le paiement")}
          >
            Refuser
          </HeaderButton>
        ) : null}
      </div>

      {/* ===== Proof modal ===== */}
      {proofModalOpen && proof && proof !== "loading" ? (
        <ModalShell onClose={() => setProofModalOpen(false)} maxWidth={880}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: C.text }}>
                Justificatif de paiement
              </h2>
              <p style={{ fontSize: 12.5, color: C.faint, margin: "4px 0 0", fontFamily: MONO }}>
                {proof.fileName} · {formatBytes(proof.sizeBytes)}
              </p>
            </div>
            <CloseButton onClick={() => setProofModalOpen(false)} />
          </div>
          <div style={{ marginTop: 16 }}>
            {proof.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proofHref(proof)}
                alt="Justificatif de paiement"
                style={{
                  width: "100%",
                  maxHeight: "70vh",
                  objectFit: "contain",
                  borderRadius: 10,
                  border: `1px solid ${C.borderInput}`,
                  background: C.surfaceInput,
                }}
              />
            ) : proof.mimeType === "application/pdf" ? (
              <iframe
                title="Justificatif PDF"
                src={proofHref(proof)}
                style={{ width: "100%", height: "70vh", borderRadius: 10, border: `1px solid ${C.borderInput}` }}
              />
            ) : (
              <p style={{ fontSize: 13, color: C.muted }}>Aperçu indisponible pour ce type de fichier.</p>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <a
                href={proofHref(proof)}
                target="_blank"
                rel="noreferrer"
                style={ghostLinkStyle}
              >
                Ouvrir dans un onglet
              </a>
              <a href={proofHref(proof)} download={proof.fileName} style={ghostLinkStyle}>
                Télécharger
              </a>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {/* ===== Review email modal ===== */}
      {reviewEmail ? (
        <ModalShell onClose={() => setReviewEmail(null)} maxWidth={680}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: C.text }}>{reviewEmail.title}</h2>
              <p style={{ fontSize: 12.5, color: C.faint, margin: "4px 0 0" }}>
                Modifiez cet email si nécessaire. Les changements s'appliquent uniquement à cet envoi.
              </p>
            </div>
            <CloseButton onClick={() => setReviewEmail(null)} />
          </div>
          <div style={{ marginTop: 18, display: "flex", maxHeight: "min(76vh, 820px)", flexDirection: "column", gap: 14, overflowY: "auto", paddingRight: 4 }}>
            <Field label="Destinataire">
              <div style={{ ...inputStyle, height: "auto", minHeight: 58, padding: "10px 13px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 13.5, fontWeight: 600 }}>{reviewEmail.recipient.name}</div>
                  <div style={{ color: C.muted, fontSize: 12.5, overflowWrap: "anywhere" }}>{reviewEmail.recipient.email}</div>
                </div>
                <button type="button" onClick={() => void navigator.clipboard.writeText(reviewEmail.recipient.email)} style={ghostLinkStyle}>
                  Copier
                </button>
              </div>
              {!isValidPaymentRecipient(reviewEmail.recipient.email) ? (
                <p style={{ margin: "6px 0 0", color: C.danger, fontSize: 12 }}>
                  Cette commande ne possède pas d’adresse e-mail valide. L’envoi est désactivé.
                </p>
              ) : null}
            </Field>
            <Field label="Sujet">
              <input
                className="s4-input"
                list={reviewEmail.intent === "request_proof" ? "proof-request-reasons" : undefined}
                value={reviewEmail.subject}
                onChange={(event) =>
                  setReviewEmail((current) => (current ? { ...current, subject: event.target.value } : current))
                }
                style={inputStyle}
              />
              {reviewEmail.intent === "request_proof" ? (
                <datalist id="proof-request-reasons">
                  {PAYMENT_PROOF_REQUEST_REASONS.map((reason) => (
                    <option key={reason} value={reason} />
                  ))}
                </datalist>
              ) : null}
            </Field>
            <Field
              label={
                reviewEmail.intent === "reject"
                  ? "Motif du refus"
                  : reviewEmail.intent === "refund_update"
                    ? "Motif du remboursement"
                    : "Motif de la demande"
              }
            >
              <input
                className="s4-input"
                value={reviewEmail.reason}
                onChange={(event) =>
                  setReviewEmail((current) => (current ? { ...current, reason: event.target.value } : current))
                }
                placeholder={
                  reviewEmail.intent === "reject"
                    ? "Ex. : Le justificatif ne correspond pas au montant."
                    : reviewEmail.intent === "refund_update"
                      ? "Ex. : Remboursement traité, sous 3 à 5 jours ouvrés."
                      : "Ex. : Le justificatif est illisible ou incomplet."
                }
                style={inputStyle}
              />
            </Field>
            <Field label="Message">
              <textarea
                className="s4-input"
                value={reviewEmail.message}
                onChange={(event) =>
                  setReviewEmail((current) => (current ? { ...current, message: event.target.value } : current))
                }
                rows={6}
                style={{ ...inputStyle, height: "auto", padding: "10px 13px", resize: "vertical", lineHeight: 1.5 }}
              />
            </Field>
            <div style={{ ...cardStyle, background: "#eef1f7", padding: 12 }}>
              <p style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: C.faint, margin: 0 }}>
                Aperçu de l’e-mail réel {reviewPreview.loading ? "· mise à jour…" : ""}
              </p>
              <iframe
                title="Aperçu de l’e-mail réel"
                sandbox=""
                srcDoc={reviewPreview.html}
                style={{
                  width: "100%",
                  height: 460,
                  marginTop: 10,
                  border: 0,
                  borderRadius: 10,
                  background: "#eef1f7",
                }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <SecondaryButton onClick={() => setReviewEmail(null)}>Annuler</SecondaryButton>
              <PrimaryButton
                disabled={
                  busy ||
                  !reviewEmail.subject.trim() ||
                  !reviewEmail.message.trim() ||
                  (reviewEmail.intent === "request_proof" && !reviewEmail.reason.trim()) ||
                  !isValidPaymentRecipient(reviewEmail.recipient.email)
                }
                onClick={sendReviewEmail}
              >
                {reviewEmail.intent === "request_proof"
                  ? "Envoyer et demander un justificatif"
                  : "Envoyer et appliquer"}
              </PrimaryButton>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {/* ===== Status change modal ===== */}
      {statusModalOpen ? (
        <ModalShell onClose={() => setStatusModalOpen(false)} maxWidth={520}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: C.text }}>Changer le statut</h2>
              <p style={{ fontSize: 12.5, color: C.faint, margin: "4px 0 0" }}>
                Statut actuel : {orderStatusLabel(order.status)}
              </p>
            </div>
            <CloseButton onClick={() => setStatusModalOpen(false)} />
          </div>
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Nouveau statut">
              <select
                value={nextStatus}
                onChange={(event) => setNextStatus(event.target.value as OrderStatus)}
                style={inputStyle}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {orderStatusLabel(status)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Note admin (interne)">
              <textarea
                className="s4-input"
                value={statusNote}
                onChange={(event) => setStatusNote(event.target.value)}
                rows={4}
                placeholder="Raison du changement…"
                style={{ ...inputStyle, height: "auto", padding: "10px 13px", resize: "vertical", lineHeight: 1.5 }}
              />
            </Field>
            <div
              style={{
                borderRadius: 11,
                border: `1px solid ${C.warningBorder}`,
                background: C.warningSoft,
                padding: "10px 13px",
                fontSize: 11.5,
                lineHeight: 1.55,
                color: "#F0D6A0",
              }}
            >
              Ce changement ajoute un événement d'audit avec l'ancien statut, le nouveau statut,
              l'horodatage et la note. Aucun email n'est envoyé automatiquement.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <SecondaryButton onClick={() => setStatusModalOpen(false)}>Annuler</SecondaryButton>
              <PrimaryButton disabled={busy || nextStatus === order.status} onClick={handleStatusChange}>
                Confirmer le changement
              </PrimaryButton>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

/* ============================ shared building blocks ============================ */

const inputStyle: CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 13px",
  background: C.surfaceInput,
  border: `1px solid ${C.borderInput}`,
  borderRadius: 9,
  color: C.text,
  fontSize: 13,
  outline: "none",
};

const ghostLinkStyle: CSSProperties = {
  height: 36,
  padding: "0 14px",
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 9,
  border: `1px solid ${C.borderStrong}`,
  background: C.surfaceInput,
  color: C.text,
  fontSize: 13,
  fontWeight: 500,
  textDecoration: "none",
};

const cardHeaderStyle: CSSProperties = {
  padding: "13px 16px",
  borderBottom: `1px solid ${C.borderHairline}`,
  fontSize: 13,
  fontWeight: 600,
  color: C.text,
};

function HeaderButton({
  children,
  tone,
  disabled,
  onClick,
  icon,
}: {
  children: ReactNode;
  tone: "success" | "danger" | "neutral" | "accent";
  disabled?: boolean;
  onClick: () => void;
  icon?: ReactNode;
}) {
  const styles: Record<string, CSSProperties> = {
    success: {
      border: "none",
      background: C.success,
      color: "#fff",
      boxShadow: "0 6px 18px rgba(46,160,103,0.3)",
    },
    danger: {
      border: `1px solid ${C.dangerBorder}`,
      background: C.dangerSoft,
      color: C.danger,
    },
    neutral: {
      border: `1px solid ${C.borderStronger}`,
      background: C.surfaceInput,
      color: C.text,
    },
    accent: {
      border: `1px solid ${C.accentBorder}`,
      background: C.accentSoft,
      color: C.accentText,
    },
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 38,
        padding: icon ? "0 16px" : "0 15px",
        display: "flex",
        alignItems: "center",
        gap: 7,
        borderRadius: 9,
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        ...styles[tone],
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function PrimaryButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 40,
        borderRadius: 10,
        border: "none",
        background: C.accent,
        color: "#fff",
        fontSize: 13.5,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 40,
        borderRadius: 10,
        border: `1px solid ${C.borderStrong}`,
        background: "transparent",
        color: C.muted,
        fontSize: 13.5,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Fermer"
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        border: `1px solid ${C.borderStrong}`,
        background: C.surfaceInput,
        color: C.muted,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

function CopyButton({ value, label = "Copier" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(event: ReactMouseEvent) {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (copyError) {
      console.error("Failed to copy to clipboard", copyError);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`${label} : ${value}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        height: 22,
        padding: "0 7px",
        flexShrink: 0,
        borderRadius: 6,
        border: `1px solid ${copied ? C.successBorder : C.borderStrong}`,
        background: copied ? C.successSoft : C.surfaceInput,
        color: copied ? C.successText : C.muted,
        fontSize: 10.5,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {copied ? "Copié" : label}
    </button>
  );
}

function Banner({
  children,
  tone,
  onClose,
}: {
  children: ReactNode;
  tone: "success" | "danger";
  onClose: () => void;
}) {
  const map = {
    success: { color: C.successText, bg: C.successSoft, border: C.successBorder },
    danger: { color: C.danger, bg: "rgba(224,92,92,0.1)", border: C.dangerBorder },
  }[tone];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        borderRadius: 11,
        border: `1px solid ${map.border}`,
        background: map.bg,
        color: map.color,
        padding: "11px 14px",
        fontSize: 13,
        marginBottom: 6,
      }}
    >
      <span style={{ flex: 1 }}>{children}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", opacity: 0.7 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "block",
          fontSize: 12,
          color: C.muted,
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function ModalShell({
  children,
  onClose,
  maxWidth,
}: {
  children: ReactNode;
  onClose: () => void;
  maxWidth: number;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.72)",
        padding: "32px 16px",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth,
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          background: C.panel,
          padding: 20,
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ============================ left column cards ============================ */

function ItemsCard({ order }: { order: AdminOrderDTO }) {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>Articles</div>
      {order.items.map((item, index) => {
        const codes = order.deliveredCodes.filter(
          (code) => code.orderItemId === item.id || code.productId === item.productId,
        );
        return (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 13,
              padding: "14px 16px",
              borderBottom: index < order.items.length - 1 ? `1px solid ${C.borderHairline}` : "none",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 9,
                background: "linear-gradient(145deg,#1d2638,#0d1017)",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, fontWeight: 500, color: C.text }}>{item.name}</span>
                {item.variantRegion ? (
                  <RegionBadge code={item.variantRegion} variant="chip" size="micro" />
                ) : null}
              </div>
              <div style={{ fontSize: 11.5, color: C.faint, fontFamily: MONO }}>
                {item.productId} × {item.quantity}
              </div>
              {codes.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {codes.map((code, codeIndex) => (
                    <span
                      key={`${code.code}-${codeIndex}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontFamily: MONO,
                        fontSize: 11,
                        color: C.successText,
                        background: C.successSoft,
                        border: `1px solid ${C.successBorder}`,
                        borderRadius: 6,
                        padding: "2px 4px 2px 7px",
                      }}
                    >
                      {code.code}
                      <CopyButton value={code.code} label="" />
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <span style={{ fontSize: 13.5, fontFamily: MONO, color: C.text, whiteSpace: "nowrap" }}>
              {formatMAD(item.unitPriceMad * item.quantity)}
            </span>
          </div>
        );
      })}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "13px 16px",
          background: C.panelSunken,
          borderTop: `1px solid ${C.borderHairline}`,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Total</span>
        <span style={{ fontSize: 16, fontWeight: 600, fontFamily: MONO, color: C.text }}>
          {formatMAD(order.totalMad)}
        </span>
      </div>
    </div>
  );
}

function PaymentCard({
  method,
  reference,
  total,
  submittedAt,
  confirmedAt,
  issueReason,
}: {
  method: string;
  reference: string;
  total: string;
  submittedAt: string;
  confirmedAt: string;
  issueReason: string | null;
}) {
  const rows: [string, string][] = [
    ["Mode", method],
    ["Référence", reference],
    ["Montant", total],
    ["Soumis", submittedAt],
    ["Confirmé", confirmedAt],
  ];
  if (issueReason) rows.push(["Motif", issueReason]);
  return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>Paiement</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
            <span style={{ color: C.muted, flexShrink: 0 }}>{label}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span
                style={{
                  color: C.text,
                  fontFamily: label === "Référence" || label === "Montant" ? MONO : undefined,
                  textAlign: "right",
                  wordBreak: "break-word",
                }}
              >
                {value}
              </span>
              {label === "Référence" ? <CopyButton value={value} label="" /> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProofCard({
  proof,
  onViewFull,
}: {
  proof: AdminPaymentProofDTO | null | "loading";
  onViewFull: () => void;
}) {
  const hasProof = proof && proof !== "loading";
  const isImage = hasProof && proof.mimeType.startsWith("image/");
  return (
    <div style={{ ...cardStyle, padding: 16, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Justificatif de paiement</span>
        {hasProof ? (
          <button
            type="button"
            onClick={onViewFull}
            style={{ fontSize: 11, color: C.accentText, background: "none", border: "none", cursor: "pointer" }}
          >
            Voir en grand
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={hasProof ? onViewFull : undefined}
        disabled={!hasProof}
        style={{
          flex: 1,
          minHeight: 96,
          borderRadius: 10,
          border: `1px solid ${C.borderInput}`,
          background:
            hasProof && isImage
              ? C.surfaceInput
              : "repeating-linear-gradient(135deg,#15161d,#15161d 8px,#121319 8px,#121319 16px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          color: C.faint,
          cursor: hasProof ? "pointer" : "default",
          padding: 10,
          overflow: "hidden",
        }}
      >
        {proof === "loading" ? (
          <span style={{ fontSize: 11.5 }}>Chargement…</span>
        ) : proof === null ? (
          <>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
            </svg>
            <span style={{ fontSize: 11 }}>En attente du justificatif</span>
          </>
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proofHref(proof)}
            alt="Justificatif de paiement"
            style={{ maxHeight: 130, maxWidth: "100%", objectFit: "contain", borderRadius: 6 }}
          />
        ) : (
          <>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span style={{ fontSize: 10.5, fontFamily: MONO }}>{proof.fileName}</span>
          </>
        )}
      </button>
    </div>
  );
}

function DeliverySection({
  order,
  delivered,
  canDeliver,
  available,
  entries,
  chosenIds,
  busy,
  manualMode,
  readyCodes,
  totalCodes,
  deliverReady,
  reloadlyChecks,
  onSetEntry,
  onDeliver,
}: {
  order: AdminOrderDTO;
  delivered: boolean;
  canDeliver: boolean;
  available: Record<string, AdminCodeDTO[]>;
  entries: Record<string, AssignmentEntry[]>;
  chosenIds: Set<string>;
  busy: boolean;
  manualMode: boolean;
  readyCodes: number;
  totalCodes: number;
  deliverReady: boolean;
  /** Per-orderItem Reloadly denomination check (mismatch warning before delivery). */
  reloadlyChecks: Record<string, { ok: boolean; message: string | null }>;
  onSetEntry: (itemId: string, index: number, entry: AssignmentEntry) => void;
  onDeliver: () => void;
}) {
  const editable = canDeliver && !delivered;

  return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Livraison des codes</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: manualMode ? C.muted : C.accentText,
            background: manualMode ? "rgba(255,255,255,0.06)" : C.accentSoft,
            borderRadius: 6,
            padding: "2px 8px",
          }}
        >
          {manualMode ? "Saisie manuelle" : "Stock automatique"}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: C.faint }}>
          {delivered ? "Livré" : `${readyCodes} / ${totalCodes} code${totalCodes > 1 ? "s" : ""} prêt${readyCodes > 1 ? "s" : ""}`}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {order.items.map((item) => {
          const stock = available[item.productId] ?? [];
          const list = entries[item.id] ?? [];
          const deliveredCodes = order.deliveredCodes.filter(
            (code) => code.orderItemId === item.id || code.productId === item.productId,
          );

          if (delivered) {
            return deliveredCodes.map((code, index) => (
              <CodeRow
                key={`${item.id}-${index}`}
                label={item.name}
                border={C.successBorder}
              >
                <span style={{ flex: 1, fontSize: 12.5, fontFamily: MONO, color: C.successText, wordBreak: "break-all" }}>
                  {code.code}
                </span>
                <CopyButton value={code.code} />
                <span style={{ fontSize: 11, color: C.successText, flexShrink: 0 }}>✓ livré</span>
              </CodeRow>
            ));
          }

          if (!editable) {
            // Not yet deliverable (payment not confirmed): show awaited slots.
            return Array.from({ length: item.quantity }).map((_, index) => (
              <CodeRow key={`${item.id}-${index}`} label={item.name} border={C.borderInput}>
                <span style={{ flex: 1, fontSize: 12.5, color: C.faint }}>En attente de confirmation</span>
                <span style={{ fontSize: 11, color: C.faint, flexShrink: 0 }}>#{index + 1}</span>
              </CodeRow>
            ));
          }

          return Array.from({ length: item.quantity }).map((_, index) => {
            const entry = list[index] ?? {};
            const filled = Boolean(
              entry.digitalCodeId || entry.manualCode?.trim() || entry.reloadlyProductId || entry.fazercards,
            );
            // Route fields are mapping-derived server-side (orders.ts):
            // present ⇔ an enabled, auto-fulfillable, non-failed mapping exists.
            const reloadlyAvailable = item.variantReloadlyProductId != null;
            const reloadlyChosen = Boolean(entry.reloadlyProductId);
            const fazercardsAvailable =
              item.variantFazercardsKind != null &&
              item.variantFazercardsCategoryId != null &&
              item.variantFazercardsOfferId != null;
            const fazercardsChosen = Boolean(entry.fazercards);
            const mismatch = reloadlyAvailable ? reloadlyChecks[item.id] : undefined;
            const showMismatch = Boolean(mismatch && mismatch.ok === false && mismatch.message);
            return (
              <Fragment key={`${item.id}-${index}`}>
              <CodeRow
                label={item.name}
                border={filled ? C.successBorder : C.accentBorder}
              >
                {reloadlyChosen ? (
                  <span style={{ flex: 1, fontSize: 12.5, color: C.accentText }}>
                    Livraison automatique via Reloadly
                  </span>
                ) : fazercardsChosen ? (
                  <span style={{ flex: 1, fontSize: 12.5, color: C.accentText }}>
                    Livraison automatique via FazerCards
                  </span>
                ) : manualMode ? (
                  <input
                    className="s4-input"
                    value={entry.manualCode ?? ""}
                    onChange={(event) => onSetEntry(item.id, index, { manualCode: event.target.value })}
                    placeholder="Saisir le code…"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: filled ? C.successText : C.text,
                      fontSize: 12.5,
                      fontFamily: MONO,
                    }}
                  />
                ) : (
                  <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select
                      value={entry.digitalCodeId ?? ""}
                      onChange={(event) =>
                        onSetEntry(item.id, index, event.target.value ? { digitalCodeId: event.target.value } : {})
                      }
                      style={{
                        flex: "1 1 140px",
                        minWidth: 0,
                        height: 28,
                        background: C.surfaceInput,
                        border: `1px solid ${C.borderInput}`,
                        borderRadius: 7,
                        color: C.text,
                        fontSize: 12,
                        padding: "0 8px",
                      }}
                    >
                      <option value="">Code en stock…</option>
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
                      onChange={(event) => onSetEntry(item.id, index, { manualCode: event.target.value })}
                      placeholder="ou saisir"
                      style={{
                        flex: "1 1 120px",
                        minWidth: 0,
                        height: 28,
                        background: "transparent",
                        border: `1px solid ${C.borderInput}`,
                        borderRadius: 7,
                        color: C.text,
                        fontSize: 12,
                        fontFamily: MONO,
                        padding: "0 8px",
                        outline: "none",
                      }}
                    />
                  </div>
                )}
                {reloadlyAvailable && (
                  <button
                    type="button"
                    onClick={() =>
                      onSetEntry(
                        item.id,
                        index,
                        reloadlyChosen ? {} : { reloadlyProductId: item.variantReloadlyProductId! },
                      )
                    }
                    style={{
                      flexShrink: 0,
                      height: 28,
                      padding: "0 10px",
                      borderRadius: 7,
                      fontSize: 11,
                      fontWeight: 600,
                      border: `1px solid ${reloadlyChosen ? C.accentBorder : C.borderInput}`,
                      background: reloadlyChosen ? C.accentSoft : "transparent",
                      color: reloadlyChosen ? C.accentText : C.muted,
                      cursor: "pointer",
                    }}
                  >
                    {reloadlyChosen ? "✕ Reloadly" : "⚡ Via Reloadly"}
                  </button>
                )}
                {fazercardsAvailable && (
                  <button
                    type="button"
                    onClick={() =>
                      onSetEntry(
                        item.id,
                        index,
                        fazercardsChosen
                          ? {}
                          : {
                              fazercards: {
                                kind: item.variantFazercardsKind!,
                                categoryId: item.variantFazercardsCategoryId!,
                                offerId: item.variantFazercardsOfferId!,
                              },
                            },
                      )
                    }
                    style={{
                      flexShrink: 0,
                      height: 28,
                      padding: "0 10px",
                      borderRadius: 7,
                      fontSize: 11,
                      fontWeight: 600,
                      border: `1px solid ${fazercardsChosen ? C.accentBorder : C.borderInput}`,
                      background: fazercardsChosen ? C.accentSoft : "transparent",
                      color: fazercardsChosen ? C.accentText : C.muted,
                      cursor: "pointer",
                    }}
                  >
                    {fazercardsChosen ? "✕ FazerCards" : "⚡ Via FazerCards"}
                  </button>
                )}
                <span style={{ fontSize: 11, color: filled ? C.successText : C.faint, flexShrink: 0 }}>
                  {filled ? "✓ prêt" : `#${index + 1}`}
                </span>
              </CodeRow>
              {showMismatch && (
                <div
                  style={{
                    margin: "-2px 0 8px",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "rgba(232,168,56,0.08)",
                    border: "1px solid rgba(232,168,56,0.28)",
                    color: "#F0C466",
                    fontSize: 12,
                    lineHeight: 1.45,
                  }}
                >
                  ⚠ {mismatch!.message} Corrigez la correspondance Reloadly ou la valeur de la
                  variante avant la livraison.
                </div>
              )}
              </Fragment>
            );
          });
        })}
      </div>

      {delivered ? (
        <div
          style={{
            marginTop: 14,
            borderRadius: 10,
            border: `1px solid ${C.successBorder}`,
            background: C.successSoft,
            padding: "11px 14px",
            fontSize: 12.5,
            color: C.successText,
          }}
        >
          Commande livrée. Le client peut consulter ses codes.
        </div>
      ) : (
        <>
          <button
            type="button"
            disabled={!deliverReady || busy}
            onClick={onDeliver}
            style={{
              marginTop: 14,
              width: "100%",
              height: 42,
              borderRadius: 10,
              border: "none",
              background: C.accent,
              color: "#fff",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: !deliverReady || busy ? "not-allowed" : "pointer",
              opacity: !deliverReady || busy ? 0.55 : 1,
            }}
          >
            {busy ? "Livraison en cours…" : "Livrer la commande et envoyer l'email"}
          </button>
          <div style={{ fontSize: 11.5, color: C.faint, textAlign: "center", marginTop: 8 }}>
            {canDeliver
              ? "Saisissez tous les codes pour activer la livraison"
              : "Confirmez le paiement puis saisissez les codes pour livrer"}
          </div>
        </>
      )}
    </div>
  );
}

function CodeRow({
  label,
  border,
  children,
}: {
  label: string;
  border: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "10px 12px",
        borderRadius: 10,
        background: C.surfaceInput,
        border: `1px solid ${border}`,
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: C.muted,
          width: 96,
          flexShrink: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={label}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/* ============================ right column cards ============================ */

function CustomerCard({
  name,
  email,
  total,
  itemCount,
}: {
  name: string;
  email: string;
  total: string;
  itemCount: number;
}) {
  return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: "linear-gradient(145deg,#2c3445,#171b26)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 600,
            color: C.accentText,
            flexShrink: 0,
          }}
        >
          {initialsOf(name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, wordBreak: "break-word" }}>{name}</div>
          <div style={{ fontSize: 11.5, color: C.faint, wordBreak: "break-all" }}>{email}</div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12.5,
          color: C.muted,
          paddingTop: 12,
          borderTop: `1px solid ${C.borderHairline}`,
        }}
      >
        <span>Cette commande</span>
        <span style={{ color: C.text }}>
          {itemCount} article{itemCount > 1 ? "s" : ""} · {total}
        </span>
      </div>
    </div>
  );
}

function TimelineCard({ order }: { order: AdminOrderDTO }) {
  const events = order.paymentEvents;
  return (
    <div style={{ ...cardStyle, padding: 16, flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 16 }}>Historique</div>
      {events.length === 0 ? (
        <p style={{ fontSize: 12.5, color: C.faint, margin: 0 }}>Aucun événement pour le moment.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {events.map((event, index) => {
            const dotTone = statusTone(event.toStatus ?? "");
            const last = index === events.length - 1;
            return (
              <div key={event.id} style={{ display: "flex", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: dotTone.color,
                      flexShrink: 0,
                      marginTop: 3,
                    }}
                  />
                  {!last ? <span style={{ width: 1.5, flex: 1, background: "rgba(255,255,255,0.08)" }} /> : null}
                </div>
                <div style={{ paddingBottom: last ? 0 : 16, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: C.text }}>
                    {event.note ??
                      (event.toStatus
                        ? orderStatusShort(event.toStatus)
                        : `${event.fromStatus ?? "Début"} → ${event.type}`)}
                  </div>
                  <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>{formatDate(event.createdAt)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DiscordCard({
  order,
  busy,
  onMarkSent,
}: {
  order: AdminOrderDTO;
  busy: boolean;
  onMarkSent: () => void;
}) {
  const d = order.discord;
  const canMarkSent = d.deliveryRequested && !!d.readyMessage && d.deliveryStatus !== "SENT";

  const connectionLabel =
    d.connection === "activated"
      ? "DM activé"
      : d.connection === "connected"
        ? "Connecté, DM non activé"
        : "Non connecté";

  const deliveryStatusMeta: Record<string, { label: string; color: string }> = {
    NOT_REQUESTED: { label: "—", color: C.faint },
    PENDING: { label: "En attente", color: C.warning },
    SENT: { label: "Envoyé", color: C.successText },
    FAILED: { label: "Échec", color: C.danger },
  };
  const statusMeta = deliveryStatusMeta[d.deliveryStatus] ?? {
    label: d.deliveryStatus,
    color: C.faint,
  };

  const row = (label: string, value: ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
      <span style={{ fontSize: 11.5, color: C.faint }}>{label}</span>
      <span style={{ fontSize: 12.5, color: C.text, fontWeight: 500, textAlign: "right" }}>{value}</span>
    </div>
  );

  return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="#5865F2" aria-hidden>
          <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.955 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
        </svg>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Discord</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {row("Compte", connectionLabel)}
        {row(
          "Livraison Discord",
          d.deliveryRequested ? "Demandée" : "Non demandée",
        )}
        {row(
          "Statut de livraison",
          <span style={{ color: statusMeta.color }}>{statusMeta.label}</span>,
        )}
        {d.deliveryStatus === "FAILED" && d.deliveryError ? (
          <p style={{ fontSize: 11.5, color: C.danger, margin: "2px 0 0" }}>
            Raison : {d.deliveryError}
          </p>
        ) : null}
        {d.deliveryRequested
          ? row(
              "Utilisateur Discord",
              d.username ? `@${d.username}` : <span style={{ color: C.faint }}>inconnu</span>,
            )
          : null}
        {d.deliverySentAt ? (
          <p style={{ fontSize: 11, color: C.faint, margin: "2px 0 0" }}>
            Envoyé le {formatDate(d.deliverySentAt)}
          </p>
        ) : null}
      </div>

      {/* Manual Discord delivery: the admin copies this message into Discord and
          marks it sent. No bot DM is triggered (automatic send was removed). */}
      {d.deliveryRequested && d.readyMessage ? (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11.5, color: C.faint }}>Message prêt à envoyer</span>
            <CopyButton value={d.readyMessage} label="Copier" />
          </div>
          <textarea
            readOnly
            value={d.readyMessage}
            rows={8}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              width: "100%",
              boxSizing: "border-box",
              resize: "vertical",
              fontSize: 11.5,
              lineHeight: 1.5,
              color: C.text,
              background: "rgba(0,0,0,0.2)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              padding: 10,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          />
          <button
            type="button"
            onClick={onMarkSent}
            disabled={busy || !canMarkSent}
            style={{
              alignSelf: "flex-start",
              fontSize: 12,
              fontWeight: 600,
              color: canMarkSent ? "#fff" : C.faint,
              background: canMarkSent ? "#5865F2" : "transparent",
              border: `1px solid ${canMarkSent ? "#5865F2" : "rgba(255,255,255,0.12)"}`,
              borderRadius: 8,
              padding: "6px 12px",
              cursor: busy || !canMarkSent ? "not-allowed" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {d.deliveryStatus === "SENT" ? "Déjà envoyé" : "Marquer comme envoyé"}
          </button>
        </div>
      ) : d.deliveryRequested ? (
        <p style={{ fontSize: 11.5, color: C.faint, margin: "12px 0 0" }}>
          Le message prêt à envoyer apparaîtra une fois la commande livrée (codes attribués).
        </p>
      ) : null}
    </div>
  );
}

function EmailsCard({ order }: { order: AdminOrderDTO }) {
  return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>Emails envoyés</div>
      {order.emailLogs.length === 0 ? (
        <p style={{ fontSize: 12.5, color: C.faint, margin: 0 }}>Aucun email journalisé.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {order.emailLogs.map((log) => {
            const sent = log.status === "sent";
            const failed = log.status === "failed";
            const iconColor = sent ? C.successText : failed ? C.danger : C.faint;
            return (
              <details key={log.id} style={{ borderRadius: 10, background: C.surfaceInput, border: `1px solid ${C.borderHairline}` }}>
                <summary
                  style={{
                    listStyle: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" style={{ flexShrink: 0 }}>
                    {sent ? (
                      <polyline points="20 6 9 17 4 12" />
                    ) : failed ? (
                      <>
                        <circle cx="12" cy="12" r="9" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </>
                    ) : (
                      <>
                        <circle cx="12" cy="12" r="9" />
                        <polyline points="12 7 12 12 15 14" />
                      </>
                    )}
                  </svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: C.text,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {log.subject}
                    </div>
                    <div style={{ fontSize: 11, color: C.faint }}>{formatDate(log.createdAt)}</div>
                  </div>
                </summary>
                <div style={{ borderTop: `1px solid ${C.borderHairline}`, padding: 12 }}>
                  <div style={{ fontSize: 11, color: C.faint, marginBottom: 8, wordBreak: "break-all" }}>
                    {log.recipient} · {log.provider || "simulation"} · {log.templateKey ?? log.type}
                  </div>
                  {log.errorMessage ? (
                    <div
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${C.dangerBorder}`,
                        background: "rgba(224,92,92,0.1)",
                        color: "#F0B4B4",
                        padding: "8px 10px",
                        fontSize: 11.5,
                        marginBottom: 8,
                      }}
                    >
                      {log.errorMessage}
                    </div>
                  ) : null}
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      fontSize: 11.5,
                      lineHeight: 1.55,
                      color: C.muted,
                      fontFamily: "inherit",
                      margin: 0,
                      maxHeight: 220,
                      overflow: "auto",
                    }}
                  >
                    {log.text || log.body}
                  </pre>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
