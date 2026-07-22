"use client";

import { useCallback, useRef, useState } from "react";
import {
  submitRefundInfoAction,
  type RefundAttachmentInput,
  type RefundTokenContext,
} from "@/app/actions/refunds";

/**
 * Secure "provide more information" page. The customer uploads the requested
 * screenshot(s) and an optional message; on submit the case moves to
 * "Réponse reçue" and the admin is alerted. Single-use: the token is consumed.
 */
export default function RefundInfoPage({
  token,
  ctx,
}: {
  token: string;
  ctx: RefundTokenContext;
}) {
  const [attachments, setAttachments] = useState<RefundAttachmentInput[]>([]);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
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
        if (!res.ok) setError(json?.error || "Import impossible.");
        else setAttachments((prev) => [...prev, json as RefundAttachmentInput].slice(0, 6));
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, []);

  const submit = async () => {
    setError("");
    if (attachments.length === 0 && message.trim().length < 3) {
      setError("Ajoutez une capture d’écran ou un message.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitRefundInfoAction({ token, attachments, message: message || null });
      if (res.ok) setDone(true);
      else setError(res.error || "Envoi impossible.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-green-500/15 text-2xl">
          ✓
        </div>
        <h1 className="text-xl font-semibold text-foreground">Merci !</h1>
        <p className="mt-2 text-sm text-muted">
          Vos informations ont bien été transmises. Notre équipe poursuit l’examen de votre demande
          {" "}
          {ctx.refundNumber}.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-xl font-semibold text-foreground">Informations complémentaires</h1>
      <p className="mt-1 text-sm text-muted">
        Demande {ctx.refundNumber} · Commande {ctx.orderNumber}
      </p>

      {ctx.requestedInfo && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm text-foreground">
          <div className="mb-1 text-xs font-medium text-muted">Ce qui est demandé</div>
          <p className="whitespace-pre-wrap">{ctx.requestedInfo}</p>
        </div>
      )}

      <label className="mt-6 block text-sm font-medium text-foreground">
        Ajouter une capture d’écran
      </label>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="mt-1.5 w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-foreground"
      />
      {uploading && <p className="mt-1 text-xs text-accent">Import en cours…</p>}
      {attachments.length > 0 && (
        <ul className="mt-2 space-y-1">
          {attachments.map((a, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground"
            >
              <span className="truncate">{a.fileName}</span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                className="ml-2 text-muted hover:text-red-400"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="mt-4 block text-sm font-medium text-foreground">Message (facultatif)</label>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        className="mt-1.5 w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
      />

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={submitting || uploading}
        className="btn-primary mt-5 w-full disabled:opacity-60"
      >
        {submitting ? "Envoi…" : "Envoyer les informations"}
      </button>
    </main>
  );
}
