import Link from "next/link";
import type { SupportTicketStatusDTO } from "@/lib/db/supportTickets";
import { findSupportCategory } from "@/lib/support/config";

/**
 * Presentational list of a customer's own support tickets — shared by the
 * account "Support" page and the logged-in view of "Suivre ma demande". Shows
 * status, resolution, latest reply, and a feedback link for closed tickets.
 */

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
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export default function SupportTicketList({ tickets }: { tickets: SupportTicketStatusDTO[] }) {
  return (
    <div className="space-y-3">
      {tickets.map((t) => {
        const meta = STATUS_META[t.status] ?? {
          label: t.status,
          cls: "border-border bg-surface2 text-muted",
        };
        const lastReply = t.replies[t.replies.length - 1];
        const canGiveFeedback = t.status === "closed" && !t.feedbackGiven && t.feedbackToken;
        return (
          <div key={t.reference} className="rounded-[13px] border border-border bg-base px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="font-mono text-[13px] font-bold text-accent">{t.reference}</span>
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${meta.cls}`}
              >
                {meta.label}
                {t.status === "closed" && t.resolution
                  ? ` · ${RESOLUTION_LABEL[t.resolution] ?? t.resolution}`
                  : ""}
              </span>
              <span className="min-w-0 flex-1 basis-40 truncate text-sm text-white">
                {categoryLabel(t.category)} — {t.subIssueLabel}
              </span>
              <span className="text-xs text-faint">{formatFrenchDate(t.createdAt)}</span>
            </div>

            {t.message && (
              <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-[13px] leading-relaxed text-muted">
                {t.message}
              </p>
            )}

            {lastReply && (
              <div className="mt-2.5 rounded-lg border border-accent/20 bg-accent/[0.06] px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-faint">
                  Réponse de notre équipe
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-white">
                  {lastReply.body}
                </p>
              </div>
            )}

            {t.status === "closed" && (
              <div className="mt-2.5">
                {canGiveFeedback ? (
                  <Link
                    href={`/support/feedback?token=${t.feedbackToken}`}
                    className="btn-primary py-1.5 text-xs"
                  >
                    Donner mon avis
                  </Link>
                ) : t.feedbackGiven ? (
                  <p className="text-[12px] text-faint">Merci, votre avis a bien été enregistré.</p>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
