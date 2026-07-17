import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import OperationsDashboard from "@/components/admin/operations/OperationsDashboard";
import { getOperationsSnapshot } from "@/lib/ops/dashboard";

export const dynamic = "force-dynamic";

/**
 * /admin/operations — the operational control center. The first snapshot is
 * server-rendered (no loading flash); the client component then polls for live
 * updates. Admin-only via requireAdminCustomer.
 */
export default async function AdminOperationsPage() {
  const customer = await requireAdminCustomer();
  const snapshot = await getOperationsSnapshot();

  return (
    <AdminShellRoute active="operations" admin={toAdminIdentity(customer.name, customer.role)}>
      <OperationsDashboard initial={snapshot} />
    </AdminShellRoute>
  );
}
