"use client";

import { useState } from "react";
import ModalFrame from "./ModalFrame";

/** Test-email flow — never grants credit, never mutates orders. */
export default function TestModal({
  open,
  sheet,
  defaultAddress,
  previewName,
  onSend,
  onClose,
}: {
  open: boolean;
  sheet: boolean;
  defaultAddress: string;
  previewName: string;
  onSend: (address: string) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const [address, setAddress] = useState(defaultAddress);
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<string>("");

  if (!open) return null;

  const close = () => {
    setPhase("idle");
    setError(null);
    onClose();
  };

  const send = async () => {
    setPhase("sending");
    setError(null);
    const res = await onSend(address.trim());
    if (res.ok) {
      setSentAt(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
      setPhase("sent");
    } else {
      setError(res.error ?? "Échec de l'envoi du test.");
      setPhase("idle");
    }
  };

  return (
    <ModalFrame
      title="Envoyer un e-mail de test"
      sheet={sheet}
      dismissable={phase !== "sending"}
      onClose={close}
      footer={
        phase === "sent" ? (
          <div className="flex justify-end">
            <button type="button" onClick={close} className="btn-primary text-sm">Terminer</button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="btn-ghost text-sm">Annuler</button>
            <button type="button" onClick={send} disabled={phase === "sending" || !address.trim()} className="btn-primary text-sm">
              {phase === "sending" ? "Envoi…" : "Envoyer le test"}
            </button>
          </div>
        )
      }
    >
      {phase === "sent" ? (
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <p className="text-sm text-text">Test envoyé à <strong>{address}</strong></p>
          <p className="mt-1 text-xs text-muted">à {sentAt}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Adresse de test</label>
            <input className="input text-sm" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="vous@ghost.ma" />
          </div>
          <p className="text-xs text-muted">
            Aperçu personnalisé avec les données de <strong className="text-text">{previewName}</strong>.
          </p>
          <div className="rounded-xl border border-border bg-surface p-3 text-xs text-muted">
            Cet envoi de test n&apos;ajoutera aucun crédit Ghost et ne modifiera aucune commande.
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </ModalFrame>
  );
}
