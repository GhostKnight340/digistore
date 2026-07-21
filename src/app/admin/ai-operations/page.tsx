import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import AiOpsDashboard from "@/components/admin/ai-operations/AiOpsDashboard";
import { getAiOpsSnapshot } from "@/lib/ai-ops/dashboard";

export const dynamic = "force-dynamic";

/**
 * /admin/ai-operations — the AI Operations control center overview.
 * Admin-only via requireAdminCustomer; the first snapshot is server-rendered.
 */
export default async function AiOperationsPage() {
  const customer = await requireAdminCustomer();
  const snapshot = await getAiOpsSnapshot();

  return (
    <AdminShellRoute active="ai-operations" admin={toAdminIdentity(customer.name, customer.role)}>
      <AiOpsDashboard initial={snapshot} />
    </AdminShellRoute>
  );
}
