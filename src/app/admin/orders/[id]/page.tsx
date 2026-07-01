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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin" className="text-sm text-muted hover:text-white">
          Retour à l&apos;admin
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/editor" className="btn-ghost h-10 px-4 text-sm">
            Éditeur de la page d&apos;accueil
          </Link>
          <span className="chip border-accent/40 text-accent">Données de production</span>
        </div>
      </div>
      <OrderDetailPage initialOrder={order} />
    </div>
  );
}
