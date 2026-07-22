import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import OperationsDashboard from "@/components/admin/operations/OperationsDashboard";
import { getOperationsSnapshot } from "@/lib/ops/dashboard";
import { getCeoBriefing } from "@/lib/ops/ceoBriefing";

export const dynamic = "force-dynamic";

/**
 * /admin/operations — the operational control center. The first snapshot is
 * server-rendered (no loading flash); the client component then polls for live
 * updates. Admin-only via requireAdminCustomer.
 *
 * The CEO Briefing (AI or deterministic fallback) is resolved server-side from
 * the SAME snapshot (no second round-trip) so the card is populated on first
 * paint; the client then refreshes it on demand.
 */
export default async function AdminOperationsPage() {
  const customer = await requireAdminCustomer();
  const snapshot = await getOperationsSnapshot({ adminName: customer.name });
  const briefing = await getCeoBriefing({ snapshot, adminName: customer.name });

  return (
    <AdminShellRoute active="operations" admin={toAdminIdentity(customer.name, customer.role)}>
      <OperationsDashboard initial={snapshot} initialBriefing={briefing} />
    </AdminShellRoute>
  );
}
