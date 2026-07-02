import { formatMAD } from "@/lib/format";
import { orderStatusBadgeClass, orderStatusShort } from "@/lib/orderStatus";
import { getPublicOrderLabel } from "@/lib/orderNumber";

// Serializable view-model consumed by <OrderRow>. Built on the server so the
// row component itself stays free of DB/formatting concerns.
export type OrderRowData = {
  id: string;
  href: string;
  code: string;
  product: string;
  meta: string;
  amount: string;
  statusLabel: string;
  statusClass: string;
  statusGroup: "delivered" | "processing" | "other";
  search: string;
  showAction: boolean;
};

// Structural input type — avoids importing the server-only auth module so this
// file is safe to pull into client components.
type SourceOrder = {
  id: string;
  status: string;
  totalMad: number;
  createdAt: Date;
  publicOrderNumber?: string | null;
  publicOrderPathSegment: string;
  items: {
    quantity: number;
    product: { name: string };
    variant: { name: string | null } | null;
  }[];
};

const PLATFORM_MAP: [RegExp, string][] = [
  [/steam/i, "STEAM"],
  [/playstation|\bpsn\b|\bps[45]\b/i, "PSN"],
  [/xbox/i, "XBOX"],
  [/nintendo|eshop|switch/i, "NTND"],
  [/roblox/i, "RBLX"],
  [/valorant|riot|league/i, "RIOT"],
  [/google\s*play|play\s*store/i, "GPLAY"],
  [/apple|itunes|app\s*store/i, "APPLE"],
  [/netflix/i, "NFLX"],
  [/spotify/i, "SPOT"],
  [/amazon/i, "AMZN"],
];

function platformCode(name: string): string {
  for (const [re, code] of PLATFORM_MAP) if (re.test(name)) return code;
  return name.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "GHOST";
}

function productSummary(order: SourceOrder): string {
  const first = order.items[0];
  if (!first) return "Commande";
  const name = first.variant?.name || first.product.name;
  const extra = order.items.length - 1;
  return extra > 0 ? `${name} + ${extra} autre${extra > 1 ? "s" : ""}` : name;
}

function frenchDate(value: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

function statusGroup(status: string): OrderRowData["statusGroup"] {
  if (status === "delivered") return "delivered";
  if (status === "refunded" || status === "rejected" || status === "cancelled") return "other";
  return "processing";
}

export function toOrderRowData(order: SourceOrder, showAction = false): OrderRowData {
  const product = productSummary(order);
  const ref = getPublicOrderLabel(order);
  const date = frenchDate(order.createdAt);
  const statusLabel = orderStatusShort(order.status);
  return {
    id: order.id,
    href: `/order/${order.publicOrderPathSegment}`,
    code: platformCode(order.items[0]?.product.name ?? product),
    product,
    meta: `${ref} · ${date}`,
    amount: formatMAD(order.totalMad),
    statusLabel,
    statusClass: orderStatusBadgeClass(order.status),
    statusGroup: statusGroup(order.status),
    search: `${product} ${ref} ${statusLabel}`.toLowerCase(),
    showAction,
  };
}
