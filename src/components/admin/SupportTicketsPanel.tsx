"use client";

/**
 * Admin "Support" tab: tickets submitted from the guided /support flow.
 * List with status filter → inline detail (full message, contact, attachment
 * downloads) → status transitions (open → answered → closed, re-openable).
 * Status changes never edit the customer's submitted content.
 */
import { useCallback, useEffect, useState } from "react";
import {
  listSupportTicketsAction,
  updateSupportTicketStatusAction,
  getSupportTicketAttachmentAction,
} from "@/app/actions/supportAdmin";
import type { SupportTicketAdminDTO } from "@/lib/db/supportTickets";
import { findSupportCategory } from "@/lib/support/config";

const VIEWS = [
  { id: "open", label: "Ouvertes" },
  { id: "answered", label: "Répondues" },
  { id: "closed", label: "Fermées" },
  { id: "", label: "Toutes" },
];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  open: { label: "Ouverte", cls: "text-[#D9B27C] border-[#F7B14A]/30 bg-[#F7B14A]/10" },
  answered: { label: "Répondue", cls: "text-[#9FB8FF] border-accent/30 bg-accent/10" },
  closed: { label: "Fermée", cls: "text-green-400 border-green-500/30 bg-green-500/10" },
};

function categoryLabel(key: string): string {
  return findSupportCategory(key)?.label ?? key;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusChip({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: "text-muted border-border bg-surface2" };
  return (
    <span className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

export default function SupportTicketsPanel() {
  const [tickets, setTickets] = useState<SupportTicketAdminDTO[]>([]);
  const [view, setView] = useState("open");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTickets(await listSupportTicketsAction(view ? { status: view } : {}));
    } catch {
      setMsg({ text: "Impossible de charger les demandes.", ok: false });
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: string, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await updateSupportTicketStatusAction(id, status);
      if (res.ok) {
        setMsg({ text: okText, ok: true });
        await load();
      } else {
        setMsg({ text: res.error ?? "Action impossible.", ok: false });
      }
    } catch {
      setMsg({ text: "Une erreur est survenue.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function download(ticketId: string, index: number) {
    try {
      const file = await getSupportTicketAttachmentAction(ticketId, index);
      if (!file) {
        setMsg({ text: "Pièce jointe introuvable.", ok: false });
        return;
      }
      const bytes = Uint8Array.from(atob(file.dataBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
      const a = document.createElement("a");
      a.href = url;
      a.download = file.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMsg({ text: "Téléchargement impossible.", ok: false });
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Support</h2>
          <p className="text-sm text-muted">
            Demandes envoyées depuis la page Support. Répondez par e-mail puis marquez la demande.
          </p>
        </div>
      </div>

      {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
              view === v.id ? "border-accent bg-accent/15 text-white" : "border-border text-muted hover:text-white"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {loading ? (
          <div className="card px-4 py-8 text-center text-sm text-muted">Chargement…</div>
        ) : tickets.length === 0 ? (
          <div className="card px-4 py-8 text-center text-sm text-muted">Aucune demande.</div>
        ) : (
          tickets.map((t) => {
            const isOpen = openId === t.id;
            return (
              <div key={t.id} className="card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : t.id)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left hover:bg-surface/40"
                >
                  <span className="font-mono text-[13px] font-bold text-accent">{t.reference}</span>
                  <StatusChip status={t.status} />
                  <span className="min-w-0 flex-1 basis-40 truncate text-sm text-white">
                    {categoryLabel(t.category)} — {t.subIssueLabel}
                  </span>
                  <span className="hidden text-xs text-muted sm:inline">{t.name}</span>
                  {t.orderRef && <span className="hidden font-mono text-xs text-muted md:inline">{t.orderRef}</span>}
                  <span className="text-xs text-faint">{fmtDateTime(t.createdAt)}</span>
                </button>

                {isOpen && (
                  <div className="space-y-4 border-t border-border px-4 py-4">
                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-faint">Client</p>
                        <p className="mt-1 font-medium text-white">{t.name}</p>
                        <p className="text-xs text-muted">{t.email}</p>
                        {t.phone && <p className="text-xs text-muted">{t.phone}</p>}
                        {t.customerId && <p className="mt-0.5 text-[11px] text-faint">Compte client lié</p>}
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-faint">Demande</p>
                        <p className="mt-1 text-white">{categoryLabel(t.category)}</p>
                        <p className="text-xs text-muted">{t.subIssueLabel}</p>
                        {t.orderRef && (
                          <p className="mt-0.5 font-mono text-xs text-muted">Commande : {t.orderRef}</p>
                        )}
                      </div>
                    </div>

                    {t.message && (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-faint">Message</p>
                        <p className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-base px-3 py-2.5 text-sm leading-relaxed text-white">
                          {t.message}
                        </p>
                      </div>
                    )}

                    {t.attachmentNames.length > 0 && (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-faint">Pièces jointes</p>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {t.attachmentNames.map((name, i) => (
                            <button
                              key={`${name}-${i}`}
                              type="button"
                              onClick={() => download(t.id, i)}
                              className="btn-ghost py-1 text-xs"
                            >
                              ⬇ {name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
                      <a href={`mailto:${t.email}?subject=${encodeURIComponent(`Ghost.ma — votre demande ${t.reference}`)}`} className="btn-ghost py-1.5 text-xs">
                        Répondre par e-mail
                      </a>
                      {t.status !== "answered" && (
                        <button type="button" disabled={busy} onClick={() => setStatus(t.id, "answered", "Marquée comme répondue.")} className="btn-primary py-1.5 text-xs">
                          Marquer répondue
                        </button>
                      )}
                      {t.status !== "closed" && (
                        <button type="button" disabled={busy} onClick={() => setStatus(t.id, "closed", "Demande fermée.")} className="btn-ghost py-1.5 text-xs">
                          Fermer
                        </button>
                      )}
                      {t.status !== "open" && (
                        <button type="button" disabled={busy} onClick={() => setStatus(t.id, "open", "Demande rouverte.")} className="btn-ghost py-1.5 text-xs">
                          Rouvrir
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
