import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import FulfillmentTestCenter from "@/components/admin/operations/FulfillmentTestCenter";
import { getFulfillmentTestDashboard } from "@/lib/fulfillment-test/runner";
export const dynamic = "force-dynamic";
export default async function Page() {
  const admin = await requireAdminCustomer();
  const dashboard = await getFulfillmentTestDashboard();
  return <AdminShellRoute active="fulfillment-test" admin={toAdminIdentity(admin.name, admin.role)}><FulfillmentTestCenter initial={JSON.parse(JSON.stringify(dashboard))} /></AdminShellRoute>;
}
