import { notFound } from "next/navigation";
import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import SupplierLogsView from "@/components/admin/suppliers/SupplierLogsView";
import { listSupplierLogs } from "@/lib/db/supplierManagement";
import { getSupplierProvider, isSupplierSlug } from "@/lib/suppliers/registry";

export const dynamic = "force-dynamic";

export default async function AdminSupplierLogsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const customer = await requireAdminCustomer();
  const { slug } = await params;
  if (!isSupplierSlug(slug)) notFound();
  const initial = await listSupplierLogs(slug, {});

  return (
    <AdminShellRoute active="suppliers" admin={toAdminIdentity(customer.name, customer.role)}>
      <SupplierLogsView slug={slug} supplierName={getSupplierProvider(slug).name} initial={initial} />
    </AdminShellRoute>
  );
}
