"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteDraftAction } from "@/app/actions/adminEmails";
import type { HistoryRow } from "@/lib/email/adminEmailService";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

export default function EmailDraftsView({ drafts, canCompose }: { drafts: HistoryRow[]; canCompose: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const remove = async (id: string) => {
    if (!window.confirm("Supprimer définitivement ce brouillon ?")) return;
    setBusyId(id);
    try {
      const res = await deleteDraftAction(id);
      if (res.ok) router.refresh();
      else window.alert(res.error ?? "Échec de la suppression.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-w-0">
      <div className="mb-1">
        <Link href="/admin/emails/compose" className="text-sm text-muted hover:text-text">← Composeur</Link>
      </div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-white">Brouillons</h1>
          <p className="text-sm text-muted">Reprenez un e-mail enregistré ou supprimez-le.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/emails/history" className="btn-ghost text-sm">Historique</Link>
          {canCompose && <Link href="/admin/emails/compose" className="btn-primary text-sm">Nouvel e-mail</Link>}
        </div>
      </div>

      {drafts.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-muted">Aucun brouillon enregistré.</p>
          {canCompose && (
            <Link href="/admin/emails/compose" className="btn-primary mt-3 inline-flex text-sm">Composer un e-mail</Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {drafts.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
              <Link href={`/admin/emails/compose?draft=${d.id}`} className="min-w-0 flex-1 hover:opacity-90">
                <span className="block truncate text-sm text-text">{d.subject || "(sans objet)"}</span>
                <span className="text-xs text-muted">Modifié le {fmtDate(d.createdAt)}</span>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <Link href={`/admin/emails/compose?draft=${d.id}`} className="btn-ghost text-xs">Ouvrir</Link>
                {canCompose && (
                  <button type="button" onClick={() => remove(d.id)} disabled={busyId === d.id} className="rounded-lg px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                    {busyId === d.id ? "…" : "Supprimer"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
