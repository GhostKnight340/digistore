import SupportFlow, { type SupportOrderOption } from "@/components/support/SupportFlow";
import { getCurrentCustomer, getAccountOrders } from "@/lib/auth";
import { formatDH } from "@/lib/format";
import { orderStatusShort } from "@/lib/orderStatus";

export const metadata = { title: "Support - ghost.ma" };
export const dynamic = "force-dynamic";

const RECENT_ORDERS_SHOWN = 3;

function statusTone(status: string): SupportOrderOption["statusTone"] {
  switch (status) {
    case "delivered":
      return "green";
    case "pending":
    case "awaiting_payment":
    case "pending_payment":
    case "payment_submitted":
    case "payment_issue":
      return "amber";
    case "rejected":
    case "cancelled":
    case "refunded":
      return "red";
    case "payment_confirmed":
    case "processing":
      return "blue";
    default:
      return "gray";
  }
}

/** Short product tag for the order chip (e.g. "STEAM", "PSN"). */
function productTag(name: string): string {
  const word = name.trim().split(/\s+/)[0] ?? "";
  return (word || "CMD").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5) || "CMD";
}

function formatFrenchDate(value: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(value);
}

export default async function SupportPage() {
  const customer = await getCurrentCustomer().catch(() => null);
  const orders: SupportOrderOption[] = [];

  if (customer) {
    const recent = await getAccountOrders(customer.id).catch(() => []);
    for (const order of recent.slice(0, RECENT_ORDERS_SHOWN)) {
      const firstItem = order.items[0];
      const productName = firstItem
        ? firstItem.variant?.name
          ? `${firstItem.product.name} · ${firstItem.variant.name}`
          : firstItem.product.name
        : "Commande";
      orders.push({
        id: order.id,
        publicNumber: order.publicOrderNumber,
        href: `/order/${order.publicOrderPathSegment}`,
        product: productName,
        date: formatFrenchDate(order.createdAt),
        status: orderStatusShort(order.status),
        statusTone: statusTone(order.status),
        amount: formatDH(order.totalMad),
        tag: productTag(firstItem?.product.name ?? ""),
      });
    }
  }

  return (
    <SupportFlow
      orders={orders}
      initialName={customer?.name ?? ""}
      initialEmail={customer?.email ?? ""}
    />
  );
}
