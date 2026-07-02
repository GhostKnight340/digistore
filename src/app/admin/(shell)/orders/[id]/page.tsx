import { notFound } from "next/navigation";
import OrderDetailScreen from "@/components/admin/orders/OrderDetailScreen";
import { getAdminOrderDetail } from "@/lib/db/orders";

export const dynamic = "force-dynamic";

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getAdminOrderDetail(id);

  if (!order) notFound();

  return <OrderDetailScreen initialOrder={order} />;
}
