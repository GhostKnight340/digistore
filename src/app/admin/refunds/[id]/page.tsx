import { notFound } from "next/navigation";
import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import RefundCaseView from "@/components/admin/refunds/RefundCaseView";
import { getRefundCaseDetail } from "@/lib/db/refundsQuery";
import { getAdminPaymentMethods } from "@/lib/db/paymentMethods";
import { getStoreSettings } from "@/lib/db/catalog";

export const dynamic = "force-dynamic";

export default async function AdminRefundCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const customer = await requireAdminCustomer();
  const { id } = await params;
  const [detail, config, settings] = await Promise.all([
    getRefundCaseDetail(id),
    getAdminPaymentMethods(),
    getStoreSettings(),
  ]);
  if (!detail) notFound();

  const paymentMethods = config.methods.map((m) => ({ id: m.id, name: m.name }));
  const whatsappNumber = settings.footer.whatsappNumber;

  return (
    <AdminShellRoute active="refunds" admin={toAdminIdentity(customer.name, customer.role)}>
      <RefundCaseView
        detail={detail}
        paymentMethods={paymentMethods}
        whatsappNumber={whatsappNumber}
      />
    </AdminShellRoute>
  );
}
