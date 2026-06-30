"use client";

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

type ReviewIntent = "reject" | "request_proof" | "refund_update";

const REVIEW_TEMPLATE_KEYS: Record<ReviewIntent, string> = {
  reject: "payment_rejected",
  request_proof: "new_proof_requested",
  refund_update: "refund_update",
};

/**
 * Best-effort reverse substitution: turn a rendered email (with the customer's
 * real values) back into a reusable template by replacing concrete values with
 * their `{{placeholder}}` so "Save as template" stays generic. Longest values
 * are replaced first to avoid partial collisions.
 */
function rerenderToTemplate(text: string, variables: Record<string, string>) {
  const entries = Object.entries(variables)
    .filter(([, value]) => value && value.trim().length >= 3)
    .sort((a, b) => b[1].length - a[1].length);
  let result = text;
  for (const [name, value] of entries) {
    result = result.split(value).join(`{{${name}}}`);
  }
  return result;
}

export default function OrderDetailPage({
  initialOrder,
}: {
  initialOrder: AdminOrderDTO;
}) {
  const { settings, saveSettings } = useStoreSettings();
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
  const [reviewEmail, setReviewEmail] = useState<{
    intent: ReviewIntent;
    title: string;
    subject: string;
    text: string;
    reason: string;
    edited: boolean;
  } | null>(null);
  const [templateSaved, setTemplateSaved] = useState(false);
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

  async function openReviewEmail(intent: ReviewIntent, title: string) {
    setBusy(true);
    setError("");
    setMessage("");
    setTemplateSaved(false);
    try {
      const preview = await getPaymentEmailPreviewAction(order.id, intent);
      setReviewEmail({
        intent,
        title,
        subject: preview.subject,
        text: preview.text,
        reason: "",
        edited: false,
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
        reviewEmail.edited,
      ),
    );
    setReviewEmail(null);
  }

  async function saveReviewAsTemplate() {
    if (!reviewEmail) return;
    const key = REVIEW_TEMPLATE_KEYS[reviewEmail.intent];
    const variables: Record<string, string> = {
      customer_name: order.customerName,
      order_number: order.id,
      total: `${order.totalMad} MAD`,
      support_email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? settings.footer.contactEmail,
      support_whatsapp: settings.footer.whatsappNumber,
      reason: reviewEmail.reason,
    };
    setBusy(true);
    setError("");
    setTemplateSaved(false);
    const result = await saveSettings({
      ...settings,
      emailTemplates: {
        ...settings.emailTemplates,
        [key]: {
          subject: rerenderToTemplate(reviewEmail.subject, variables),
          body: rerenderToTemplate(reviewEmail.text, variables),
        },
      },
    });
    setBusy(false);
    if (result.ok) {
      setTemplateSaved(true);
    } else {
      setError(result.error ?? "Enregistrement du modèle impossible.");
    }
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Détail de commande admin</p>
          <h1 className="mt-1 text-3xl font-bold text-white">
            Commande {orderNumber(order.id)}
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
        <SummaryCard label="Client" value={order.customerName} detail={order.customerEmail} />
        <SummaryCard label="Date" value={formatDate(order.createdAt)} />
        <SummaryCard label="Total" value={formatMAD(order.totalMad)} />
        <SummaryCard
          label="Livraison"
          value={delivered ? "Livrée" : canDeliver ? "Prête à livrer" : "En attente"}
          detail={METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="card overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-bold text-white">Articles commandés</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted">
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 font-medium">Produit</th>
                    <th className="px-5 py-3 font-medium">Qté</th>
                    <th className="px-5 py-3 font-medium">Prix unitaire</th>
                    <th className="px-5 py-3 font-medium">Total</th>
                    <th className="px-5 py-3 font-medium">Code attribué</th>
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
                            <span className="text-xs text-faint">Non attribué</span>
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
              allFilled={manualMode ? manualCountsValid : allFilled}
              manualMode={manualMode}
              onSetEntry={setEntry}
              onDeliver={handleDeliver}
              onSaveDraft={() => {
                setError("");
                setMessage("Draft codes saved on this page. Deliver when ready.");
              }}
            />
          ) : null}

          <TimelineSection order={order} />
          <EmailLogsSection order={order} />
        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="font-bold text-white">Paiement</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <InfoRow label="Mode" value={METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod} />
              <InfoRow label="Statut" value={orderStatusShort(order.status)} />
              <InfoRow label="Soumis" value={submittedAt ? formatDate(submittedAt) : "Non soumis"} />
              <InfoRow label="Confirmé" value={confirmedAt ? formatDate(confirmedAt) : "Non confirmé"} />
              {issueReason ? <InfoRow label="Motif" value={issueReason} /> : null}
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
                    runAction("Paiement confirmé.", () => approvePaymentAction(order.id))
                  }
                  className="btn-primary w-full justify-center disabled:opacity-50"
                >
                  Confirmer le paiement
                </button>
              ) : null}
              {canIssue ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openReviewEmail("request_proof", "Demander un nouveau justificatif")}
                  className="w-full rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                >
                  Signaler un problème de paiement
                </button>
              ) : null}
              {canReject ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openReviewEmail("reject", "Refuser le paiement")}
                  className="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                >
                  Refuser la commande
                </button>
              ) : null}
              {canDeliver ? (
                <a href="#assign-codes" className="btn-ghost block w-full text-center">
                  Attribuer et livrer les codes
                </a>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setNextStatus(order.status === "delivered" ? "payment_confirmed" : order.status);
                  setStatusModalOpen(true);
                }}
                className="btn-ghost w-full justify-center disabled:opacity-50"
              >
                Changer le statut
              </button>
              <OrderDetailDeleteTools
                orderId={order.id}
                onError={(errorMessage) => setError(errorMessage)}
              />
            </div>
            <p className="mt-3 text-xs text-muted">
              L'annulation et les notes internes ne sont pas configurées dans le flux actuel.
            </p>
          </section>
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

              {/* Real, editable preview: edits happen inline inside the rendered
                  email and apply only to this send. */}
              <div className="rounded-xl border border-border bg-white p-5 text-[#0a0b0d] shadow-card">
                <div className="flex items-center justify-between gap-3 border-b border-black/10 pb-3 text-xs text-[#5a6573]">
                  <span>
                    De&nbsp;: ghost.ma &lt;no-reply@ghost.ma&gt;
                  </span>
                  <span>À&nbsp;: {order.customerEmail}</span>
                </div>
                <input
                  value={reviewEmail.subject}
                  onChange={(event) =>
                    setReviewEmail((current) =>
                      current
                        ? { ...current, subject: event.target.value, edited: true }
                        : current,
                    )
                  }
                  aria-label="Sujet de l'email"
                  className="mt-3 w-full border-0 bg-transparent p-0 text-lg font-semibold text-[#0a0b0d] outline-none focus:ring-0"
                />
                <textarea
                  value={reviewEmail.text}
                  onChange={(event) =>
                    setReviewEmail((current) =>
                      current
                        ? { ...current, text: event.target.value, edited: true }
                        : current,
                    )
                  }
                  aria-label="Corps de l'email"
                  rows={12}
                  className="mt-3 min-h-64 w-full resize-y whitespace-pre-wrap border-0 bg-transparent p-0 text-sm leading-relaxed text-[#1f2733] outline-none focus:ring-0"
                />
              </div>
              <p className="text-xs text-muted">
                Cliquez directement dans l'aperçu pour modifier le sujet ou le
                message. Les changements s'appliquent uniquement à cet envoi, sauf
                si vous enregistrez le modèle.
                {reviewEmail.edited ? " • Modifié" : ""}
                {templateSaved ? " • Modèle enregistré" : ""}
              </p>

              <div className="grid gap-2 sm:grid-cols-3">
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
                  onClick={saveReviewAsTemplate}
                  className="btn-ghost w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Enregistrer comme modèle
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
        <h2 className="font-bold text-white">Justificatif de paiement</h2>
      </div>
      <div className="px-5 py-5">
        {proof === "loading" ? (
          <p className="text-sm text-muted">Chargement du justificatif...</p>
        ) : proof === null ? (
          <p className="text-sm text-muted">Aucun justificatif téléchargé.</p>
        ) : (
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <InfoRow label="Nom du fichier" value={proof.fileName} />
              <InfoRow label="Importé le" value={formatDate(proof.uploadedAt)} />
              <InfoRow label="Type de fichier" value={proof.mimeType} />
              <InfoRow label="Taille" value={formatBytes(proof.sizeBytes)} />
            </dl>

            {isImage ? (
              <div className="rounded-xl border border-border bg-surface p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={href}
                  alt="Justificatif de paiement"
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
                Ouvrir le PDF
              </a>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <a href={href} target="_blank" rel="noreferrer" className="btn-ghost">
                Ouvrir le justificatif
              </a>
              <a href={href} download={proof.fileName} className="btn-ghost">
                Télécharger le justificatif
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
  manualMode,
  onSetEntry,
  onDeliver,
  onSaveDraft,
}: {
  order: AdminOrderDTO;
  delivered: boolean;
  available: Record<string, AdminCodeDTO[]>;
  entries: Record<string, AssignmentEntry[]>;
  chosenIds: Set<string>;
  busy: boolean;
  allFilled: boolean;
  manualMode: boolean;
  onSetEntry: (itemId: string, index: number, entry: AssignmentEntry) => void;
  onDeliver: () => Promise<void>;
  onSaveDraft: () => void;
}) {
  function updateManualCodes(itemId: string, quantity: number, value: string) {
    const lines = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, quantity);
    for (let index = 0; index < quantity; index += 1) {
      onSetEntry(itemId, index, lines[index] ? { manualCode: lines[index] } : {});
    }
  }

  return (
    <section id="assign-codes" className="card overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-bold text-white">
          {manualMode ? "Saisir et livrer les codes" : "Attribuer et livrer les codes"}
        </h2>
        {manualMode ? (
          <p className="mt-1 text-xs text-muted">
            La saisie manuelle est active. Le stock ne sera ni réservé ni consommé.
          </p>
        ) : null}
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
                  {item.quantity} unité{item.quantity === 1 ? "" : "s"} · {stock.length} disponible{stock.length === 1 ? "" : "s"}
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
              ) : manualMode ? (
                <div className="mt-4">
                  <label className="mb-2 block text-xs font-medium text-muted">
                    Collez un code par ligne
                  </label>
                  <textarea
                    value={(entries[item.id] ?? [])
                      .slice(0, item.quantity)
                      .map((entry) => entry.manualCode ?? "")
                      .join("\n")}
                    onChange={(event) =>
                      updateManualCodes(item.id, item.quantity, event.target.value)
                    }
                    rows={Math.max(3, item.quantity + 1)}
                    placeholder={Array.from({ length: item.quantity }, (_, index) =>
                      index === 0 ? "AAAA-BBBB-CCCC" : "DDDD-EEEE-FFFF",
                    ).join("\n")}
                    className="input min-h-28 py-3 font-mono text-sm"
                  />
                  <p className="mt-2 text-xs text-muted">
                    Requis : {item.quantity} code{item.quantity === 1 ? "" : "s"}. Saisi(s) :{" "}
                    {(entries[item.id] ?? [])
                      .slice(0, item.quantity)
                      .filter((entry) => entry.manualCode?.trim()).length}
                  </p>
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
                          <option value="">Choisir un code en stock...</option>
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

        {!delivered ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {manualMode ? (
              <button
                type="button"
                disabled={busy}
                onClick={onSaveDraft}
                className="btn-ghost w-full disabled:opacity-50"
              >
                Enregistrer le brouillon
              </button>
            ) : null}
            <button
              type="button"
              disabled={!allFilled || busy}
              onClick={onDeliver}
              className={`${manualMode ? "" : "sm:col-span-2"} btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {busy ? "Livraison en cours..." : "Livrer les codes"}
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
            Livré. Le client peut consulter le code attribué.
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
        <h2 className="font-bold text-white">Historique</h2>
      </div>
      <div className="px-5 py-5">
        {order.paymentEvents.length === 0 ? (
          <p className="text-sm text-muted">Aucun événement pour le moment.</p>
        ) : (
          <ol className="space-y-4">
            {order.paymentEvents.map((event) => (
              <li key={event.id} className="flex gap-3">
                <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />
                <div>
                  <p className="text-sm text-white">
                    {event.note ??
                      `${event.fromStatus ?? "Début"} → ${event.toStatus ?? event.type}`}
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

function EmailLogsSection({ order }: { order: AdminOrderDTO }) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-bold text-white">Emails transactionnels</h2>
      </div>
      <div className="divide-y divide-border">
        {order.emailLogs.length === 0 ? (
          <p className="px-5 py-5 text-sm text-muted">Aucun email journalisé.</p>
        ) : (
          order.emailLogs.map((log) => (
            <article key={log.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{log.subject}</p>
                  <p className="mt-1 text-xs text-muted">
                    {log.recipient} · {formatDate(log.createdAt)}
                  </p>
                </div>
                <span
                  className={`chip ${
                    log.status === "sent"
                      ? "border-green-500/30 text-green-400"
                      : log.status === "failed"
                        ? "border-red-500/30 text-red-400"
                        : "border-amber-500/30 text-amber-300"
                  }`}
                >
                  {log.status}
                </span>
              </div>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                <InfoRow label="Provider" value={log.provider || "simulation"} />
                <InfoRow label="Message ID" value={log.providerMessageId ?? "Non disponible"} />
                <InfoRow label="Template" value={log.templateKey ?? log.type} />
              </dl>
              {log.errorMessage ? (
                <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {log.errorMessage}
                </p>
              ) : null}
              <details className="mt-3 rounded-xl border border-border bg-surface">
                <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-muted">
                  Voir le snapshot rendu
                </summary>
                <div className="space-y-3 border-t border-border p-4">
                  <pre className="whitespace-pre-wrap text-xs leading-relaxed text-muted">
                    {log.text || log.body}
                  </pre>
                  {log.html ? (
                    <div className="rounded-lg border border-border bg-base p-3 text-xs text-muted">
                      <p className="mb-2 font-semibold text-white">HTML</p>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap">
                        {log.html}
                      </pre>
                    </div>
                  ) : null}
                </div>
              </details>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
