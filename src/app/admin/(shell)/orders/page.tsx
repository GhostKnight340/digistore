import OrdersTableScreen from "@/components/admin/orders/OrdersTableScreen";
import { getAdminOrdersPage } from "@/lib/db/orders";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const orders = await getAdminOrdersPage({ take: 500 });
  return <OrdersTableScreen orders={orders} title="Orders" />;
}
