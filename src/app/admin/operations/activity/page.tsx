import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import ActivityLogView from "@/components/admin/operations/ActivityLogView";
import { getActivityLog } from "@/lib/ops/activityLog";

export const dynamic = "force-dynamic";

/** /admin/operations/activity — full searchable/filterable operational log. */
export default async function AdminActivityLogPage() {
  const customer = await requireAdminCustomer();
  const initial = await getActivityLog({ type: "all", sort: "newest", page: 1 });

  return (
    <AdminShellRoute active="operations" admin={toAdminIdentity(customer.name, customer.role)}>
      <ActivityLogView initial={initial} />
    </AdminShellRoute>
  );
}
