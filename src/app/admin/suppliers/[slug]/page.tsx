import { notFound } from "next/navigation";
import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import SupplierDetailView from "@/components/admin/suppliers/SupplierDetailView";
import SuppliersPanel from "@/components/admin/SuppliersPanel";
import { getSupplierDetail } from "@/lib/db/supplierManagement";

export const dynamic = "force-dynamic";

export default async function AdminSupplierDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const customer = await requireAdminCustomer();
  const { slug } = await params;
  const detail = await getSupplierDetail(slug);
  if (!detail) notFound();

  return (
    <AdminShellRoute active="suppliers" admin={toAdminIdentity(customer.name, customer.role)}>
      <SupplierDetailView initial={detail} />
      {/* Reloadly keeps its existing operational tooling (mappings, catalog,
          provider orders) — surfaced on its detail page rather than lost. */}
      {slug === "reloadly" && (
        <div className="mt-8 border-t border-border pt-6">
          <SuppliersPanel />
        </div>
      )}
    </AdminShellRoute>
  );
}
