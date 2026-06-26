import AdminDashboard from "@/components/admin/AdminDashboard";
import { getInventoryGroups } from "@/lib/db/inventory";
import { getAdminOrders } from "@/lib/db/orders";
import type { AdminOrderDTO, InventoryGroupDTO } from "@/lib/dto";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [ordersResult, inventoryResult] = await Promise.allSettled([
    getAdminOrders(),
    getInventoryGroups(),
  ]);

  const initialOrders: AdminOrderDTO[] =
    ordersResult.status === "fulfilled" ? ordersResult.value : [];
  const initialInventory: InventoryGroupDTO[] =
    inventoryResult.status === "fulfilled" ? inventoryResult.value : [];

  const failures = [ordersResult, inventoryResult].filter(
    (result) => result.status === "rejected",
  ).length;

  const initialLoadError =
    failures === 0
      ? null
      : failures === 2
        ? "Orders and inventory could not be loaded. Check the server logs and database connection."
        : ordersResult.status === "rejected"
          ? "Orders could not be loaded. Inventory is still available below."
          : "Inventory could not be loaded. Recent orders are still available below.";

  return (
    <AdminDashboard
      initialOrders={initialOrders}
      initialInventory={initialInventory}
      initialLoadError={initialLoadError}
    />
  );
}
