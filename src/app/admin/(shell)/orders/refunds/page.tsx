import OrdersTableScreen from "@/components/admin/orders/OrdersTableScreen";
import { getAdminOrdersPage } from "@/lib/db/orders";

export const dynamic = "force-dynamic";

export default async function AdminRefundsPage() {
  const orders = await getAdminOrdersPage({ take: 200, statuses: ["refunded"] });
  return (
    <OrdersTableScreen
      orders={orders}
      title="Refunds"
      subtitle="Orders marked as refunded."
      showTabs={false}
      emptyTitle="No refunds"
      emptyDescription="Refunded orders appear here."
    />
  );
}
