import { notFound } from "next/navigation";
import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import CustomerDetailView from "@/components/admin/clients/CustomerDetailView";
import { getCustomerOverview } from "@/lib/db/customerAdmin";

export const dynamic = "force-dynamic";

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const customer = await requireAdminCustomer();
  const { customerId } = await params;
  const overview = await getCustomerOverview(customerId);
  if (!overview) notFound();

  return (
    <AdminShellRoute active="customers" admin={toAdminIdentity(customer.name, customer.role)}>
      <CustomerDetailView overview={overview} customerId={customerId} />
    </AdminShellRoute>
  );
}
