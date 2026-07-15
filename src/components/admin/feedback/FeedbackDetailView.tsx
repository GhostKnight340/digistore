"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  feedbackTypeLabel,
  FEEDBACK_STATUSES,
  FEEDBACK_PRIORITIES,
} from "@/lib/feedback";
import type { FeedbackDetailDTO } from "@/lib/feedbackDto";
import {
  setFeedbackStatusAction,
  setFeedbackPriorityAction,
  assignFeedbackAction,
  addFeedbackNoteAction,
  linkFeedbackEntityAction,
  convertFeedbackToSupportAction,
} from "@/app/actions/feedback";
import { formatAdminDateTime } from "@/components/admin/clients/shared";
import { FeedbackStatusBadge, FeedbackPriorityBadge } from "./badges";

export default function FeedbackDetailView({ detail }: { detail: FeedbackDetailDTO }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [linkType, setLinkType] = useState("product");
  const [linkRef, setLinkRef] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (!r.ok) setMsg(r.error ?? "Action impossible.");
      else {
        if (ok) setMsg(ok);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0">
      <Link href="/admin/feedback" className="text-sm text-accent hover:text-accent-hover">
        ← Tous les retours
      </Link>

      <header className="mt-3 flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-faint">{detail.reference}</span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
              {feedbackTypeLabel(detail.type)}
            </span>
            <FeedbackStatusBadge status={detail.status} />
            <FeedbackPriorityBadge priority={detail.priority} />
          </div>
          <h1 className="mt-2 text-xl font-semibold text-white">{detail.subject}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="input h-9 w-auto text-sm"
            value={detail.status}
            disabled={busy}
            aria-label="Statut"
            onChange={(e) => run(() => setFeedbackStatusAction(detail.id, e.target.value))}
          >
            {FEEDBACK_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            className="input h-9 w-auto text-sm"
            value={detail.priority}
            disabled={busy}
            aria-label="Priorité"
            onChange={(e) => run(() => setFeedbackPriorityAction(detail.id, e.target.value))}
          >
            {FEEDBACK_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </header>

      {msg && <p className="mt-3 text-sm text-accent">{msg}</p>}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Message">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{detail.message}</p>
          </Card>

          {detail.attachments.length > 0 && (
            <Card title="Pièces jointes">
              <div className="flex flex-wrap gap-3">
                {detail.attachments.map((a) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.fileName} className="h-28 w-28 rounded-lg border border-border object-cover" />
                    <span className="mt-1 block max-w-28 truncate text-xs text-faint">{a.fileName}</span>
                  </a>
                ))}
              </div>
            </Card>
          )}

          {/* Notes */}
          <Card title="Notes internes (privées)">
            <div className="mb-3 space-y-2">
              <textarea
                className="input min-h-[70px]"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note interne — jamais visible par le client"
                aria-label="Nouvelle note"
              />
              <button
                type="button"
                className="btn-primary text-sm"
                disabled={busy || !note.trim()}
                onClick={() =>
                  run(async () => {
                    const r = await addFeedbackNoteAction(detail.id, note);
                    if (r.ok) setNote("");
                    return r;
                  })
                }
              >
                Ajouter une note
              </button>
            </div>
            {detail.notes.length === 0 ? (
              <p className="text-sm text-faint">Aucune note.</p>
            ) : (
              <ul className="space-y-2">
                {detail.notes.map((n) => (
                  <li key={n.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="mb-1 text-xs text-faint">
                      {n.authorName} · {formatAdminDateTime(n.createdAt)}
                    </div>
                    <p className="whitespace-pre-wrap text-white">{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Activity */}
          <Card title="Historique">
            {detail.activity.length === 0 ? (
              <p className="text-sm text-faint">Aucune activité.</p>
            ) : (
              <ul className="divide-y divide-border/60 text-sm">
                {detail.activity.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-muted">{activityLabel(e.action, e.metadata)}</span>
                    <span className="shrink-0 text-xs text-faint">
                      {e.actorName} · {formatAdminDateTime(e.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card title="Auteur">
            <Row label="Nom" value={detail.senderName} />
            <Row label="E-mail" value={detail.senderEmail || "—"} />
            <Row label="Type de compte" value={detail.isGuest ? "Visiteur" : "Client connecté"} />
            <Row label="Peut être contacté" value={detail.contactAllowed ? "Oui" : "Non"} />
            {detail.customerId && (
              <Link href={`/admin/clients/${detail.customerId}`} className="mt-2 inline-block text-sm text-accent hover:text-accent-hover">
                Voir la fiche client →
              </Link>
            )}
          </Card>

          <Card title="Attribution">
            <p className="mb-2 text-sm text-muted">
              {detail.assignedAdminName ? `Attribué à ${detail.assignedAdminName}` : "Non attribué"}
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost text-sm" disabled={busy}
                onClick={() => run(() => assignFeedbackAction(detail.id, true))}>
                M’attribuer
              </button>
              {detail.assignedAdminId && (
                <button type="button" className="btn-ghost text-sm" disabled={busy}
                  onClick={() => run(() => assignFeedbackAction(detail.id, false))}>
                  Retirer
                </button>
              )}
            </div>
          </Card>

          <Card title="Contexte technique">
            <Row label="Page" value={detail.relatedRoute ?? "—"} />
            {detail.relatedUrl && <Row label="URL" value={detail.relatedUrl} />}
            <Row label="Titre" value={detail.pageTitle ?? "—"} />
            <Row label="Appareil" value={detail.deviceType ?? "—"} />
            <Row label="Écran" value={detail.viewport ?? "—"} />
            <Row label="Navigateur" value={detail.browserSummary ?? "—"} />
            <Row label="Version" value={detail.deploymentVersion ?? "—"} />
            <Row label="Reçu le" value={formatAdminDateTime(detail.createdAt)} />
          </Card>

          <Card title="Lier / convertir">
            <div className="space-y-2">
              <div className="flex gap-2">
                <select className="input h-9 w-auto text-sm" value={linkType} onChange={(e) => setLinkType(e.target.value)} aria-label="Type d’entité">
                  <option value="product">Produit</option>
                  <option value="guide">Guide</option>
                  <option value="collection">Collection</option>
                  <option value="order">Commande</option>
                  <option value="customer">Client</option>
                  <option value="roadmap">Roadmap</option>
                </select>
                <input className="input" value={linkRef} onChange={(e) => setLinkRef(e.target.value)} placeholder="Référence" aria-label="Référence de l’entité" />
              </div>
              <button
                type="button"
                className="btn-ghost w-full text-sm"
                disabled={busy || !linkRef.trim()}
                onClick={() =>
                  run(async () => {
                    const r = await linkFeedbackEntityAction(detail.id, linkType, linkRef);
                    if (r.ok) setLinkRef("");
                    return r;
                  }, "Lien enregistré.")
                }
              >
                Lier
              </button>
              <button
                type="button"
                className="btn-ghost w-full text-sm"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const r = await convertFeedbackToSupportAction(detail.id);
                    return { ok: r.ok, error: r.error };
                  }, "Converti en demande de support.")
                }
              >
                Convertir en demande de support
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-faint">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className="max-w-[60%] break-words text-right text-white">{value}</span>
    </div>
  );
}

function activityLabel(action: string, meta: Record<string, unknown> | null): string {
  switch (action) {
    case "created":
      return "Retour créé";
    case "status_changed":
      return `Statut : ${meta?.from ?? "?"} → ${meta?.to ?? "?"}`;
    case "priority_changed":
      return `Priorité : ${meta?.from ?? "?"} → ${meta?.to ?? "?"}`;
    case "assigned":
      return meta?.to ? `Attribué à ${meta.to}` : "Attribution retirée";
    case "note_added":
      return "Note ajoutée";
    case "linked":
      return `Lié à ${meta?.entityType ?? "?"} ${meta?.entityRef ?? ""}`;
    case "converted_to_support":
      return `Converti en support ${meta?.supportReference ?? ""}`;
    default:
      return action;
  }
}
