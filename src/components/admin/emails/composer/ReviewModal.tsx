"use client";

import { useState } from "react";
import ModalFrame from "./ModalFrame";
import type { ValidationResult } from "./validation";

export type SendSummaryData = {
  ok: boolean;
  error?: string;
  recipientCount: number;
  customerCount: number;
  manualCount: number;
  creditPerRecipientMad: number;
  creditRecipientCount: number;
  totalCreditMad: number;
  blockedCreditCount: number;
  missingVariablesByRecipient: { email: string; missing: string[] }[];
};

export type SendResultData = {
  ok: boolean;
  error?: string;
  sendId?: string;
  sentCount?: number;
  failedCount?: number;
  creditGrantedMad?: number;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium text-text">{value}</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-center">
      <div className={`font-mono text-lg font-semibold ${tone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted">{label}</div>
    </div>
  );
}

export default function ReviewModal({
  open,
  sheet,
  summary,
  validation,
  subject,
  templateLabel,
  moduleCount,
  onSend,
  onClose,
  onGoToSend,
}: {
  open: boolean;
  sheet: boolean;
  summary: SendSummaryData;
  validation: ValidationResult;
  subject: string;
  templateLabel: string;
  moduleCount: number;
  onSend: () => Promise<SendResultData>;
  onClose: () => void;
  onGoToSend: (sendId: string) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [phase, setPhase] = useState<"idle" | "sending" | "done">("idle");
  const [result, setResult] = useState<SendResultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const hasCredit = summary.totalCreditMad > 0;
  const blocked = validation.blockingCount > 0 || (hasCredit && !confirmed);

  const close = () => {
    setPhase("idle");
    setConfirmed(false);
    setResult(null);
    setError(null);
    onClose();
  };

  const send = async () => {
    setPhase("sending");
    setError(null);
    const res = await onSend();
    if (res.ok) {
      setResult(res);
      setPhase("done");
    } else {
      setError(res.error ?? "Échec de l'envoi.");
      setPhase("idle");
    }
  };

  const sendLabel = hasCredit
    ? `Envoyer à ${summary.recipientCount} destinataire(s) et accorder ${summary.totalCreditMad} DH`
    : `Envoyer à ${summary.recipientCount} destinataire(s)`;

  return (
    <ModalFrame
      title={phase === "done" ? "Envoi terminé" : "Vérifier et envoyer"}
      sheet={sheet}
      dismissable={phase !== "sending"}
      onClose={close}
      footer={
        phase === "done" ? (
          <div className="flex flex-wrap justify-end gap-2">
            {result?.sendId && (
              <button type="button" onClick={() => onGoToSend(result.sendId!)} className="btn-primary text-sm">Voir l&apos;envoi</button>
            )}
            <button type="button" onClick={close} className="btn-ghost text-sm">Terminer</button>
          </div>
        ) : phase === "sending" ? null : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={close} className="btn-ghost text-sm">Annuler</button>
            <button
              type="button"
              onClick={send}
              disabled={blocked}
              className={`btn-primary text-sm ${blocked ? "cursor-not-allowed opacity-50" : ""}`}
            >
              {sendLabel}
            </button>
          </div>
        )
      }
    >
      {phase === "sending" ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-sm text-muted">Envoi en cours…</p>
        </div>
      ) : phase === "done" && result ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="E-mails envoyés" value={result.sentCount ?? 0} tone="text-emerald-300" />
            <Stat label="Crédits accordés" value={`${result.creditGrantedMad ?? 0} DH`} tone="text-amber-300" />
            <Stat label="Sans crédit" value={summary.blockedCreditCount} tone="text-muted" />
            <Stat label="Échecs" value={result.failedCount ?? 0} tone={(result.failedCount ?? 0) > 0 ? "text-red-300" : "text-muted"} />
          </div>
          <p className="text-xs text-muted">L&apos;envoi a été enregistré dans l&apos;historique.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-surface p-3">
            <Row label="Objet" value={subject || "(vide)"} />
            <Row label="Modèle" value={templateLabel} />
            <Row label="Destinataires" value={`${summary.recipientCount} (${summary.customerCount} client(s), ${summary.manualCount} manuelle(s))`} />
            <Row label="Modules inclus" value={String(moduleCount)} />
            <Row label="Envoi" value="Immédiat" />
          </div>

          {hasCredit && (
            <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3">
              <p className="text-xs text-amber-100">
                Cette action ajoutera <strong>{summary.totalCreditMad} DH</strong> de crédit Ghost au total sur{" "}
                <strong>{summary.creditRecipientCount}</strong> compte(s) client(s).
                {summary.blockedCreditCount > 0 && ` ${summary.blockedCreditCount} adresse(s) sans compte n'en recevront pas.`}
              </p>
              <label className="mt-2 flex items-start gap-2 text-xs text-amber-100">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-amber-400"
                />
                <span>Je confirme l&apos;ajout de crédit Ghost réel aux comptes clients éligibles.</span>
              </label>
            </div>
          )}

          <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
            validation.blockingCount > 0
              ? "border-red-400/40 bg-red-400/10 text-red-200"
              : validation.reviewCount > 0
                ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                : "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
          }`}>
            {validation.blockingCount > 0
              ? `${validation.blockingCount} problème(s) bloquant(s) — corrigez avant d'envoyer.`
              : validation.reviewCount > 0
                ? `${validation.reviewCount} point(s) à vérifier (envoi possible).`
                : "Tout est prêt pour l'envoi."}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </ModalFrame>
  );
}
