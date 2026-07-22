import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import CommandCenter from "@/components/admin/ai-operations/CommandCenter";
import SupportCoverageCard from "@/components/admin/ai-operations/SupportCoverageCard";
import { getCommandCenterSnapshot } from "@/lib/ai-ops/commandCenter";

export const dynamic = "force-dynamic";

/**
 * /admin/ai-operations — the AI Operations Command Center overview.
 * Admin-only via requireAdminCustomer; the first snapshot is server-rendered.
 */
export default async function AiOperationsPage() {
  const customer = await requireAdminCustomer();
  const snapshot = await getCommandCenterSnapshot();

  return (
    <AdminShellRoute active="ai-operations" admin={toAdminIdentity(customer.name, customer.role)}>
      <SupportCoverageCard />
      <CommandCenter initial={snapshot} />
    </AdminShellRoute>
  );
}
