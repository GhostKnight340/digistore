import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import ClientsListView from "@/components/admin/clients/ClientsListView";
import { listAdminCustomers } from "@/lib/db/customerAdmin";
import type { CustomerListFilters, CustomerListSort } from "@/lib/customerAdminDto";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function str(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const customer = await requireAdminCustomer();
  const sp = await searchParams;

  const filters: CustomerListFilters = {
    query: str(sp.q),
    status: (str(sp.status) as CustomerListFilters["status"]) || "",
    verified: (str(sp.verified) as CustomerListFilters["verified"]) || "",
    orders: (str(sp.orders) as CustomerListFilters["orders"]) || "",
    ghostCredit: (str(sp.credit) as CustomerListFilters["ghostCredit"]) || "",
    openSupport: (str(sp.support) as CustomerListFilters["openSupport"]) || "",
    sort: (str(sp.sort) as CustomerListSort) || "newest",
    page: Number(str(sp.page)) || 1,
  };

  const initial = await listAdminCustomers(filters);

  return (
    <AdminShellRoute active="customers" admin={toAdminIdentity(customer.name, customer.role)}>
      <ClientsListView initial={initial} initialFilters={filters} />
    </AdminShellRoute>
  );
}
