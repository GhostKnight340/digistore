"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RefundEmailComposer from "./RefundEmailComposer";
import {
  addRefundNoteAction,
  assignRefundAction,
  cancelRefundAction,
  closeRefundAction,
  issueGhostCreditAction,
  logWhatsappOpenedAction,
  markRefundSentAction,
  markReplacementDeliveredAction,
  reopenRefundAction,
  startRefundReviewAction,
  startReplacementAction,
} from "@/app/actions/adminRefunds";
import {
  refundReasonLabel,
  refundResolutionLabel,
  refundSourceLabel,
  refundStatusBadgeClass,
  refundStatusLabel,
} from "@/lib/refunds/status";
import type { RefundEmailTemplateKey } from "@/lib/refunds/emailShared";
import { orderStatusLabel } from "@/lib/orderStatus";
import { formatMAD } from "@/lib/format";
import { formatAdminDateTime } from "@/components/admin/clients/shared";
import type { RefundCaseDetail } from "@/lib/db/refundsQuery";
import type { RefundStatus } from "@/lib/types";

type MethodOpt = { id: string; name: string };

const DECISION_STATES: RefundStatus[] = [
  "REQUESTED",
  "UNDER_REVIEW",
  "INFORMATION_REQUIRED",
  "CUSTOMER_RESPONDED",
];

function templatesForStatus(status: RefundStatus): RefundEmailTemplateKey[] {
  if (DECISION_STATES.includes(status)) return ["info_required", "approved", "not_eligible"];
  return ["refund_sent", "credit_issued", "replacement_delivered"];
}

export default function RefundCaseView({
  detail,
  paymentMethods,
  whatsappNumber,
}: {
  detail: RefundCaseDetail;
  paymentMethods: MethodOpt[];
  whatsappNumber: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | "refund_sent" | "replacement_delivered">(null);
  const refresh = useCallback(() => router.refresh(), [router]);

  const methodName = (id: string) => paymentMethods.find((m) => m.id === id)?.name ?? id;

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await fn();
        refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const { status, order, customer, eligibility, resolution } = detail;

  return (
    <div className="admin-panel-pad">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/refunds" className="text-xs text-muted hover:text-foreground">
            ← Retour aux remboursements
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">{detail.number}</h1>
            <span className={`chip border ${refundStatusBadgeClass(status)}`}>
              {refundStatusLabel(status)}
            </span>
            {detail.legacy && (
              <span className="chip border border-amber-500/40 text-amber-400">
                Historique sans dossier détaillé
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted">
            Créée le {formatAdminDateTime(detail.createdAt)} · {refundSourceLabel(detail.source)} ·{" "}
            {ageLabel(detail.ageHours)}
            {detail.assignedAdminName ? ` · Assignée à ${detail.assignedAdminName}` : ""}
          </div>
        </div>
      </div>

      {/* Workflow actions */}
      <div className="mb-5 flex flex-wrap gap-2">
        {status === "REQUESTED" && (
          <ActionButton
            label="Commencer l’examen"
            busy={busy}
            onClick={() => run(() => startRefundReviewAction(detail.id))}
          />
        )}
        {status === "CHOICE_RECEIVED" && resolution?.type === "ORIGINAL_PAYMENT_METHOD" && (
          <ActionButton
            primary
            label="Marquer le remboursement comme envoyé"
            busy={busy}
            onClick={() => setDialog("refund_sent")}
          />
        )}
        {status === "REFUND_PROCESSING" && (
          <ActionButton
            primary
            label="Marquer comme remboursée"
            busy={busy}
            onClick={() => setDialog("refund_sent")}
          />
        )}
        {status === "CHOICE_RECEIVED" && resolution?.type === "GHOST_CREDIT" && (
          <ActionButton
            primary
            label="Créditer le compte Ghost"
            busy={busy}
            onClick={() => run(() => issueGhostCreditAction(detail.id, true))}
          />
        )}
        {status === "CHOICE_RECEIVED" && resolution?.type === "REPLACEMENT_PRODUCT" && (
          <ActionButton
            primary
            label="Traiter le remplacement"
            busy={busy}
            onClick={() => run(() => startReplacementAction(detail.id))}
          />
        )}
        {status === "REPLACEMENT_PENDING" && (
          <ActionButton
            primary
            label="Marquer le remplacement comme livré"
            busy={busy}
            onClick={() => setDialog("replacement_delivered")}
          />
        )}
        {["REFUNDED", "CREDITED", "REPLACED", "NOT_ELIGIBLE", "CANCELLED"].includes(status) &&
          !detail.closedAt && (
            <ActionButton
              label="Fermer le dossier"
              busy={busy}
              onClick={() => run(() => closeRefundAction(detail.id))}
            />
          )}
        {["NOT_ELIGIBLE", "CANCELLED"].includes(status) && (
          <ActionButton
            label="Rouvrir"
            busy={busy}
            onClick={() => run(() => reopenRefundAction(detail.id))}
          />
        )}
        {!["REFUNDED", "CREDITED", "REPLACED", "NOT_ELIGIBLE", "CANCELLED"].includes(status) && (
          <ActionButton
            danger
            label="Annuler la demande"
            busy={busy}
            onClick={() => run(() => cancelRefundAction(detail.id))}
          />
        )}
        {!detail.assignedAdminName && (
          <ActionButton
            label="M’assigner"
            busy={busy}
            onClick={() => run(() => assignRefundAction(detail.id))}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
        {/* Left column */}
        <div className="space-y-4">
          {/* Request summary */}
          <Panel title="Demande">
            <Field label="Motif">{refundReasonLabel(detail.reason)}</Field>
            <Field label="Montant demandé">{formatMAD(detail.requestedAmountMad)}</Field>
            <Field label="Explication du client">
              <span className="whitespace-pre-wrap">{detail.description}</span>
            </Field>
            {detail.attachments.length > 0 && (
              <div className="mt-2">
                <div className="text-xs text-muted">Pièces jointes</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {detail.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-border px-2.5 py-1 text-xs text-accent"
                    >
                      {a.uploadedBy === "CUSTOMER" ? "Client" : "Admin"} · {a.fileName}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          {/* Customer */}
          <Panel title="Client">
            <Field label="Nom">{customer.name}</Field>
            <Field label="E-mail">
              <span className="flex items-center gap-2">
                {customer.email}
                <CopyButton value={customer.email} />
              </span>
            </Field>
            {customer.phone && (
              <Field label="Téléphone">
                <span className="flex items-center gap-2">
                  {customer.phone}
                  <CopyButton value={customer.phone} />
                </span>
              </Field>
            )}
            <Field label="Type de compte">
              {customer.isGuest ? "Invité" : "Compte client"} · {customer.totalOrders} commande(s)
              {customer.previousRefundRequests > 0
                ? ` · ${customer.previousRefundRequests} demande(s) précédente(s)`
                : ""}
            </Field>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={`mailto:${customer.email}`}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground"
              >
                Envoyer un e-mail
              </a>
              {customer.phone && (
                <a
                  href={whatsappHref(whatsappNumber, customer, detail)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => void logWhatsappOpenedAction(detail.id)}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground"
                >
                  Contacter sur WhatsApp
                </a>
              )}
              {customer.id && (
                <Link
                  href={`/admin/clients/${customer.id}`}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground"
                >
                  Ouvrir le client
                </Link>
              )}
            </div>
          </Panel>

          {/* Order */}
          <Panel title="Commande">
            <Field label="N° commande">
              <Link href={`/admin/orders/${order.id}`} className="text-accent">
                {order.number}
              </Link>{" "}
              · {orderStatusLabel(order.status)}
            </Field>
            <Field label="Paiement">
              {methodName(order.paymentMethod)} · {formatMAD(order.totalMad)}
              {order.paymentConfirmedAt ? ` · confirmé le ${formatAdminDateTime(order.paymentConfirmedAt)}` : ""}
            </Field>
            {order.paymentProof && <Field label="Justificatif">{order.paymentProof.fileName}</Field>}
            <div className="mt-2 space-y-1">
              {order.items.map((it, i) => (
                <div key={i} className="text-sm text-foreground">
                  {it.productName}
                  {it.variantName ? ` · ${it.variantName}` : ""}
                  {it.region ? ` · ${it.region}` : ""} × {it.quantity} —{" "}
                  {formatMAD(it.unitPriceMad)}
                </div>
              ))}
            </div>
            <Field label="Livraison">
              {order.delivered
                ? `Livrée${order.deliveredAt ? ` le ${formatAdminDateTime(order.deliveredAt)}` : ""}`
                : "Non livrée"}
            </Field>
            {order.supplierReferences.length > 0 && (
              <Field label="Fournisseur">{order.supplierReferences.join(", ")}</Field>
            )}
          </Panel>

          {/* Eligibility signals */}
          <Panel title="Contexte d’éligibilité">
            <p className="mb-2 text-xs text-muted">
              Signaux factuels — aucune décision automatique. Vous confirmez toujours.
            </p>
            <Signal label="Code livré" value={eligibility.codeDelivered} />
            <Signal label="Paiement confirmé" value={eligibility.paymentConfirmed} />
            <Signal label="Justificatif présent" value={eligibility.hasPaymentProof} />
            <Signal
              label="Paiement en double possible"
              value={eligibility.possibleDuplicatePayment}
              warnWhenTrue
            />
            <Signal
              label="Validation fournisseur disponible"
              value={eligibility.supplierValidationAvailable}
            />
            <Signal
              label="Demande de remboursement précédente"
              value={eligibility.previousRefundRequests > 0}
              warnWhenTrue
            />
          </Panel>

          {/* Resolution */}
          {resolution && (
            <Panel title="Résolution">
              <Field label="Type">{refundResolutionLabel(resolution.type)}</Field>
              <Field label="Montant">{formatMAD(resolution.amountMad)}</Field>
              {resolution.replacementLabel && (
                <Field label="Produit de remplacement">{resolution.replacementLabel}</Field>
              )}
              {resolution.originalPaymentMethod && (
                <Field label="Moyen d’origine">{methodName(resolution.originalPaymentMethod)}</Field>
              )}
              {resolution.transactionReference && (
                <Field label="Référence">{resolution.transactionReference}</Field>
              )}
              <Field label="Choisi par">
                {resolution.selectedByCustomer ? "Client" : "Admin"}
                {resolution.selectedAt ? ` le ${formatAdminDateTime(resolution.selectedAt)}` : ""}
              </Field>
              {resolution.processedAt && (
                <Field label="Traité">
                  {formatAdminDateTime(resolution.processedAt)}
                  {resolution.processedByName ? ` par ${resolution.processedByName}` : ""}
                </Field>
              )}
              {resolution.proofUrl && (
                <a
                  href={resolution.proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent"
                >
                  Preuve de remboursement
                </a>
              )}
            </Panel>
          )}

          {detail.supportRating && (
            <Panel title="Avis du client sur l’assistance">
              <div className="text-sm text-foreground">
                {detail.supportRating === "up" ? "👍 Positif" : "👎 Négatif"}
              </div>
              {detail.supportComment && (
                <p className="mt-1 text-sm text-muted">{detail.supportComment}</p>
              )}
            </Panel>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <RefundEmailComposer
            requestId={detail.id}
            recipientEmail={customer.email}
            recipientName={customer.name}
            templates={templatesForStatus(status)}
            onSent={refresh}
          />

          <NotesPanel requestId={detail.id} notes={detail.notes} onAdded={refresh} />

          <TimelinePanel detail={detail} />
        </div>
      </div>

      {dialog === "refund_sent" && (
        <MarkRefundSentDialog
          detail={detail}
          methodName={methodName}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {dialog === "replacement_delivered" && (
        <ReplacementDeliveredDialog
          requestId={detail.id}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ── Presentational bits ──────────────────────────────────────────────────────
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-1.5 grid grid-cols-[130px_1fr] gap-2 text-sm">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-foreground">{children}</span>
    </div>
  );
}

function Signal({
  label,
  value,
  warnWhenTrue,
}: {
  label: string;
  value: boolean;
  warnWhenTrue?: boolean;
}) {
  const tone = value
    ? warnWhenTrue
      ? "text-amber-400"
      : "text-green-400"
    : "text-muted";
  return (
    <div className="flex items-center justify-between border-b border-border/40 py-1 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className={tone}>{value ? "Oui" : "Non"}</span>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  busy,
  primary,
  danger,
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  const cls = primary
    ? "btn-primary"
    : danger
      ? "rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
      : "rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-accent/[0.05]";
  return (
    <button type="button" onClick={onClick} disabled={busy} className={`${cls} disabled:opacity-50`}>
      {label}
    </button>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="text-xs text-accent"
    >
      {copied ? "Copié" : "Copier"}
    </button>
  );
}

function ageLabel(hours: number): string {
  if (hours < 1) return "à l’instant";
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} j`;
}

function whatsappHref(number: string, customer: { name: string }, detail: RefundCaseDetail): string {
  const phone = detail.customer.phone?.replace(/[^\d]/g, "") || number.replace(/[^\d]/g, "");
  const text = `Bonjour ${customer.name}, nous vous contactons concernant votre demande de remboursement ${detail.number} liée à la commande ${detail.order.number}.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

// ── Notes ────────────────────────────────────────────────────────────────────
function NotesPanel({
  requestId,
  notes,
  onAdded,
}: {
  requestId: string;
  notes: RefundCaseDetail["notes"];
  onAdded: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (body.trim().length < 2) return;
    setBusy(true);
    try {
      await addRefundNoteAction(requestId, body.trim());
      setBody("");
      onAdded();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Notes internes (jamais visibles par le client)">
      <div className="space-y-2">
        {notes.length === 0 && <p className="text-xs text-muted">Aucune note.</p>}
        {notes.map((n) => (
          <div key={n.id} className="rounded-lg bg-background/60 p-2">
            <div className="text-xs text-muted">
              {n.authorName} · {formatAdminDateTime(n.createdAt)}
            </div>
            <div className="whitespace-pre-wrap text-sm text-foreground">{n.body}</div>
          </div>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Ajouter une note interne…"
        className="mt-2 w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground"
      />
      <button
        type="button"
        onClick={add}
        disabled={busy}
        className="mt-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
      >
        Ajouter la note
      </button>
    </Panel>
  );
}

// ── Timeline (events + messages merged) ──────────────────────────────────────
function TimelinePanel({ detail }: { detail: RefundCaseDetail }) {
  const entries = [
    ...detail.events.map((e) => ({
      at: e.createdAt,
      kind: "event" as const,
      title: eventLabel(e.type),
      sub: e.actorName ?? e.actorType,
    })),
    ...detail.messages.map((m) => ({
      at: m.createdAt,
      kind: "message" as const,
      title: `${channelLabel(m.channel)}${m.subject ? ` — ${m.subject}` : ""}`,
      sub: `${m.sentByName ?? ""}${m.deliveryResult ? ` · ${m.deliveryResult}` : ""}`,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Panel title="Historique du dossier">
      <ol className="space-y-2">
        {entries.map((e, i) => (
          <li key={i} className="border-l-2 border-border pl-3">
            <div className="text-sm text-foreground">{e.title}</div>
            <div className="text-xs text-muted">
              {formatAdminDateTime(e.at)}
              {e.sub ? ` · ${e.sub}` : ""}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

const EVENT_LABELS: Record<string, string> = {
  requested: "Demande créée",
  review_started: "Examen commencé",
  info_requested: "Informations demandées",
  info_received: "Informations reçues du client",
  approved: "Demande acceptée",
  rejected: "Demande refusée",
  choice_submitted: "Choix de résolution reçu",
  refund_sent: "Remboursement envoyé",
  credit_issued: "Crédit Ghost émis",
  replacement_selected: "Remplacement en traitement",
  replacement_delivered: "Remplacement livré",
  cancelled: "Demande annulée",
  closed: "Dossier fermé",
  note_added: "Note interne ajoutée",
  email_sent: "E-mail envoyé",
  whatsapp_opened: "WhatsApp ouvert",
  legacy_backfill: "Dossier historique importé",
};
function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type;
}
function channelLabel(channel: string): string {
  switch (channel) {
    case "EMAIL":
      return "E-mail";
    case "WHATSAPP":
      return "WhatsApp";
    case "SYSTEM":
      return "Message client";
    default:
      return channel;
  }
}

// ── Processing dialogs ───────────────────────────────────────────────────────
function MarkRefundSentDialog({
  detail,
  methodName,
  onClose,
  onDone,
}: {
  detail: RefundCaseDetail;
  methodName: (id: string) => string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(detail.resolution?.amountMad ?? detail.requestedAmountMad));
  const [reference, setReference] = useState("");
  const [processedDate, setProcessedDate] = useState("");
  const [note, setNote] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const method = detail.resolution?.originalPaymentMethod ?? detail.order.paymentMethod;

  const uploadProof = async (file: File | null) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/refund/attachment", { method: "POST", body: fd });
    const json = await res.json();
    if (res.ok) setProofUrl(json.url);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await markRefundSentAction(detail.id, {
        amountMad: Math.round(Number(amount)) || detail.requestedAmountMad,
        method: methodName(method),
        transactionReference: reference || undefined,
        processedDate: processedDate || undefined,
        proofUrl: proofUrl || undefined,
        note: note || undefined,
        notify,
      });
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Marquer le remboursement comme envoyé" onClose={onClose}>
      <DialogField label="Montant (MAD)">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
          className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground"
        />
      </DialogField>
      <DialogField label="Moyen">{methodName(method)}</DialogField>
      <DialogField label="Référence de transaction">
        <input value={reference} onChange={(e) => setReference(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground" />
      </DialogField>
      <DialogField label="Date de traitement">
        <input
          type="date"
          value={processedDate}
          onChange={(e) => setProcessedDate(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground"
        />
      </DialogField>
      <DialogField label="Preuve (facultatif)">
        <input type="file" accept="image/*,application/pdf" onChange={(e) => uploadProof(e.target.files?.[0] ?? null)} />
        {proofUrl && <span className="text-xs text-green-400"> Ajoutée</span>}
      </DialogField>
      <DialogField label="Note interne">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground" />
      </DialogField>
      <label className="mt-2 flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        Notifier le client par e-mail
      </label>
      <DialogButtons busy={busy} onClose={onClose} onSubmit={submit} submitLabel="Confirmer l’envoi" />
    </Dialog>
  );
}

function ReplacementDeliveredDialog({
  requestId,
  onClose,
  onDone,
}: {
  requestId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [replacementOrderId, setReplacementOrderId] = useState("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await markReplacementDeliveredAction(requestId, {
        replacementOrderId: replacementOrderId || undefined,
        note: note || undefined,
        notify,
      });
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Marquer le remplacement comme livré" onClose={onClose}>
      <p className="text-xs text-muted">
        Confirmez uniquement une fois le produit de remplacement réellement livré au client.
      </p>
      <DialogField label="Commande de remplacement (facultatif)">
        <input
          value={replacementOrderId}
          onChange={(e) => setReplacementOrderId(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground"
        />
      </DialogField>
      <DialogField label="Note interne">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground" />
      </DialogField>
      <label className="mt-2 flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        Notifier le client par e-mail
      </label>
      <DialogButtons busy={busy} onClose={onClose} onSubmit={submit} submitLabel="Confirmer la livraison" />
    </Dialog>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function DialogField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <label className="block text-xs font-medium text-muted">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function DialogButtons({
  busy,
  onClose,
  onSubmit,
  submitLabel,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <div className="mt-5 flex gap-3">
      <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-border py-2 text-sm text-muted">
        Annuler
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy}
        className="btn-primary flex-1 disabled:opacity-60"
      >
        {busy ? "…" : submitLabel}
      </button>
    </div>
  );
}
