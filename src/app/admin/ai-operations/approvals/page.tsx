import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import AiApprovalsView, { type ApprovalItem } from "@/components/admin/ai-operations/AiApprovalsView";
import { listApprovals } from "@/lib/ai-ops/approvalStore";

export const dynamic = "force-dynamic";

/** /admin/ai-operations/approvals — the reusable approval queue (spec §7). */
export default async function AiOpsApprovalsPage() {
  const customer = await requireAdminCustomer();
  const rows = await listApprovals();
  const approvals: ApprovalItem[] = rows.map((r) => ({
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
        <h1 className="mt-1 text-lg font-semibold text-white">File d'approbation</h1>
      </div>
      <AiApprovalsView approvals={approvals} />
    </AdminShellRoute>
  );
}
