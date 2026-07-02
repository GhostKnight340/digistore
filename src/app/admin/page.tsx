import { Suspense } from "react";
import AdminDashboard from "@/components/admin/AdminDashboard";
import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const customer = await requireAdminCustomer();
  return (
    <Suspense fallback={null}>
      <AdminDashboard admin={toAdminIdentity(customer.name, customer.role)} />
    </Suspense>
  );
}
