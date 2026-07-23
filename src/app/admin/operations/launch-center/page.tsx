import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import LaunchCenter from "@/components/admin/operations/LaunchCenter";
import { getLaunchReadiness } from "@/lib/ops/launchReadiness";
import { listManualTasks } from "@/lib/ops/launchTasks";

export const dynamic = "force-dynamic";

/**
 * /admin/operations/launch-center — the mission-control launch-readiness board.
 * Every subsystem is inspected server-side on first paint (no loading flash);
 * the client component then re-runs the audit on demand. Admin-only via
 * requireAdminCustomer.
 */
export default async function LaunchCenterPage() {
  const customer = await requireAdminCustomer();
  const [readiness, tasks] = await Promise.all([
    getLaunchReadiness(),
    listManualTasks(),
  ]);

  return (
    <AdminShellRoute active="launch-center" admin={toAdminIdentity(customer.name, customer.role)}>
      <LaunchCenter initialReadiness={readiness} initialTasks={tasks} />
    </AdminShellRoute>
  );
}
