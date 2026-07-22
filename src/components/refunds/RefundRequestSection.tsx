"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOrderRefundSummaryAction,
  requestRefundAction,
  type CustomerRefundSummary,
  type RefundAttachmentInput,
} from "@/app/actions/refunds";
import { REFUND_REASONS, REFUND_REASON_LABELS, refundStatusBadgeClass } from "@/lib/refunds/status";

/**
 * Customer refund entry point on the order (payment) page. Self-contained: it
 * loads its own summary so the host page needs only to mount it. Shows the
 * request status when one exists, otherwise a low-emphasis "Demander un
 * remboursement" action that opens the request modal. Never promises
 * eligibility — the copy states the request will be reviewed.
 */
export default function RefundRequestSection({ orderRef }: { orderRef: string }) {
  const [summary, setSummary] = useState<CustomerRefundSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<{ number: string } | null>(null);

  const load = useCallback(async () => {
    const s = await getOrderRefundSummaryAction(orderRef);
    setSummary(s);
  }, [orderRef]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!summary) return null;

  const active = summary.activeRequest;

  return (
    <>
      {active ? (
        <div className="rounded-2xl border border-white/[0.07] bg-[#0F1015] px-[18px] py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[13px] font-semibold text-white">Demande de remboursement</div>
            <span
              className={`chip ${refundStatusBadgeClass(active.status)} !border !bg-transparent text-[11px]`}
            >
              {active.statusLabel}
            </span>
          </div>
          <div className="mt-1 text-xs text-[#9AA0AC]">
            {active.number} — notre équipe examine votre demande et vous contactera si besoin.
          </div>
        </div>
      ) : summary.canRequest ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mx-auto flex items-center gap-1.5 py-1 text-[13px] font-medium text-[#7A808C] transition-colors hover:text-[#9FB8FF]"
        >
          Demander un remboursement
        </button>
      ) : null}

      {open && (
        <RefundRequestModal
          orderRef={orderRef}
          onClose={() => setOpen(false)}
          onDone={(number) => {
            setOpen(false);
            setDone({ number });
            void load();
          }}
        />
      )}

      {done && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0F1015] p-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[rgba(46,204,113,0.12)] text-2xl">
              ✓
            </div>
            <h2 className="text-lg font-semibold text-white">Demande envoyée</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#C4C9D4]">
              Votre demande de remboursement a bien été envoyée. Notre équipe va l’examiner et vous
              contactera si des informations supplémentaires sont nécessaires.
            </p>
            <p className="mt-2 text-xs text-[#7A808C]">Référence : {done.number}</p>
            <button
              type="button"
              onClick={() => setDone(null)}
              className="btn-primary mt-5 w-full"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function RefundRequestModal({
  orderRef,
  onClose,
  onDone,
}: {
  orderRef: string;
  onClose: () => void;
  onDone: (number: string) => void;
}) {
  const [reason, setReason] = useState<string>("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [attachments, setAttachments] = useState<RefundAttachmentInput[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 6)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/refund/attachment", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error || "Import impossible.");
          continue;
        }
        setAttachments((prev) => [...prev, json as RefundAttachmentInput].slice(0, 6));
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, []);

  const submit = useCallback(async () => {
    setError("");
    if (!reason) {
      setError("Merci de sélectionner un motif.");
      return;
    }
    if (description.trim().length < 10) {
      setError("Merci de décrire le problème (au moins 10 caractères).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await requestRefundAction({
        orderRef,
        reason,
        description,
        phone: phone.trim() || null,
        attachments,
      });
      if (res.ok) {
        onDone(res.number);
      } else {
        setError(res.error);
      }
    } finally {
      setSubmitting(false);
    }
  }, [reason, description, phone, attachments, orderRef, onDone]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/[0.08] bg-[#0F1015] p-6 sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-white">Demander un remboursement</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[#7A808C] transition-colors hover:text-white"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[#9AA0AC]">
          Votre demande sera examinée par notre équipe. Le remboursement n’est pas automatique —
          consultez notre{" "}
          <a href="/refunds" target="_blank" className="text-[#9FB8FF] underline">
            politique de remboursement
          </a>
          .
        </p>

        <label className="mt-4 block text-[13px] font-medium text-[#C4C9D4]">Motif</label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#07080A] px-3 py-2.5 text-sm text-white outline-none focus:border-[#3E7BFA]"
        >
          <option value="">Sélectionnez un motif…</option>
          {REFUND_REASONS.map((r) => (
            <option key={r} value={r}>
              {REFUND_REASON_LABELS[r]}
            </option>
          ))}
        </select>

        <label className="mt-4 block text-[13px] font-medium text-[#C4C9D4]">
          Décrivez le problème
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Expliquez ce qui s’est passé (code invalide, produit non reçu, etc.)."
          className="mt-1.5 w-full resize-none rounded-xl border border-white/[0.1] bg-[#07080A] px-3 py-2.5 text-sm text-white outline-none focus:border-[#3E7BFA]"
        />

        <label className="mt-4 block text-[13px] font-medium text-[#C4C9D4]">
          Téléphone (facultatif)
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+212 …"
          className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#07080A] px-3 py-2.5 text-sm text-white outline-none focus:border-[#3E7BFA]"
        />

        <label className="mt-4 block text-[13px] font-medium text-[#C4C9D4]">
          Captures d’écran (facultatif)
        </label>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="mt-1.5 w-full text-xs text-[#9AA0AC] file:mr-3 file:rounded-lg file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-white"
        />
        {uploading && <p className="mt-1 text-xs text-[#9FB8FF]">Import en cours…</p>}
        {attachments.length > 0 && (
          <ul className="mt-2 space-y-1">
            {attachments.map((a, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs text-[#C4C9D4]"
              >
                <span className="truncate">{a.fileName}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  className="ml-2 text-[#7A808C] hover:text-[#E88B8B]"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-[#E88B8B]/30 bg-[#E88B8B]/10 px-3 py-2 text-xs text-[#E88B8B]">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/[0.1] py-2.5 text-sm font-medium text-[#C4C9D4] transition-colors hover:bg-white/[0.04]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || uploading}
            className="btn-primary flex-1 disabled:opacity-60"
          >
            {submitting ? "Envoi…" : "Envoyer la demande"}
          </button>
        </div>
      </div>
    </div>
  );
}
