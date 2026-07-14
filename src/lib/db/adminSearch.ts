import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import { formatPublicOrderNumber, parsePublicOrderNumber } from "@/lib/orderNumber";

export type CommandSearchTone = "amber" | "green" | "red" | "blue";

export type CommandSearchItem = {
  id: string;
  title: string;
  subtitle: string;
  /** Render the subtitle in the mono font (IDs, SKUs, amounts). */
  mono?: boolean;
  status?: { text: string; tone: CommandSearchTone };
  href: string;
  /** Exact match — floats to the very top of the whole list. */
  exact?: boolean;
};

export type CommandSearchGroupKey =
  | "orders"
  | "customers"
  | "products"
  | "variants"
  | "promo"
  | "expenses"
  | "pages"
  | "settings"
  | "controls";

export type CommandSearchGroup = {
  group: CommandSearchGroupKey;
  hasMore: boolean;
  items: CommandSearchItem[];
};

export type CommandSearchResult = {
  query: string;
  groups: CommandSearchGroup[];
};

const GROUP_LIMIT = 5;

const ORDER_STATUS_BADGE: Record<string, { text: string; tone: CommandSearchTone }> = {
  pending_payment: { text: "en attente", tone: "amber" },
  payment_submitted: { text: "revue", tone: "amber" },
  payment_confirmed: { text: "confirmé", tone: "blue" },
  payment_issue: { text: "problème", tone: "red" },
  rejected: { text: "rejeté", tone: "red" },
  delivered: { text: "livré", tone: "green" },
  refunded: { text: "remboursé", tone: "red" },
  cancelled: { text: "annulé", tone: "red" },
};

/** Status keywords an admin might type, mapped to order statuses. */
const STATUS_KEYWORDS: Record<string, string[]> = {
  attente: ["pending_payment"],
  pending: ["pending_payment"],
  revue: ["payment_submitted"],
  review: ["payment_submitted"],
  soumis: ["payment_submitted"],
  confirm: ["payment_confirmed"],
  livr: ["delivered"],
  deliver: ["delivered"],
  rejet: ["rejected"],
  reject: ["rejected"],
  rembours: ["refunded"],
  refund: ["refunded"],
  annul: ["cancelled"],
  cancel: ["cancelled"],
  "problème": ["payment_issue"],
  probleme: ["payment_issue"],
  issue: ["payment_issue"],
};

function matchedStatuses(query: string): string[] {
  const q = query.toLowerCase();
  const statuses = new Set<string>();
  for (const [keyword, values] of Object.entries(STATUS_KEYWORDS)) {
    if (q.includes(keyword)) values.forEach((value) => statuses.add(value));
  }
  return [...statuses];
}

type OrderRow = {
  id: string;
  createdAt: Date;
  customerName: string;
  customerEmail: string;
  status: string;
  totalMad: number;
  items: { product: { name: string } }[];
};

const ORDER_SELECT = {
  id: true,
  createdAt: true,
  customerName: true,
  customerEmail: true,
  status: true,
  totalMad: true,
  items: { select: { product: { select: { name: true } } }, take: 2 },
} as const;

async function orderSequences(orders: OrderRow[]): Promise<Map<string, number>> {
  const sequences = await Promise.all(
    orders.map((order) =>
      prisma.order.count({
        where: {
          OR: [
            { createdAt: { lt: order.createdAt } },
            { createdAt: order.createdAt, id: { lt: order.id } },
          ],
        },
      }),
    ),
  );
  return new Map(orders.map((order, index) => [order.id, sequences[index] + 1]));
}

function orderItem(order: OrderRow, sequence: number, exact = false): CommandSearchItem {
  const productNames = order.items.map((item) => item.product.name).join(", ");
  const number = formatPublicOrderNumber(sequence);
  return {
    id: order.id,
    title: productNames ? `Commande ${number} · ${productNames}` : `Commande ${number}`,
    subtitle: `${order.customerName} · ${order.totalMad} MAD`,
    status: ORDER_STATUS_BADGE[order.status] ?? { text: order.status, tone: "blue" },
    href: `/admin/orders/${order.id}`,
    exact,
  };
}

async function searchOrders(query: string): Promise<CommandSearchGroup | null> {
  // `#000128` (or bare digits) is an exact order lookup by public sequence.
  const sequence = parsePublicOrderNumber(query);
  if (sequence !== null && /^#?\d+$/.test(query.trim())) {
    const [order] = await prisma.order.findMany({
      skip: sequence - 1,
      take: 1,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: ORDER_SELECT,
    });
    if (!order) return null;
    return { group: "orders", hasMore: false, items: [orderItem(order, sequence, true)] };
  }

  const statuses = matchedStatuses(query);
  const orders = await prisma.order.findMany({
    take: GROUP_LIMIT + 1,
    orderBy: { createdAt: "desc" },
    where: {
      OR: [
        { customerName: { contains: query, mode: "insensitive" } },
        { customerEmail: { contains: query, mode: "insensitive" } },
        { items: { some: { product: { name: { contains: query, mode: "insensitive" } } } } },
        ...(statuses.length ? [{ status: { in: statuses } }] : []),
      ],
    },
    select: ORDER_SELECT,
  });
  if (orders.length === 0) return null;

  const visible = orders.slice(0, GROUP_LIMIT);
  const sequences = await orderSequences(visible);
  const normalizedQuery = query.trim().toLowerCase();
  return {
    group: "orders",
    hasMore: orders.length > GROUP_LIMIT,
    items: visible.map((order) =>
      orderItem(
        order,
        sequences.get(order.id) ?? 0,
        order.customerEmail.toLowerCase() === normalizedQuery,
      ),
    ),
  };
}

async function searchCustomers(query: string): Promise<CommandSearchGroup | null> {
  const customers = await prisma.customer.findMany({
    take: GROUP_LIMIT + 1,
    orderBy: { updatedAt: "desc" },
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      _count: { select: { orders: true } },
    },
  });
  if (customers.length === 0) return null;

  const normalizedQuery = query.trim().toLowerCase();
  return {
    group: "customers",
    hasMore: customers.length > GROUP_LIMIT,
    items: customers.slice(0, GROUP_LIMIT).map((customer) => ({
      id: customer.id,
      title: customer.name,
      subtitle: `${customer.email} · ${customer._count.orders} commande${customer._count.orders > 1 ? "s" : ""}`,
      mono: true,
      href: "/admin?tab=customers",
      exact: customer.email.toLowerCase() === normalizedQuery,
    })),
  };
}

async function searchProducts(query: string): Promise<CommandSearchGroup | null> {
  const products = await prisma.product.findMany({
    take: GROUP_LIMIT + 1,
    orderBy: { sortOrder: "asc" },
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { category: { contains: query, mode: "insensitive" } },
        { brand: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      category: true,
      active: true,
      _count: { select: { variants: true } },
    },
  });
  if (products.length === 0) return null;

  return {
    group: "products",
    hasMore: products.length > GROUP_LIMIT,
    items: products.slice(0, GROUP_LIMIT).map((product) => ({
      id: product.id,
      title: product.name,
      subtitle: `${product._count.variants} variante${product._count.variants > 1 ? "s" : ""} · ${product.category}`,
      status: product.active ? undefined : { text: "inactif", tone: "red" },
      href: "/admin?tab=products",
    })),
  };
}

async function searchVariants(query: string): Promise<CommandSearchGroup | null> {
  const variants = await prisma.productVariant.findMany({
    take: GROUP_LIMIT + 1,
    orderBy: { sortOrder: "asc" },
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { product: { name: { contains: query, mode: "insensitive" } } },
        // ProductVariant.id IS the SKU — admins paste SKUs directly.
        { id: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      priceMad: true,
      active: true,
      product: { select: { name: true } },
      _count: { select: { digitalCodes: { where: { status: "unused" } } } },
    },
  });
  if (variants.length === 0) return null;

  return {
    group: "variants",
    hasMore: variants.length > GROUP_LIMIT,
    items: variants.slice(0, GROUP_LIMIT).map((variant) => {
      const stock = variant._count.digitalCodes;
      return {
        id: variant.id,
        title: `${variant.product.name} · ${variant.name}`,
        subtitle: `${variant.id} · ${variant.priceMad} MAD`,
        mono: true,
        status: !variant.active
          ? { text: "inactif", tone: "red" as const }
          : stock > 0
          ? { text: `${stock} en stock`, tone: "green" as const }
          : { text: "épuisé", tone: "red" as const },
        href: "/admin?tab=products",
      };
    }),
  };
}

/** Promo codes by code or internal name. Rows open the Codes promo panel. */
async function searchPromoCodes(query: string): Promise<CommandSearchGroup | null> {
  const promos = await prisma.promoCode.findMany({
    take: GROUP_LIMIT + 1,
    orderBy: [{ archivedAt: "asc" }, { createdAt: "desc" }],
    where: {
      OR: [
        { code: { contains: query, mode: "insensitive" } },
        { internalName: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      code: true,
      internalName: true,
      active: true,
      archivedAt: true,
      rewardType: true,
    },
  });
  if (promos.length === 0) return null;

  const normalizedQuery = query.trim().toLowerCase();
  return {
    group: "promo",
    hasMore: promos.length > GROUP_LIMIT,
    items: promos.slice(0, GROUP_LIMIT).map((promo) => ({
      id: promo.id,
      title: promo.code,
      subtitle: promo.internalName,
      mono: true,
      status: promo.archivedAt
        ? { text: "archivé", tone: "red" as const }
        : promo.active
        ? { text: "actif", tone: "green" as const }
        : { text: "désactivé", tone: "amber" as const },
      href: "/admin?tab=promo-codes",
      exact: promo.code.toLowerCase() === normalizedQuery,
    })),
  };
}

/** Expense ledger: recurring subscriptions + standalone entries by service
 *  name or category. All rows open the admin Dépenses panel. */
async function searchExpenses(query: string): Promise<CommandSearchGroup | null> {
  const where = {
    OR: [
      { name: { contains: query, mode: "insensitive" as const } },
      { category: { contains: query, mode: "insensitive" as const } },
    ],
  };
  const [recurrings, entries] = await Promise.all([
    prisma.recurringExpense.findMany({
      take: GROUP_LIMIT + 1,
      orderBy: { nextBillingDate: "asc" },
      where,
      select: { id: true, name: true, category: true, status: true, currency: true, amount: true },
    }),
    prisma.expenseEntry.findMany({
      take: GROUP_LIMIT + 1,
      orderBy: { createdAt: "desc" },
      where: { ...where, recurringExpenseId: null },
      select: { id: true, name: true, category: true, status: true, currency: true, amountOriginal: true },
    }),
  ]);
  if (recurrings.length === 0 && entries.length === 0) return null;

  const items: CommandSearchItem[] = [
    ...recurrings.map((expense) => ({
      id: `recur-${expense.id}`,
      title: expense.name,
      subtitle: `Abonnement · ${expense.category}${expense.amount != null ? ` · ${Number(expense.amount)} ${expense.currency}` : ""}`,
      status:
        expense.status === "cancelled"
          ? { text: "résilié", tone: "red" as const }
          : expense.status === "paused"
          ? { text: "en pause", tone: "amber" as const }
          : { text: "actif", tone: "green" as const },
      href: "/admin?tab=expenses",
    })),
    ...entries.map((entry) => ({
      id: `entry-${entry.id}`,
      title: entry.name,
      subtitle: `Dépense · ${entry.category}${entry.amountOriginal != null ? ` · ${Number(entry.amountOriginal)} ${entry.currency}` : ""}`,
      href: "/admin?tab=expenses",
    })),
  ];
  return {
    group: "expenses",
    hasMore: items.length > GROUP_LIMIT,
    items: items.slice(0, GROUP_LIMIT),
  };
}

/**
 * Grouped admin command-palette search over server data
 * (orders, customers, products, variants, promo codes, expenses). Pages and
 * settings are a static index resolved instantly on the client.
 */
export async function adminCommandSearch(rawQuery: string): Promise<CommandSearchResult> {
  await ensureDatabaseReady();
  const query = rawQuery.trim();
  if (!query) return { query, groups: [] };

  const isOrderLookup = /^#?\d+$/.test(query);
  const isEmailish = query.includes("@");

  const [orders, customers, products, variants, promo, expenses] = await Promise.all([
    searchOrders(query),
    isOrderLookup ? Promise.resolve(null) : searchCustomers(query),
    isOrderLookup || isEmailish ? Promise.resolve(null) : searchProducts(query),
    isOrderLookup || isEmailish ? Promise.resolve(null) : searchVariants(query),
    isOrderLookup || isEmailish ? Promise.resolve(null) : searchPromoCodes(query),
    isOrderLookup || isEmailish ? Promise.resolve(null) : searchExpenses(query),
  ]);

  const groups = [orders, customers, products, variants, promo, expenses].filter(
    (group): group is CommandSearchGroup => group !== null,
  );
  return { query, groups };
}
