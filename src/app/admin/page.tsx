import AdminDashboard from "@/components/admin/AdminDashboard";
import { getInventoryGroups } from "@/lib/db/inventory";
import { getAdminOrders } from "@/lib/db/orders";
import type { AdminOrderDTO, InventoryGroupDTO } from "@/lib/dto";
<<<<<<< ours
import SettingsPanel from "@/components/admin/SettingsPanel";
import FulfillmentPanel from "@/components/admin/FulfillmentPanel";
import InventoryPanel from "@/components/admin/InventoryPanel";
import PaymentsPanel from "@/components/admin/PaymentsPanel";
import PaymentSettingsPanel from "@/components/admin/PaymentSettingsPanel";

const navItems = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "payments", label: "Payments", icon: "💳" },
  { id: "payment-settings", label: "Payment settings", icon: "⚙️" },
  { id: "inventory", label: "Inventory", icon: "🔑" },
  { id: "fulfillment", label: "Manual fulfillment", icon: "📦" },
  { id: "settings", label: "Store settings", icon: "🛠️" },
  { id: "products", label: "Products", icon: "🛍️" },
  { id: "customers", label: "Customers", icon: "👥" },
  { id: "suppliers", label: "Supplier API", icon: "🔌" },
  { id: "refunds", label: "Refunds", icon: "↩" },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [orders, setOrders] = useState<AdminOrderDTO[]>([]);
  const [inventory, setInventory] = useState<InventoryGroupDTO[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [o, inv] = await Promise.all([
      getAdminOrdersAction(),
      getInventoryAction(),
    ]);
    setOrders(o);
    setInventory(inv);
    setLoaded(true);
  }, []);

  // Refresh overview data whenever we return to the overview tab.
  useEffect(() => {
    if (activeTab === "overview") load();
  }, [activeTab, load]);

  const totalRevenue = orders.reduce((sum, order) => sum + order.totalMad, 0);
  const customers = new Set(orders.map((o) => o.customerEmail)).size;
  const pendingCount = orders.filter((o) => o.status !== "delivered").length;

  return (
    <div className="container-page py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Admin dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            Database-backed inventory and manual fulfillment.
          </p>
        </div>
        <span className="chip border-accent/40 text-accent">Prototype mode</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="h-fit">
          <nav className="card space-y-1 p-3 text-sm">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left ${
                  activeTab === item.id
                    ? "bg-accent/10 font-medium text-white"
                    : "text-muted"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {activeTab === "payments" ? (
          <PaymentsPanel />
        ) : activeTab === "payment-settings" ? (
          <PaymentSettingsPanel />
        ) : activeTab === "settings" ? (
          <SettingsPanel />
        ) : activeTab === "fulfillment" ? (
          <FulfillmentPanel />
        ) : activeTab === "inventory" ? (
          <InventoryPanel />
        ) : (
          <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Total orders"
                value={loaded ? String(orders.length) : "-"}
              />
              <Stat
                label="Pending fulfillment"
                value={loaded ? String(pendingCount) : "-"}
              />
              <Stat
                label="Total revenue"
                value={loaded ? formatMAD(totalRevenue) : "-"}
              />
              <Stat
                label="Customers"
                value={loaded ? String(customers) : "-"}
              />
            </div>
=======

export const dynamic = "force-dynamic";
>>>>>>> theirs

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
