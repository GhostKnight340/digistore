import OrdersTableScreen from "@/components/admin/orders/OrdersTableScreen";
import { getAdminOrdersPage } from "@/lib/db/orders";

export const dynamic = "force-dynamic";

export default async function AdminFulfillmentPage() {
  const orders = await getAdminOrdersPage({
    take: 200,
    statuses: ["payment_confirmed"],
  });
  return (
    <OrdersTableScreen
      orders={orders}
      title="Fulfillment"
      subtitle="Paid orders waiting for code delivery."
      showTabs={false}
      emptyTitle="Nothing to fulfill"
      emptyDescription="Confirmed orders waiting for delivery show up here."
    />
  );
}
