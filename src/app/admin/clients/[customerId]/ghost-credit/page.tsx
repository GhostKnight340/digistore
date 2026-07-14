import { notFound } from "next/navigation";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import AdminWalletView from "@/components/admin/AdminWalletView";
import { getAdminWalletDetail, getAdminWalletLedger } from "@/lib/db/adminWallet";
import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";

export const dynamic = "force-dynamic";

export default async function AdminCustomerWalletPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const admin = await requireAdminCustomer();
  const detail = await getAdminWalletDetail(customerId);
  if (!detail) notFound();

  const ledger = await getAdminWalletLedger(customerId, {}, 1);

  return (
    <AdminShellRoute active="customers" admin={toAdminIdentity(admin.name, admin.role)}>
      <AdminWalletView initialDetail={detail} initialLedger={ledger} />
    </AdminShellRoute>
  );
}
