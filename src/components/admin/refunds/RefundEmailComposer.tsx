"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getRefundEmailDefaultsAction,
  previewRefundEmailAction,
  sendRefundEmailAction,
  type RefundEmailPayload,
} from "@/app/actions/adminRefunds";
import {
  REFUND_EMAIL_TEMPLATE_LABELS,
  REFUND_REJECTION_REASONS,
  type RefundEmailTemplateKey,
} from "@/lib/refunds/emailShared";
import { REFUND_RESOLUTION_LABELS } from "@/lib/refunds/status";
import type { RefundResolutionType } from "@/lib/types";

const RESOLUTION_KEYS: RefundResolutionType[] = [
  "ORIGINAL_PAYMENT_METHOD",
  "GHOST_CREDIT",
  "REPLACEMENT_PRODUCT",
];

/**
 * Built-in refund email composer. The preview and the delivered email are
 * produced by the SAME server renderer (renderRefundEmail), so what the admin
 * sees is exactly what is sent. Sending a workflow template (info/approved/
 * not-eligible) also drives the matching status transition server-side.
 */
export default function RefundEmailComposer({
  requestId,
  recipientEmail,
  recipientName,
  templates,
  onSent,
}: {
  requestId: string;
  recipientEmail: string;
  recipientName: string;
  templates: RefundEmailTemplateKey[];
  onSent: () => void;
}) {
  const [templateKey, setTemplateKey] = useState<RefundEmailTemplateKey>(templates[0]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [offered, setOffered] = useState<RefundResolutionType[]>(["ORIGINAL_PAYMENT_METHOD"]);
  const [allowSameVariant, setAllowSameVariant] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDefaults = useCallback(
    async (key: RefundEmailTemplateKey, reason?: string) => {
      const d = await getRefundEmailDefaultsAction(requestId, key, { rejectionReason: reason });
      if (d) {
        setSubject(d.subject);
        setBody(d.body);
      }
    },
    [requestId],
  );

  useEffect(() => {
    void loadDefaults(templateKey, rejectionReason);
    setPreviewHtml(null);
    setStatus("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey]);

  const payload = (): RefundEmailPayload => ({
    subject,
    body,
    rejectionReason: templateKey === "not_eligible" ? rejectionReason : undefined,
    offeredResolutions: templateKey === "approved" ? offered : undefined,
    allowSameVariantReplacement: templateKey === "approved" ? allowSameVariant : undefined,
  });

  const preview = async () => {
    setBusy(true);
    try {
      const r = await previewRefundEmailAction(requestId, templateKey, payload());
      setPreviewHtml(r?.html ?? null);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    setStatus("");
    try {
      const r = await sendRefundEmailAction(requestId, templateKey, payload());
      if (r.ok) {
        setStatus(r.status === "simulated" ? "Envoyé (simulé hors production)." : "E-mail envoyé.");
        onSent();
      } else {
        setStatus(r.error || "Envoi impossible.");
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleOffered = (t: RefundResolutionType) =>
    setOffered((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-foreground">Composer un e-mail</h3>
      <div className="mt-1 text-xs text-muted">
        À : {recipientName} · {recipientEmail}
      </div>

      <label className="mt-3 block text-xs font-medium text-muted">Modèle</label>
      <select
        value={templateKey}
        onChange={(e) => setTemplateKey(e.target.value as RefundEmailTemplateKey)}
        className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground"
      >
        {templates.map((t) => (
          <option key={t} value={t}>
            {REFUND_EMAIL_TEMPLATE_LABELS[t]}
          </option>
        ))}
      </select>

      {templateKey === "not_eligible" && (
        <>
          <label className="mt-3 block text-xs font-medium text-muted">Motif du refus (requis)</label>
          <select
            value={REFUND_REJECTION_REASONS.includes(rejectionReason) ? rejectionReason : ""}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground"
          >
            <option value="">Choisir ou saisir un motif…</option>
            {REFUND_REJECTION_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={2}
            placeholder="Motif communiqué au client"
            className="mt-1.5 w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground"
          />
        </>
      )}

      {templateKey === "approved" && (
        <div className="mt-3">
          <div className="text-xs font-medium text-muted">Solutions proposées au client</div>
          <div className="mt-1.5 space-y-1.5">
            {RESOLUTION_KEYS.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={offered.includes(t)}
                  onChange={() => toggleOffered(t)}
                />
                {REFUND_RESOLUTION_LABELS[t]}
              </label>
            ))}
          </div>
          {offered.includes("REPLACEMENT_PRODUCT") && (
            <label className="mt-1.5 flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={allowSameVariant}
                onChange={(e) => setAllowSameVariant(e.target.checked)}
              />
              Autoriser le même produit dans les remplacements
            </label>
          )}
        </div>
      )}

      <label className="mt-3 block text-xs font-medium text-muted">Objet</label>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground"
      />

      <label className="mt-3 block text-xs font-medium text-muted">Message</label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={7}
        className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground"
      />

      {status && <p className="mt-2 text-xs text-accent">{status}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={preview}
          disabled={busy}
          className="rounded-lg border border-border px-3 py-2 text-sm text-muted disabled:opacity-50"
        >
          Aperçu
        </button>
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="btn-primary flex-1 disabled:opacity-60"
        >
          {busy ? "…" : "Envoyer"}
        </button>
      </div>

      {previewHtml && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-muted">Aperçu (identique à l’e-mail envoyé)</div>
          <iframe
            title="Aperçu de l’e-mail"
            srcDoc={previewHtml}
            className="h-[420px] w-full rounded-lg border border-border bg-white"
          />
        </div>
      )}
    </div>
  );
}
