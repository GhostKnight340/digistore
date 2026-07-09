import AdminShellRoute from "@/components/admin/AdminShellRoute";
import ReloadlyImporter from "@/components/admin/ReloadlyImporter";
import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";

export const dynamic = "force-dynamic";

export default async function ReloadlyImportPage() {
  const customer = await requireAdminCustomer();
  return (
    <AdminShellRoute active="import-reloadly" admin={toAdminIdentity(customer.name, customer.role)}>
      <div style={{ height: "100%", overflowY: "auto" }}>
        <div className="admin-panel-pad" style={{ padding: "26px 28px" }}>
          <style>{`@media (max-width: 640px) { .admin-panel-pad { padding: 16px !important; } }`}</style>
          <ReloadlyImporter />
        </div>
      </div>
    </AdminShellRoute>
  );
}
