/**
 * AI Ops overview card for Customer Support (Phase E) — server component.
 *
 * One concise card on the AI Operations overview: current coverage state, the
 * key session figures, and a link to the full controls. When inactive it reads
 * as "inactive" (never an error/disconnected state) and points to activation.
 * Rendered in the overview PAGE (above the Command Center) so it needs no edit
 * to the Command Center itself.
 */

import { getCoverageOverview } from "@/lib/ai-ops/support/session";
import { listApprovals } from "@/lib/ai-ops/approvalStore";
import { SUPPORT_ASSISTANT_MODULE } from "@/lib/ai-ops/support/module";

const STATE_LABEL: Record<string, string> = {
  INACTIVE: "Inactive",
  SCHEDULED: "Programmée",
  ACTIVE_DRAFT_ONLY: "Active · brouillons",
  ACTIVE_AUTO_REPLY: "Active · réponses auto",
  PAUSED: "En pause",
  ENDING: "En cours de clôture",
  EXPIRED: "Expirée",
  ERROR: "Erreur",
  DEACTIVATED: "Désactivée",
};

function tone(state: string): string {
  if (state === "ACTIVE_DRAFT_ONLY" || state === "ACTIVE_AUTO_REPLY") return "text-emerald-400";
  if (state === "PAUSED" || state === "SCHEDULED" || state === "ENDING") return "text-amber-400";
  if (state === "ERROR") return "text-red-400";
  return "text-faint";
}

export default async function SupportCoverageCard() {
  const [overview, pending] = await Promise.all([getCoverageOverview(), listApprovals("PENDING")]);
  const support = pending.filter((r) => r.module === SUPPORT_ASSISTANT_MODULE);
  const urgent = support.filter((r) => r.riskLevel === "high").length;
  const s = overview.session;
  const state = overview.effectiveState;

  return (
    <section className="mb-4 rounded-xl border border-border bg-surface2/40 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Support client IA</h2>
          <p className={`text-xs font-medium ${tone(state)}`}>{STATE_LABEL[state] ?? state}</p>
        </div>
        <a
          href="/admin/ai-operations/support"
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-white hover:border-accent"
        >
          {s ? "Gérer la couverture" : "Activer la couverture"}
        </a>
      </div>

      {s ? (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-4">
          <span>Fin : {s.scheduledEndAt ? new Date(s.scheduledEndAt).toLocaleString("fr-FR") : "manuelle"}</span>
          <span>Traités : {s.casesProcessed}</span>
          <span>En attente : {support.length}</span>
          <span className={urgent ? "text-red-400" : ""}>Urgents : {urgent}</span>
          <span>Envois auto : {s.messagesAutoSent}</span>
          <span>Escalades : {s.escalationsCreated}</span>
          <span>Brouillons : {s.messagesDrafted}</span>
          <span className={s.failures ? "text-red-400" : ""}>Échecs : {s.failures}</span>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">
          La couverture support IA est inactive. La boîte de réception manuelle fonctionne normalement
          {support.length ? ` · ${support.length} brouillon(s)/escalade(s) en attente.` : "."}
        </p>
      )}
    </section>
  );
}
