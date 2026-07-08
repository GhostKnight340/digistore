import { notFound } from "next/navigation";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import OrderDetailPage from "@/components/admin/orders/OrderDetailPage";
import { getAdminOrderDetail } from "@/lib/db/orders";
import { getAdminPaymentMethods } from "@/lib/db/paymentMethods";
import { resolveOrderPaymentMethod } from "@/lib/paymentMethod";
import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";

export const dynamic = "force-dynamic";

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await requireAdminCustomer();
  const [order, config] = await Promise.all([
    getAdminOrderDetail(id),
    // Includes archived methods so historical orders still resolve to a name.
    getAdminPaymentMethods(),
  ]);

  if (!order) notFound();

  const method = resolveOrderPaymentMethod(order.paymentMethod, config.methods);

  return (
    <AdminShellRoute active="orders" admin={toAdminIdentity(customer.name, customer.role)}>
      <OrderDetailPage initialOrder={order} paymentMethodLabel={method?.name} />
    </AdminShellRoute>
  );
}
