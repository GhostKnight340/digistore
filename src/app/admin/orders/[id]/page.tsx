import { notFound } from "next/navigation";
import OrderDetailPage from "@/components/admin/orders/OrderDetailPage";
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

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <OrderDetailPage initialOrder={order} />
    </div>
  );
}
