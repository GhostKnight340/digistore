"use client";

import Link from "next/link";
import type { HistoryRow } from "@/lib/email/adminEmailService";

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  processing: "En cours",
  partial: "Partiellement envoyé",
  sent: "Envoyé",
  failed: "Échec",
};

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "sent"
      ? "bg-emerald-500/15 text-emerald-400"
      : status === "failed"
        ? "bg-red-500/15 text-red-400"
        : status === "partial"
          ? "bg-amber-500/15 text-amber-400"
          : "bg-surface2 text-muted";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{STATUS_LABELS[status] ?? status}</span>;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

export default function EmailHistoryView({
  history,
  drafts,
}: {
  history: HistoryRow[];
  drafts: HistoryRow[];
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1">
        <Link href="/admin/emails/compose" className="text-sm text-muted hover:text-text">← Composeur</Link>
      </div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-white">Historique des e-mails</h1>
        <div className="flex items-center gap-2">
          <Link href="/admin/emails/drafts" className="btn-ghost text-sm">Brouillons</Link>
          <Link href="/admin/emails/compose" className="btn-primary text-sm">Nouvel e-mail</Link>
        </div>
      </div>

      {drafts.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-muted">Brouillons</h2>
          <div className="space-y-2">
            {drafts.map((d) => (
              <Link
                key={d.id}
                href={`/admin/emails/compose?draft=${d.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:bg-surface2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-text">{d.subject || "(sans objet)"}</span>
                  <span className="text-xs text-muted">Modifié le {fmtDate(d.createdAt)}</span>
                </span>
                <StatusBadge status="draft" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr className="border-b border-border">
              <th className="px-4 py-3">Objet</th>
              <th className="px-4 py-3">Modèle</th>
              <th className="px-4 py-3">Par</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Dest.</th>
              <th className="px-4 py-3 text-right">Envoyés</th>
              <th className="px-4 py-3 text-right">Échecs</th>
              <th className="px-4 py-3 text-right">Crédit</th>
              <th className="px-4 py-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {history.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface2/50">
                <td className="px-4 py-3">
                  <Link href={`/admin/emails/history/${r.id}`} className="text-accent hover:underline">
                    {r.subject || "(sans objet)"}
                  </Link>
                  {r.isTest && <span className="ml-2 rounded bg-surface2 px-1.5 py-0.5 text-[10px] text-muted">TEST</span>}
                </td>
                <td className="px-4 py-3 text-muted">{r.templateKey}</td>
                <td className="px-4 py-3 text-muted">{r.createdByAdminName}</td>
                <td className="px-4 py-3 text-muted">{fmtDate(r.createdAt)}</td>
                <td className="px-4 py-3 text-right">{r.recipientCount}</td>
                <td className="px-4 py-3 text-right text-emerald-400">{r.sentCount}</td>
                <td className="px-4 py-3 text-right text-red-400">{r.failedCount}</td>
                <td className="px-4 py-3 text-right">{r.creditGrantedMad ? `${r.creditGrantedMad} DH` : "—"}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted">Aucun envoi pour le moment.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {history.map((r) => (
          <Link
            key={r.id}
            href={`/admin/emails/history/${r.id}`}
            className="block rounded-xl border border-border bg-surface p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm text-text">{r.subject || "(sans objet)"}</span>
              <StatusBadge status={r.status} />
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
              <span>{fmtDate(r.createdAt)}</span>
              <span>· {r.sentCount}/{r.recipientCount} envoyés</span>
              {r.creditGrantedMad > 0 && <span>· {r.creditGrantedMad} DH crédit</span>}
              {r.isTest && <span>· TEST</span>}
            </div>
          </Link>
        ))}
        {history.length === 0 && <p className="text-center text-sm text-muted">Aucun envoi.</p>}
      </div>
    </div>
  );
}
