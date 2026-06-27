import Link from "next/link";
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
    <div className="container-page py-10">
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-muted hover:text-white">
          Back to admin
        </Link>
      </div>
      <OrderDetailPage initialOrder={order} />
    </div>
  );
}
