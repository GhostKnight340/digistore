"use client";

/**
 * "Suivre ma demande" — customer ticket-status lookup, visually part of the
 * guided support experience. Requires reference + e-mail (a bare GH-S-XXXXXX
 * reference is enumerable, never authentication on its own). The reference is
 * prefilled from ?ref= when arriving from the success screen.
 */
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { lookupSupportTicketAction } from "@/app/actions/support";
import type { SupportTicketStatusDTO } from "@/lib/db/supportTickets";
import { findSupportCategory } from "@/lib/support/config";

const STATUS_META: Record<string, { label: string; hint: string; cls: string }> = {
  open: {
    label: "En cours de traitement",
    hint: "Notre équipe examine votre demande. Réponse sous 24 h à l'adresse indiquée.",
    cls: "text-[#f0c04f] bg-[rgba(240,192,79,0.14)]",
  },
  answered: {
    label: "Réponse envoyée",
    hint: "Nous vous avons répondu par e-mail — pensez à vérifier votre dossier spam.",
    cls: "text-[#7db0ff] bg-[rgba(91,157,255,0.14)]",
  },
  closed: {
    label: "Demande clôturée",
    hint: "Cette demande est résolue. Ouvrez une nouvelle demande si besoin.",
    cls: "text-[#4fe0a0] bg-[rgba(59,200,140,0.14)]",
  },
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function TicketStatusLookup({ heading }: { heading?: string }) {
  const params = useSearchParams();
  const [reference, setReference] = useState(params.get("ref") ?? "");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [ticket, setTicket] = useState<SupportTicketStatusDTO | null>(null);

  const canSearch = reference.trim().length > 0 && /.+@.+\..+/.test(email.trim());

  const search = async () => {
    if (!canSearch || loading) return;
    setLoading(true);
    try {
      setTicket(await lookupSupportTicketAction(reference, email));
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const meta = ticket ? STATUS_META[ticket.status] ?? STATUS_META.open : null;
  const categoryLabel = ticket ? findSupportCategory(ticket.category)?.label ?? ticket.category : "";

  return (
    <div className="container-page pb-20 pt-12">
      <div className="mx-auto max-w-[560px]">
        <p className="mb-3 text-[12.5px] font-bold uppercase tracking-[0.14em] text-[#4d7fff]">GHOST.MA</p>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-white">{heading ?? "Suivre ma demande"}</h1>
        <p className="mt-2.5 text-[15px] leading-relaxed text-muted">
          Saisissez votre référence et l'adresse e-mail utilisée lors de la demande.
        </p>

        <div className="mt-6 flex flex-col gap-4 rounded-[18px] border border-white/[0.07] bg-white/[0.02] p-5">
          <div>
            <label className="mb-1.5 block text-[12.5px] font-semibold text-[#a4aabb]">Référence</label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="GH-S-000000"
              className="input font-mono"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12.5px] font-semibold text-[#a4aabb]">Adresse e-mail</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              type="email"
              placeholder="vous@exemple.com"
              className="input"
            />
          </div>
          <button
            type="button"
            disabled={!canSearch || loading}
            onClick={search}
            className={`w-full rounded-[13px] border px-4 py-3.5 text-[14.5px] font-bold transition ${
              canSearch
                ? "border-[rgba(120,170,255,0.6)] bg-gradient-to-b from-[#3f83ff] to-[#2f6cf0] text-white shadow-[0_6px_20px_rgba(47,108,240,0.35)] hover:-translate-y-px hover:brightness-105"
                : "cursor-not-allowed border-white/[0.09] bg-white/[0.05] text-[#5b6070]"
            }`}
          >
            {loading ? "Recherche…" : "Consulter le statut"}
          </button>
        </div>

        {searched && !loading && !ticket && (
          <div className="mt-5 rounded-[14px] border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-sm text-amber-100">
            Aucune demande trouvée pour cette référence et cette adresse e-mail. Vérifiez les deux champs —
            ils doivent correspondre exactement à votre demande.
          </div>
        )}

        {ticket && meta && (
          <div className="mt-5 overflow-hidden rounded-[18px] border border-white/[0.07] bg-white/[0.02]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-[18px] py-4">
              <span className="font-mono text-[15px] font-bold text-[#7db0ff]">{ticket.reference}</span>
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${meta.cls}`}>
                {meta.label}
              </span>
            </div>
            <div className="space-y-3 px-[18px] py-4 text-sm">
              <p className="text-[13.5px] leading-relaxed text-[#c8cdda]">{meta.hint}</p>
              <div className="grid gap-2 border-t border-white/[0.06] pt-3 text-[13.5px]">
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Sujet</span>
                  <span className="font-semibold text-[#e9ebf2]">{categoryLabel}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Problème</span>
                  <span className="text-right font-semibold text-[#e9ebf2]">{ticket.subIssueLabel}</span>
                </div>
                {ticket.orderRef && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">Commande</span>
                    <span className="font-mono font-semibold text-[#e9ebf2]">{ticket.orderRef}</span>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Envoyée le</span>
                  <span className="font-semibold text-[#e9ebf2]">{formatDate(ticket.createdAt)}</span>
                </div>
                {ticket.updatedAt !== ticket.createdAt && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">Dernière mise à jour</span>
                    <span className="font-semibold text-[#e9ebf2]">{formatDate(ticket.updatedAt)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-[13px] text-faint">
          Vous n'avez pas encore de demande ?{" "}
          <Link href="/support" className="font-semibold text-[#5b9dff] hover:text-[#7db0ff]">
            Contacter le support
          </Link>
        </p>
      </div>
    </div>
  );
}
