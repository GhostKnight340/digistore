"use client";

/**
 * Admin "Support" tab: tickets submitted from the guided /support flow.
 * List with status filter → inline detail (full message, contact, attachment
 * downloads, reply history + customer feedback) → reply inline, close with an
 * optional resolution, or reopen. Replying and closing email the customer and
 * update the ticket's Discord thread; status changes never edit the customer's
 * submitted content.
 */
import { useCallback, useEffect, useState } from "react";
import {
  listSupportTicketsAction,
  updateSupportTicketStatusAction,
  replySupportTicketAction,
  closeSupportTicketAction,
  getSupportTicketAttachmentAction,
} from "@/app/actions/supportAdmin";
import type { SupportTicketAdminDTO } from "@/lib/db/supportTickets";
import { findSupportCategory } from "@/lib/support/config";

const VIEWS = [
  { id: "active", label: "Actives" },
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

const RESOLUTION_LABEL: Record<string, string> = {
  resolved: "Résolu",
  cancelled: "Annulé",
  dismissed: "Sans suite",
};

const RESOLUTION_OPTIONS = [
  { id: "resolved", label: "Résolu" },
  { id: "cancelled", label: "Annulé" },
  { id: "dismissed", label: "Sans suite" },
];

function categoryLabel(key: string): string {
  return findSupportCategory(key)?.label ?? key;
}

function fmtDateTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusChip({ status, resolution }: { status: string; resolution?: string | null }) {
  const meta = STATUS_META[status] ?? { label: status, cls: "text-muted border-border bg-surface2" };
  const label =
    status === "closed" && resolution ? `${meta.label} · ${RESOLUTION_LABEL[resolution] ?? resolution}` : meta.label;
  return (
    <span className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
      {label}
    </span>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-[#F7B14A]" aria-label={`${rating} sur 5`}>
      {"★".repeat(Math.max(0, Math.min(5, rating)))}
      <span className="text-faint">{"★".repeat(Math.max(0, 5 - rating))}</span>
    </span>
  );
}

export default function SupportTicketsPanel() {
  const [tickets, setTickets] = useState<SupportTicketAdminDTO[]>([]);
  const [view, setView] = useState("active");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [resolution, setResolution] = useState("");

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

  // Reset the per-ticket composer when the expanded ticket changes.
  useEffect(() => {
    setReplyText("");
    setResolution("");
  }, [openId]);

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

  async function sendReply(id: string) {
    const text = replyText.trim();
    if (!text) {
      setMsg({ text: "La réponse ne peut pas être vide.", ok: false });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await replySupportTicketAction(id, text);
      if (res.ok) {
        setMsg({ text: "Réponse envoyée au client par e-mail.", ok: true });
        setReplyText("");
        await load();
      } else {
        setMsg({ text: res.error ?? "Envoi impossible.", ok: false });
      }
    } catch {
      setMsg({ text: "Une erreur est survenue.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function closeTicket(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await closeSupportTicketAction(id, resolution || null);
      if (res.ok) {
        setMsg({ text: "Demande fermée. E-mail de clôture envoyé.", ok: true });
        setResolution("");
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
            Demandes envoyées depuis la page Support. Répondez directement au client par e-mail depuis chaque demande.
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
                  <StatusChip status={t.status} resolution={t.resolution} />
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
                        <p className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-canvas px-3 py-2.5 text-sm leading-relaxed text-white">
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

                    {t.replies.length > 0 && (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-faint">
                          Conversation ({t.replies.length})
                        </p>
                        <div className="mt-1.5 space-y-2">
                          {t.replies.map((r, i) => {
                            const fromCustomer = r.author === "customer";
                            return (
                              <div
                                key={i}
                                className={`rounded-lg border px-3 py-2.5 ${
                                  fromCustomer
                                    ? "border-border bg-surface"
                                    : "border-accent/20 bg-accent/[0.06]"
                                }`}
                              >
                                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">
                                  {fromCustomer ? t.name || "Client" : "Équipe"}
                                </p>
                                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-white">
                                  {r.body}
                                </p>
                                <p className="mt-1 text-[11px] text-faint">{fmtDateTime(r.createdAt)}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {t.feedbackRating != null && (
                      <div className="rounded-lg border border-[#F7B14A]/25 bg-[#F7B14A]/[0.06] px-3 py-2.5">
                        <p className="text-xs uppercase tracking-wide text-faint">Avis du client</p>
                        <p className="mt-1 text-sm">
                          <Stars rating={t.feedbackRating} />
                          <span className="ml-2 text-muted">{t.feedbackRating}/5</span>
                        </p>
                        {t.feedbackComment && (
                          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-white">
                            {t.feedbackComment}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Reply composer */}
                    <div className="border-t border-border/60 pt-3">
                      <label className="text-xs uppercase tracking-wide text-faint">
                        Répondre au client
                      </label>
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={4}
                        maxLength={4000}
                        placeholder="Écrivez votre réponse. Elle sera envoyée par e-mail au client et ajoutée au fil Discord."
                        className="mt-1.5 w-full resize-y rounded-lg border border-border bg-base px-3 py-2.5 text-sm text-white placeholder:text-faint focus:border-accent focus:outline-none"
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={busy || !replyText.trim()}
                          onClick={() => sendReply(t.id)}
                          className="btn-primary py-1.5 text-xs disabled:opacity-50"
                        >
                          Envoyer la réponse
                        </button>
                      </div>
                    </div>

                    {/* Close / reopen */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                      {t.status !== "closed" ? (
                        <>
                          <select
                            value={resolution}
                            onChange={(e) => setResolution(e.target.value)}
                            className="rounded-lg border border-border bg-base px-2.5 py-1.5 text-xs text-white focus:border-accent focus:outline-none"
                          >
                            <option value="">Clôture (sans statut)</option>
                            {RESOLUTION_OPTIONS.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => closeTicket(t.id)}
                            className="btn-ghost py-1.5 text-xs"
                          >
                            Fermer la demande
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setStatus(t.id, "open", "Demande rouverte.")}
                          className="btn-ghost py-1.5 text-xs"
                        >
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
