"use client";

/**
 * A customer's own support tickets as expandable conversations. Clicking a
 * ticket opens the full thread (their original message + the exchange with the
 * support team) and, unless the ticket is closed, a reply box so the customer
 * can continue the conversation. Shared by the account "Support" page and the
 * logged-in view of "Suivre ma demande".
 */
import { useState } from "react";
import Link from "next/link";
import { replyToSupportTicketAction } from "@/app/actions/support";
import type { SupportTicketStatusDTO } from "@/lib/db/supportTickets";
import { findSupportCategory } from "@/lib/support/config";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  open: { label: "En cours", cls: "border-[#F7B14A]/30 bg-[#F7B14A]/10 text-[#F7B14A]" },
  answered: { label: "Répondue", cls: "border-accent/30 bg-accent/10 text-[#9FB8FF]" },
  closed: { label: "Clôturée", cls: "border-green-500/30 bg-green-500/10 text-green-400" },
};

const RESOLUTION_LABEL: Record<string, string> = {
  resolved: "Résolu",
  cancelled: "Annulé",
  dismissed: "Sans suite",
};

function categoryLabel(key: string): string {
  return findSupportCategory(key)?.label ?? key;
}

function formatFrenchDate(iso: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function formatDateTime(iso: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function SupportTicketList({
  tickets: initialTickets,
}: {
  tickets: SupportTicketStatusDTO[];
}) {
  const [tickets, setTickets] = useState(initialTickets);
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [error, setError] = useState<{ ref: string; text: string } | null>(null);

  async function sendReply(reference: string) {
    const text = (drafts[reference] ?? "").trim();
    if (!text) return;
    setBusyRef(reference);
    setError(null);
    try {
      const res = await replyToSupportTicketAction(reference, text);
      if (res.ok) {
        setTickets((prev) => prev.map((t) => (t.reference === reference ? res.ticket : t)));
        setDrafts((prev) => ({ ...prev, [reference]: "" }));
      } else {
        setError({ ref: reference, text: res.error });
      }
    } catch {
      setError({ ref: reference, text: "Une erreur est survenue. Réessayez." });
    } finally {
      setBusyRef(null);
    }
  }

  return (
    <div className="space-y-3">
      {tickets.map((t) => {
        const meta = STATUS_META[t.status] ?? {
          label: t.status,
          cls: "border-border bg-surface2 text-muted",
        };
        const isOpen = openRef === t.reference;
        const closed = t.status === "closed";
        // The conversation: the customer's original message, then every reply.
        const conversation = [
          ...(t.message ? [{ author: "customer" as const, body: t.message, createdAt: t.createdAt }] : []),
          ...t.replies,
        ];
        const canGiveFeedback = closed && !t.feedbackGiven && t.feedbackToken;

        return (
          <div key={t.reference} className="overflow-hidden rounded-[13px] border border-border bg-canvas">
            <button
              type="button"
              onClick={() => setOpenRef(isOpen ? null : t.reference)}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3.5 text-left hover:bg-surface/40"
            >
              <span className="font-mono text-[13px] font-bold text-accent">{t.reference}</span>
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${meta.cls}`}
              >
                {meta.label}
                {closed && t.resolution ? ` · ${RESOLUTION_LABEL[t.resolution] ?? t.resolution}` : ""}
              </span>
              <span className="min-w-0 flex-1 basis-40 truncate text-sm text-white">
                {categoryLabel(t.category)} — {t.subIssueLabel}
              </span>
              {t.replies.length > 0 && (
                <span className="text-[11px] text-faint">
                  {t.replies.length} message{t.replies.length > 1 ? "s" : ""}
                </span>
              )}
              <span className="text-xs text-faint">{formatFrenchDate(t.createdAt)}</span>
            </button>

            {isOpen && (
              <div className="space-y-3 border-t border-border px-4 py-4">
                <div className="space-y-2.5">
                  {conversation.map((m, i) => {
                    const fromTeam = m.author === "admin";
                    return (
                      <div key={i} className={`flex ${fromTeam ? "justify-start" : "justify-end"}`}>
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                            fromTeam
                              ? "rounded-tl-sm border border-accent/20 bg-accent/[0.07]"
                              : "rounded-tr-sm border border-border bg-surface"
                          }`}
                        >
                          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">
                            {fromTeam ? "Équipe ghost.ma" : "Vous"}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-white">
                            {m.body}
                          </p>
                          {m.createdAt && (
                            <p className="mt-1 text-[10.5px] text-faint">{formatDateTime(m.createdAt)}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {closed ? (
                  <div className="border-t border-border/60 pt-3">
                    {canGiveFeedback ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-[13px] text-muted">Cette demande est clôturée.</p>
                        <Link
                          href={`/support/feedback?token=${t.feedbackToken}`}
                          className="btn-primary py-1.5 text-xs"
                        >
                          Donner mon avis
                        </Link>
                      </div>
                    ) : (
                      <p className="text-[13px] text-muted">
                        Cette demande est clôturée.
                        {t.feedbackGiven ? " Merci, votre avis a bien été enregistré." : ""}{" "}
                        <Link href="/support" className="text-accent hover:text-accent-hover">
                          Ouvrir une nouvelle demande
                        </Link>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="border-t border-border/60 pt-3">
                    <label className="text-[11px] uppercase tracking-wide text-faint">Répondre</label>
                    <textarea
                      value={drafts[t.reference] ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [t.reference]: e.target.value }))
                      }
                      rows={3}
                      maxLength={4000}
                      placeholder="Écrivez votre message à notre équipe…"
                      className="input mt-1.5 min-h-[84px] resize-y"
                    />
                    {error?.ref === t.reference && (
                      <p className="mt-1.5 text-[13px] text-red-400">{error.text}</p>
                    )}
                    <div className="mt-2">
                      <button
                        type="button"
                        disabled={busyRef === t.reference || !(drafts[t.reference] ?? "").trim()}
                        onClick={() => sendReply(t.reference)}
                        className="btn-primary py-1.5 text-xs disabled:opacity-50"
                      >
                        {busyRef === t.reference ? "Envoi…" : "Envoyer"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
