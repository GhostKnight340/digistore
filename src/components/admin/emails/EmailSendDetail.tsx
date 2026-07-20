"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { retryRecipientAction } from "@/app/actions/adminEmails";
import type { SendDetail } from "@/lib/email/adminEmailService";

const CREDIT_LABELS: Record<string, string> = {
  none: "—",
  granted: "Crédité",
  blocked_no_account: "Bloqué (pas de compte)",
  display_only: "Affichage seul",
  failed: "Échec crédit",
};

function statusTone(status: string): string {
  return status === "sent"
    ? "text-emerald-400"
    : status === "failed"
      ? "text-red-400"
      : status === "pending"
        ? "text-muted"
        : "text-amber-400";
}

export default function EmailSendDetail({
  detail,
  canRetry,
}: {
  detail: SendDetail;
  canRetry: boolean;
}) {
  const router = useRouter();
  const [retrying, setRetrying] = useState<string | null>(null);

  const retry = async (recipientId: string) => {
    setRetrying(recipientId);
    try {
      await retryRecipientAction(detail.id, recipientId);
      router.refresh();
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="min-w-0">
      <div className="mb-4">
        <Link href="/admin/emails/history" className="text-sm text-muted hover:text-text">← Historique</Link>
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-white">{detail.subject || "(sans objet)"}</h1>
          <p className="text-sm text-muted">
            {detail.preheader}
            {detail.isTest && <span className="ml-2 rounded bg-surface2 px-1.5 py-0.5 text-[10px]">TEST</span>}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-3">
          <div>Statut : <span className={statusTone(detail.status)}>{detail.status}</span></div>
          <div>Par : {detail.createdByAdminName}</div>
          <div>Destinataires : {detail.recipientCount}</div>
          <div>Envoyés : {detail.sentCount}</div>
          <div>Échecs : {detail.failedCount}</div>
          <div>Crédit total : {detail.creditGrantedMad} DH</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* Recipients */}
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr className="border-b border-border">
                <th className="px-3 py-2">Destinataire</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Crédit</th>
                <th className="px-3 py-2">ID fournisseur</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {detail.recipients.map((r) => (
                <tr key={r.id} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-2">
                    <div className="text-text">
                      {r.customerId ? (
                        <Link href={`/admin/clients/${r.customerId}`} className="text-accent hover:underline">
                          {r.name || r.email}
                        </Link>
                      ) : (
                        r.name || r.email
                      )}
                    </div>
                    {r.name && <div className="text-xs text-muted">{r.email}</div>}
                    {r.errorMessage && <div className="mt-1 text-xs text-red-400">{r.errorMessage}</div>}
                  </td>
                  <td className={`px-3 py-2 ${statusTone(r.status)}`}>{r.status}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.creditAmountMad ? `${r.creditAmountMad} DH · ` : ""}
                    {CREDIT_LABELS[r.creditStatus] ?? r.creditStatus}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted">{r.providerMessageId ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {r.status === "failed" && canRetry && (
                      <button
                        type="button"
                        onClick={() => retry(r.id)}
                        disabled={retrying === r.id}
                        className="btn-ghost text-xs"
                      >
                        {retrying === r.id ? "…" : "Réessayer"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Final rendered content */}
        <div className="card overflow-hidden">
          <div className="border-b border-border p-3 text-sm font-semibold text-text">Contenu final</div>
          {detail.sampleHtml ? (
            <iframe title="Contenu envoyé" srcDoc={detail.sampleHtml} className="h-[560px] w-full bg-white" sandbox="" />
          ) : (
            <p className="p-4 text-sm text-muted">Aucun rendu disponible.</p>
          )}
        </div>
      </div>
    </div>
  );
}
