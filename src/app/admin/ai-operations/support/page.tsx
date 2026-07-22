import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import SupportCoveragePanel from "@/components/admin/ai-operations/SupportCoveragePanel";
import AiApprovalsView, { type ApprovalItem } from "@/components/admin/ai-operations/AiApprovalsView";
import { getCoverageOverview, getLastHandoff } from "@/lib/ai-ops/support/session";
import { coverageReadiness } from "@/lib/ai-ops/support/readiness";
import { isInboundEmailConfigured } from "@/lib/support/inboundEmail";
import { listApprovals } from "@/lib/ai-ops/approvalStore";
import { SUPPORT_ASSISTANT_MODULE } from "@/lib/ai-ops/support/module";

export const dynamic = "force-dynamic";

/**
 * /admin/ai-operations/support — AI Support Coverage: the on-demand switch plus
 * the queue of drafted replies / escalations awaiting human approval. Approving
 * a drafted reply sends it to the customer; nothing is sent automatically.
 */
export default async function AiOpsSupportPage() {
  const customer = await requireAdminCustomer();
  const [coverage, rows, handoff, readiness] = await Promise.all([
    getCoverageOverview(),
    listApprovals(),
    getLastHandoff(),
    coverageReadiness(),
  ]);

  const approvals: ApprovalItem[] = rows
    .filter((r) => r.module === SUPPORT_ASSISTANT_MODULE)
    .map((r) => ({
      id: r.id,
      module: r.module,
      actionType: r.actionType,
      summary: r.summary,
      proposedContent: r.proposedContent,
      riskLevel: r.riskLevel,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
    }));

  return (
    <AdminShellRoute active="ai-operations" admin={toAdminIdentity(customer.name, customer.role)}>
      <div className="mb-4">
        <a href="/admin/ai-operations" className="text-xs text-faint hover:text-white">← AI Operations</a>
        <h1 className="mt-1 text-lg font-semibold text-white">Couverture support IA</h1>
        <p className="mt-1 text-sm text-muted">
          Activez la couverture quand vous vous absentez. L&apos;assistant prépare des brouillons de réponse
          fondés sur les données Ghost.ma vérifiées ; vous approuvez avant tout envoi.
        </p>
      </div>

      {!isInboundEmailConfigured() && (
        <div className="mb-4 rounded-lg border border-border bg-surface2/40 p-3 text-xs text-muted">
          <span className="font-medium text-white">Intégration e-mail non configurée</span> — optionnelle.
          L&apos;assistant fonctionne normalement sur les tickets du site web. L&apos;ingestion des e-mails support
          pourra être activée plus tard (Resend Inbound + <code className="text-faint">RESEND_INBOUND_WEBHOOK_SECRET</code>)
          sans modifier le reste du système.
        </div>
      )}

      <div className="mb-5">
        <SupportCoveragePanel initial={coverage} readiness={readiness} />
      </div>

      {coverage.effectiveState === "INACTIVE" && handoff && (
        <div className="mb-5 rounded-xl border border-border bg-surface2/40 p-4">
          <h2 className="text-sm font-semibold text-white">Dernier récapitulatif de couverture</h2>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-3">
            <span>Conversations reçues : {handoff.newConversations}</span>
            <span>Cas résolus : {handoff.casesResolved}</span>
            <span>Réponses auto : {handoff.autoReplied}</span>
            <span>Brouillons en attente : {handoff.draftsAwaiting}</span>
            <span>Escalades : {handoff.escalations}</span>
            <span>Approbations sensibles : {handoff.sensitiveApprovals}</span>
            <span>En attente client : {handoff.waitingForCustomer}</span>
            <span>Réponses après IA : {handoff.repliedAfterAiReply}</span>
            <span>Échecs d&apos;envoi : {handoff.failedOutgoing}</span>
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-faint">
            {handoff.recommendedNextActions.map((a, i) => <li key={i}>• {a}</li>)}
          </ul>
          <div className="mt-2 flex gap-3 text-xs">
            <a href="/admin?tab=support" className="text-faint hover:text-white">Boîte de réception →</a>
            <a href="/admin/ai-operations/approvals" className="text-faint hover:text-white">File d&apos;approbation →</a>
          </div>
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-white">Brouillons &amp; escalades à traiter</h2>
      <AiApprovalsView approvals={approvals} />
    </AdminShellRoute>
  );
}
