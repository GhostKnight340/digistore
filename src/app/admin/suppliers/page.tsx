import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import SuppliersListView from "@/components/admin/suppliers/SuppliersListView";
import { listSupplierCards } from "@/lib/db/supplierManagement";

export const dynamic = "force-dynamic";

export default async function AdminSuppliersPage() {
  const customer = await requireAdminCustomer();
  const cards = await listSupplierCards();

  return (
    <AdminShellRoute active="suppliers" admin={toAdminIdentity(customer.name, customer.role)}>
      <SuppliersListView initial={cards} />
    </AdminShellRoute>
  );
}
