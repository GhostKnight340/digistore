import OverviewScreen from "@/components/admin/OverviewScreen";
import { getCurrentAdminCustomer } from "@/lib/auth";
import { getAdminOrdersPage } from "@/lib/db/orders";
import { getInventoryProducts } from "@/lib/db/inventory";

export const dynamic = "force-dynamic";

const LOW_STOCK_MAX = 5;

export default async function AdminOverviewPage() {
  const [orders, inventory, admin] = await Promise.all([
    getAdminOrdersPage({ take: 500 }),
    getInventoryProducts().catch(() => []),
    getCurrentAdminCustomer(),
  ]);

  const variants = inventory.flatMap((product) => product.variants);
  const outOfStock = variants.filter((variant) => variant.unused === 0).length;
  const lowStock = variants.filter(
    (variant) => variant.unused > 0 && variant.unused <= LOW_STOCK_MAX,
  ).length;

  return (
    <OverviewScreen
      orders={orders}
      outOfStock={outOfStock}
      lowStock={lowStock}
      adminName={admin?.name ?? "Admin"}
    />
  );
}
