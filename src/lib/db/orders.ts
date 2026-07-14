import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import { isOrderingCurrentlyEnabled } from "./ordering";
import { resolveCartLines } from "./promoResolve";
import { reservePromoInTx } from "./promoCodes";
import { debitCreditTx, expireWalletIfDue } from "./ghostCredit";
import { timeAdmin } from "./adminTiming";
import { sendTransactionalEmail } from "@/lib/email/send-email";
import { getCurrentCustomer } from "@/lib/auth";
import { notifyOrderCreated } from "@/lib/discord/notify";
import {
  absoluteAppUrl,
  formatPublicOrderNumber,
  formatPublicOrderPathSegment,
  parsePublicOrderNumber,
} from "@/lib/orderNumber";
import { getAdminPaymentMethods } from "./paymentMethods";
import { resolveOrderPaymentMethod } from "@/lib/paymentMethod";
import { variantTitle } from "@/lib/pricing/variant-identity";
import type { OrderStatus } from "@/lib/types";
import type { AdminOverviewDTO, AdminOverviewMetricsDTO, CustomerDTO, CustomerOrderDTO, AdminOrderDTO, AdminOrderSummaryDTO, DeliveredFieldDTO, PaymentMethodDTO } from "@/lib/dto";

type OrderRecord = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;
type AdminOrderSummaryRecord = Awaited<ReturnType<typeof loadAdminOrderSummaries>>[number];
type PublicOrderIdentity = { id: string; createdAt: Date | string };

const REVENUE_ORDER_STATUSES = ["payment_confirmed", "delivered", "fulfilled"];

/** Thrown inside the createOrder transaction when a promo can't be reserved
 *  (e.g. its final use was claimed concurrently), rolling the order back. */
class PromoApplicationError extends Error {}

const emailLogSelect = {
  id: true,
  type: true,
  templateKey: true,
  recipient: true,
  subject: true,
  body: true,
  html: true,
  text: true,
  provider: true,
  providerMessageId: true,
  status: true,
  errorMessage: true,
  manuallyEdited: true,
  createdAt: true,
} as const;

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function buildEmailLogDTO(log: {
  id: string;
  type: string;
  templateKey: string | null;
  recipient: string;
  subject: string;
  body: string;
  html: string;
  text: string;
  provider: string;
  providerMessageId: string | null;
  status: string;
  errorMessage: string | null;
  manuallyEdited: boolean;
  createdAt: Date | string;
}) {
  return {
    id: log.id,
    type: log.type,
    templateKey: log.templateKey,
    recipient: log.recipient,
    subject: log.subject,
    body: log.body,
    html: log.html,
    text: log.text,
    provider: log.provider,
    providerMessageId: log.providerMessageId,
    status: log.status,
    errorMessage: log.errorMessage,
    manuallyEdited: log.manuallyEdited,
    createdAt: iso(log.createdAt),
  };
}

function orderItemName(item: {
  product: { name: string };
  variant?: {
    name: string;
    faceValue: number | null;
    faceCurrency: string;
  } | null;
}) {
  if (!item.variant) return item.product.name;
  return variantTitle(item.product.name, item.variant);
}

/**
 * Parses the stored provider delivery payload (JSON) into typed fields, keeping
 * only recognized string values. Returns undefined for plain local/manual
 * single-code deliveries (no structured payload).
 */
function parseDeliveryFields(value: unknown): DeliveredFieldDTO[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const fields = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const field: DeliveredFieldDTO = {};
      if (typeof record.code === "string" && record.code) field.code = record.code;
      if (typeof record.pin === "string" && record.pin) field.pin = record.pin;
      if (typeof record.url === "string" && record.url) field.url = record.url;
      if (typeof record.instructions === "string" && record.instructions) {
        field.instructions = record.instructions;
      }
      return field.code || field.pin || field.url || field.instructions ? field : null;
    })
    .filter((field): field is DeliveredFieldDTO => field !== null);
  return fields.length > 0 ? fields : undefined;
}

function buildCustomerDTO(
  data: OrderRecord,
  publicOrder: { number: string; pathSegment: string },
  options: { authorizedForCodes?: boolean; includeUndeliveredCodes?: boolean } = {},
): CustomerOrderDTO {
  // Delivered codes are secrets: expose them only when the caller is authorized
  // (a valid delivery token or the logged-in order owner — resolved upstream in
  // getCustomerOrder), or for the admin detail view (includeUndeliveredCodes).
  // Knowing the enumerable public order number alone is never sufficient.
  const canExposeCodes =
    options.includeUndeliveredCodes === true ||
    (options.authorizedForCodes === true && data.status === "delivered");
  return {
    id: data.id,
    publicOrderNumber: publicOrder.number,
    publicOrderPathSegment: publicOrder.pathSegment,
    status: data.status as OrderStatus,
    customerName: data.customerName,
    customerEmail: data.customerEmail,
    paymentMethod: data.paymentMethod,
    totalMad: data.totalMad,
    createdAt: iso(data.createdAt),
    items: data.items.map((item) => ({
      id: item.id,
      productId: item.variantId ?? item.product.slug,
      name: orderItemName(item),
      quantity: item.quantity,
      unitPriceMad: item.unitPriceMad,
      variantRegion: item.variant?.region || item.product.region || "",
      variantStockControl: item.variant?.stockControl,
      variantReloadlyProductId: item.variant?.reloadlyProductId ?? null,
      variantReloadlyCountryCode: item.variant?.reloadlyCountryCode ?? null,
    })),
    deliveredCodes: canExposeCodes
      ? data.deliveredCodes.map((delivered) => {
          const fields = parseDeliveryFields(delivered.deliveryPayload);
          return {
            productId: delivered.product.slug,
            orderItemId: delivered.orderItemId,
            code: delivered.digitalCode?.code ?? delivered.manualCode ?? "",
            ...(fields ? { fields } : {}),
          };
        })
      : [],
    proofUploaded: !!data.paymentProof,
    paymentEvents: data.paymentEvents.map((event) => ({
      id: event.id,
      type: event.type,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      note: event.note,
      createdAt: iso(event.createdAt),
    })),
    paymentProvider: data.paymentProvider,
    paymentProviderOrderId: data.paymentProviderOrderId,
    paymentProviderStatus: data.paymentProviderStatus,
    paymentConfirmedAt: data.paymentConfirmedAt ? iso(data.paymentConfirmedAt) : null,
  };
}

function loadOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      customerId: true,
      customerName: true,
      customerEmail: true,
      paymentMethod: true,
      totalMad: true,
      createdAt: true,
      deliveryToken: true,
      paymentProvider: true,
      paymentProviderOrderId: true,
      paymentProviderStatus: true,
      paymentConfirmedAt: true,
      items: {
        select: {
          id: true,
          variantId: true,
          quantity: true,
          unitPriceMad: true,
          product: { select: { slug: true, name: true, region: true } },
          variant: {
            select: {
              id: true,
              name: true,
              faceValue: true,
              faceCurrency: true,
              region: true,
              stockControl: true,
              reloadlyProductId: true,
              reloadlyCountryCode: true,
            },
          },
        },
      },
      deliveredCodes: {
        select: {
          orderItemId: true,
          manualCode: true,
          deliveryPayload: true,
          product: { select: { slug: true } },
          digitalCode: { select: { code: true } },
        },
      },
      paymentProof: { select: { id: true, mimeType: true } },
      paymentEvents: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          fromStatus: true,
          toStatus: true,
          note: true,
          createdAt: true,
        },
      },
    },
  });
}

export async function publicOrderSequence(order: PublicOrderIdentity): Promise<number> {
  const earlierOrders = await prisma.order.count({
    where: {
      OR: [
        { createdAt: { lt: order.createdAt } },
        { createdAt: order.createdAt, id: { lt: order.id } },
      ],
    },
  });
  return earlierOrders + 1;
}

export async function publicOrderReference(order: PublicOrderIdentity) {
  const sequence = await publicOrderSequence(order);
  return {
    number: formatPublicOrderNumber(sequence),
    pathSegment: formatPublicOrderPathSegment(sequence),
  };
}

export async function resolveOrderReference(reference: string): Promise<string | null> {
  const trimmed = decodeURIComponent(reference.trim());
  const legacyOrder = await prisma.order.findUnique({
    where: { id: trimmed },
    select: { id: true },
  });
  if (legacyOrder) return legacyOrder.id;

  const sequence = parsePublicOrderNumber(trimmed);
  if (sequence === null) return null;

  const [order] = await prisma.order.findMany({
    skip: sequence - 1,
    take: 1,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return order?.id ?? null;
}

function loadAdminOrderSummaries(options: { take?: number; statuses?: string[] } = {}) {
  return prisma.order.findMany({
    take: options.take ?? 50,
    where: options.statuses?.length ? { status: { in: options.statuses } } : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      customerName: true,
      customerEmail: true,
      paymentMethod: true,
      totalMad: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          variantId: true,
          quantity: true,
          unitPriceMad: true,
          product: { select: { slug: true, name: true } },
          variant: {
            select: {
              id: true,
              name: true,
              faceValue: true,
              faceCurrency: true,
            },
          },
        },
      },
      paymentProof: { select: { id: true, mimeType: true } },
    },
  });
}

function buildAdminSummaryDTO(
  order: AdminOrderSummaryRecord,
  methods: PaymentMethodDTO[],
  publicOrderNumber: string,
): AdminOrderSummaryDTO {
  return {
    id: order.id,
    publicOrderNumber,
    status: order.status as OrderStatus,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    paymentMethod: order.paymentMethod,
    paymentMethodLabel: resolveMethodLabel(order.paymentMethod, methods),
    totalMad: order.totalMad,
    createdAt: iso(order.createdAt),
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.variantId ?? item.product.slug,
      name: orderItemName(item),
      quantity: item.quantity,
      unitPriceMad: item.unitPriceMad,
    })),
    proofUploaded: !!order.paymentProof,
    proofMimeType: order.paymentProof?.mimeType ?? null,
  };
}

/**
 * Loads a customer-facing order by either its secret delivery token (from the
 * "Voir ma livraison" email link) or its public order number / internal id.
 *
 * Delivered codes are secrets, so they are only included when the caller is
 * authorized: possession of the unguessable delivery token, OR being the
 * logged-in owner of the order. The enumerable public order number by itself
 * loads the non-secret order view (status, amount, payment info) but never the
 * codes — this closes the previous hole where guessing `/delivery/000017`
 * exposed another customer's codes.
 */
export async function getCustomerOrder(
  idOrToken: string,
): Promise<CustomerOrderDTO | null> {
  await ensureDatabaseReady();

  const token = idOrToken.trim();
  let authorizedForCodes = false;
  let data: OrderRecord | null = null;

  // 1) Delivery-token path — the token itself is the authorization.
  if (token) {
    const tokenMatch = await prisma.order.findUnique({
      where: { deliveryToken: token },
      select: { id: true },
    });
    if (tokenMatch) {
      data = await loadOrder(tokenMatch.id);
      authorizedForCodes = true;
    }
  }

  // 2) Public order number / internal id path — codes only for the logged-in owner.
  if (!data) {
    const internalId = await resolveOrderReference(idOrToken);
    if (!internalId) return null;
    data = await loadOrder(internalId);
    if (!data) return null;
    authorizedForCodes = await isOrderOwner(data);
  }
  if (!data) return null;

  const reference = await publicOrderReference(data);
  return buildCustomerDTO(data, reference, { authorizedForCodes });
}

/** True when the current session customer owns the given order. */
async function isOrderOwner(order: {
  customerId: string | null;
  customerEmail: string;
}): Promise<boolean> {
  const customer = await getCurrentCustomer();
  if (!customer) return false;
  if (order.customerId && order.customerId === customer.id) return true;
  return order.customerEmail.toLowerCase() === customer.email.toLowerCase();
}

export async function getOrderSummaries(
  ids: string[],
): Promise<CustomerOrderDTO[]> {
  await ensureDatabaseReady();
  if (ids.length === 0) return [];
  const orders = await prisma.order.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: "desc" },
    include: {
      items: { include: { product: true, variant: true } },
      deliveredCodes: { include: { product: true, digitalCode: true } },
      paymentProof: { select: { id: true, mimeType: true } },
      paymentEvents: { orderBy: { createdAt: "asc" } },
    },
  });
  return Promise.all(
    orders.map(async (order) => {
      const reference = await publicOrderReference(order);
      return buildCustomerDTO(order, reference);
    }),
  );
}

export async function getAdminOrders(): Promise<AdminOrderSummaryDTO[]> {
  return getAdminOrdersPage();
}

export async function getAdminOrdersPage(options: {
  take?: number;
  statuses?: string[];
} = {}): Promise<AdminOrderSummaryDTO[]> {
  await ensureDatabaseReady();
  const [orders, { methods }, sequenceRows] = await Promise.all([
    timeAdmin(
      "admin.orders",
      "order.findMany.summary",
      () => loadAdminOrderSummaries(options),
      (rows) => rows.length,
    ),
    getAdminPaymentMethods(),
    // Global chronological order → position gives each order its public
    // sequence number without an N+1 count per row.
    prisma.order.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    }),
  ]);

  const sequenceById = new Map(sequenceRows.map((row, index) => [row.id, index + 1]));
  return orders.map((order) =>
    buildAdminSummaryDTO(
      order,
      methods,
      formatPublicOrderNumber(sequenceById.get(order.id) ?? 0),
    ),
  );
}

export async function getAdminOrderDetail(orderId: string): Promise<AdminOrderDTO | null> {
  await ensureDatabaseReady();
  const [order, emailLogs, discordRow] = await Promise.all([
    timeAdmin("admin.orderDetail", "order.findUnique.detail", () => loadOrder(orderId), (row) => (row ? 1 : 0)),
    timeAdmin(
      "admin.orderDetail",
      "emailLog.findMany",
      () =>
        prisma.emailLog.findMany({
          where: { orderId },
          orderBy: { createdAt: "asc" },
          select: emailLogSelect,
        }),
      (rows) => rows.length,
    ),
    // Discord delivery + customer connection state — queried separately so the
    // shared loadOrder()/OrderRecord shape (reused by customer-facing views that
    // never join the customer) stays untouched.
    prisma.order.findUnique({
      where: { id: orderId },
      select: {
        discordDeliveryRequested: true,
        discordDeliveryStatus: true,
        discordDeliveryError: true,
        discordDeliveryAttemptedAt: true,
        discordDeliverySentAt: true,
        customer: { select: { discordId: true, discordDmActivated: true } },
      },
    }),
  ]);

  if (!order) return null;
  const reference = await publicOrderReference(order);
  const connection: "none" | "connected" | "activated" = discordRow?.customer
    ?.discordDmActivated
    ? "activated"
    : discordRow?.customer?.discordId
      ? "connected"
      : "none";
  return {
    ...buildCustomerDTO(order, reference, { includeUndeliveredCodes: true }),
    emailLogs: emailLogs.map(buildEmailLogDTO),
    proofMimeType: order.paymentProof?.mimeType ?? null,
    discord: {
      connection,
      deliveryRequested: discordRow?.discordDeliveryRequested ?? false,
      deliveryStatus: discordRow?.discordDeliveryStatus ?? "NOT_REQUESTED",
      deliveryError: discordRow?.discordDeliveryError ?? null,
      deliveryAttemptedAt: discordRow?.discordDeliveryAttemptedAt
        ? iso(discordRow.discordDeliveryAttemptedAt)
        : null,
      deliverySentAt: discordRow?.discordDeliverySentAt
        ? iso(discordRow.discordDeliverySentAt)
        : null,
    },
  };
}

export async function getOrderEmailLogs(orderId: string): Promise<import("@/lib/dto").EmailLogDTO[]> {
  await ensureDatabaseReady();
  const logs = await timeAdmin(
    "admin.emailLogs",
    "emailLog.findMany",
    () =>
      prisma.emailLog.findMany({
        where: { orderId },
        orderBy: { createdAt: "asc" },
        select: emailLogSelect,
      }),
    (rows) => rows.length,
  );
  return logs.map(buildEmailLogDTO);
}

export async function getAdminStats(): Promise<{
  totalOrders: number;
  pendingCount: number;
  totalRevenue: number;
  customerCount: number;
}> {
  await ensureDatabaseReady();
  const [totalOrders, revenueResult, pendingCount, customerGroups] = await Promise.all([
    timeAdmin("admin.stats", "order.count.total", () => prisma.order.count(), (count) => count),
    timeAdmin(
      "admin.stats",
      "order.aggregate.revenue",
      () =>
        prisma.order.aggregate({
          where: { status: { in: REVENUE_ORDER_STATUSES } },
          _sum: { totalMad: true },
        }),
      () => 1,
    ),
    timeAdmin("admin.stats", "order.count.pending", () => prisma.order.count({ where: { status: { not: "delivered" } } }), (count) => count),
    timeAdmin(
      "admin.stats",
      "order.groupBy.customerEmail.count",
      () => prisma.order.groupBy({ by: ["customerEmail"] }),
      (rows) => rows.length,
    ),
  ]);
  return {
    totalOrders,
    totalRevenue: revenueResult._sum.totalMad ?? 0,
    pendingCount,
    customerCount: customerGroups.length,
  };
}

export async function getAdminNavCounts(): Promise<{
  activeOrders: number;
  paymentReview: number;
  supportOpen: number;
}> {
  await ensureDatabaseReady();
  const [activeOrders, paymentReview, supportOpen] = await Promise.all([
    timeAdmin(
      "admin.navCounts",
      "order.count.active",
      () => prisma.order.count({ where: { status: { not: "delivered" } } }),
      (count) => count,
    ),
    timeAdmin(
      "admin.navCounts",
      "order.count.paymentReview",
      () => prisma.order.count({ where: { status: "payment_submitted" } }),
      (count) => count,
    ),
    timeAdmin(
      "admin.navCounts",
      "supportTicket.count.open",
      () => prisma.supportTicket.count({ where: { status: "open" } }),
      (count) => count,
    ),
  ]);
  return { activeOrders, paymentReview, supportOpen };
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank: "Virement bancaire",
  usdt: "Crypto",
  crypto: "Crypto",
  card: "Carte",
  test: "Test",
};

/**
 * Resolve an order's stored `paymentMethod` (a PaymentMethod id for orders
 * created after the payment-methods migration, or a legacy type string for
 * older ones) to a customer-facing label. Falls back to the legacy label map,
 * then a generic label.
 */
function resolveMethodLabel(paymentMethod: string, methods: PaymentMethodDTO[]): string {
  const method = resolveOrderPaymentMethod(paymentMethod, methods);
  if (method) return method.name;
  return PAYMENT_METHOD_LABELS[paymentMethod] ?? "Paiement";
}

/**
 * Rich metrics for the Overview dashboard: trailing-7-day revenue and order
 * counts with week-over-week deltas, the daily revenue series for the bar
 * chart, and the payment-review queue preview.
 */
export async function getAdminOverviewMetrics(): Promise<AdminOverviewMetricsDTO> {
  await ensureDatabaseReady();

  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = new Date();

  // Seven day-buckets ending today (local start-of-day boundaries).
  const buckets = Array.from({ length: 7 }, (_, i) => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (6 - i));
    const label = new Intl.DateTimeFormat("fr-FR", { weekday: "short" })
      .format(start)
      .replace(/\.$/, "");
    return {
      start: start.getTime(),
      label: label.charAt(0).toUpperCase() + label.slice(1),
      value: 0,
    };
  });
  const windowStart = buckets[0].start;
  const prevWindowStart = windowStart - 7 * DAY_MS;

  const [paidOrders14, orders7, ordersPrev7, reviewOrders, queueSummaries] =
    await Promise.all([
      timeAdmin(
        "admin.overviewMetrics",
        "order.findMany.paid14",
        () =>
          prisma.order.findMany({
            where: {
              status: { in: REVENUE_ORDER_STATUSES },
              createdAt: { gte: new Date(prevWindowStart) },
            },
            select: { totalMad: true, createdAt: true },
          }),
        (rows) => rows.length,
      ),
      timeAdmin(
        "admin.overviewMetrics",
        "order.count.orders7",
        () => prisma.order.count({ where: { createdAt: { gte: new Date(windowStart) } } }),
        (count) => count,
      ),
      timeAdmin(
        "admin.overviewMetrics",
        "order.count.ordersPrev7",
        () =>
          prisma.order.count({
            where: { createdAt: { gte: new Date(prevWindowStart), lt: new Date(windowStart) } },
          }),
        (count) => count,
      ),
      timeAdmin(
        "admin.overviewMetrics",
        "order.findMany.review",
        () =>
          prisma.order.findMany({
            where: { status: "payment_submitted" },
            select: { createdAt: true },
          }),
        (rows) => rows.length,
      ),
      getAdminOrdersPage({ take: 5, statuses: ["payment_submitted"] }),
    ]);

  // Bucket paid orders into the trailing 7 days and the previous 7 days.
  let revenuePrev7 = 0;
  for (const order of paidOrders14) {
    const t = new Date(order.createdAt).getTime();
    if (t < windowStart) {
      revenuePrev7 += order.totalMad;
      continue;
    }
    const index = Math.floor((t - windowStart) / DAY_MS);
    if (index >= 0 && index < 7) buckets[index].value += order.totalMad;
  }

  const revenue7 = buckets.reduce((sum, b) => sum + b.value, 0);
  const maxBucket = buckets.reduce((max, b) => Math.max(max, b.value), 0);
  const revenueSeries = buckets.map((b) => ({
    label: b.label,
    value: b.value,
    highlight: maxBucket > 0 && b.value === maxBucket,
  }));

  const pct = (current: number, previous: number): number | null =>
    previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;

  const oldestReviewMs = reviewOrders.reduce<number | null>((oldest, o) => {
    const t = new Date(o.createdAt).getTime();
    return oldest === null || t < oldest ? t : oldest;
  }, null);

  return {
    revenue7,
    revenueDeltaPct: pct(revenue7, revenuePrev7),
    orders7,
    ordersDeltaPct: pct(orders7, ordersPrev7),
    awaitingReview: reviewOrders.length,
    oldestReviewWaitMin:
      oldestReviewMs === null ? null : Math.max(0, Math.round((now.getTime() - oldestReviewMs) / 60000)),
    revenueSeries,
    revenueAvgPerDay: Math.round(revenue7 / 7),
    queue: queueSummaries.map((order) => {
      const first = order.items[0];
      const itemLabel = first
        ? first.quantity > 1
          ? `${first.name} ×${first.quantity}`
          : first.name
        : "Commande";
      return {
        id: order.id,
        ref: `#${order.id.slice(-6).toUpperCase()}`,
        label: `${itemLabel} · ${order.paymentMethodLabel}`,
        waitMin: Math.max(0, Math.round((now.getTime() - new Date(order.createdAt).getTime()) / 60000)),
      };
    }),
  };
}

export async function getAdminOverview(): Promise<AdminOverviewDTO> {
  await ensureDatabaseReady();
  const [totalOrders, pendingFulfillment, revenue, customerGroups, recentOrders] =
    await Promise.all([
      timeAdmin("admin.overview", "order.count.total", () => prisma.order.count(), (count) => count),
      timeAdmin("admin.overview", "order.count.pending", () => prisma.order.count({ where: { status: { not: "delivered" } } }), (count) => count),
      timeAdmin(
        "admin.overview",
        "order.aggregate.revenue",
        () =>
          prisma.order.aggregate({
            where: { status: { in: REVENUE_ORDER_STATUSES } },
            _sum: { totalMad: true },
          }),
        () => 1,
      ),
      timeAdmin(
        "admin.overview",
        "order.groupBy.customerEmail.count",
        () => prisma.order.groupBy({ by: ["customerEmail"] }),
        (rows) => rows.length,
      ),
      getAdminOrdersPage({ take: 10 }),
    ]);

  return {
    totalOrders,
    pendingFulfillment,
    totalRevenue: revenue._sum.totalMad ?? 0,
    customers: customerGroups.length,
    recentOrders,
  };
}

export async function getAdminCustomers(take = 100): Promise<CustomerDTO[]> {
  await ensureDatabaseReady();
  const [groups, registeredCustomers] = await Promise.all([
    timeAdmin(
      "admin.customers",
      "order.groupBy.customerEmail",
      () =>
        prisma.order.groupBy({
          by: ["customerEmail"],
          _count: { _all: true },
          _sum: { totalMad: true },
          _max: { createdAt: true },
          orderBy: { _max: { createdAt: "desc" } },
        }),
      (rows) => rows.length,
    ),
    timeAdmin(
      "admin.customers",
      "customer.findMany.registered",
      () =>
        prisma.customer.findMany({
          // Any account with a usable credential is a real account — including
          // Discord-only accounts (no password / Google), which otherwise never
          // appear here since they may have no orders yet.
          where: {
            OR: [
              { passwordHash: { not: null } },
              { googleId: { not: null } },
              { discordId: { not: null } },
            ],
          },
          take,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            googleId: true,
            discordId: true,
            discordUsername: true,
            emailVerified: true,
            lastLoginAt: true,
            createdAt: true,
          },
        }),
      (rows) => rows.length,
    ),
  ]);

  const emails = groups.map((group) => group.customerEmail);
  const customers = await timeAdmin(
    "admin.customers",
    "customer.findMany.names",
    () =>
      prisma.customer.findMany({
        where: { email: { in: emails } },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          googleId: true,
          discordId: true,
          discordUsername: true,
          passwordHash: true,
          emailVerified: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
    (rows) => rows.length,
  );
  const customerByEmail = new Map(customers.map((customer) => [customer.email, customer]));
  const groupByEmail = new Map(groups.map((group) => [group.customerEmail, group]));
  const emptyDate = new Date(0).toISOString();

  // Internal Discord onboarding placeholder (see lib/auth.ts) — surfaced in the
  // admin list as "profile incomplete" rather than the raw fake address.
  const isPlaceholder = (email: string) => email.toLowerCase().endsWith("@users.noreply.ghost.ma");

  const rows: CustomerDTO[] = groups.map((group) => {
    const customer = customerByEmail.get(group.customerEmail);
    return {
      id: customer?.id ?? null,
      name: customer?.name ?? group.customerEmail,
      email: group.customerEmail,
      phone: customer?.phone ?? null,
      kind:
        customer?.passwordHash || customer?.googleId || customer?.discordId
          ? "registered"
          : "guest",
      emailVerified: customer?.emailVerified ?? false,
      orderCount: group._count._all,
      totalSpent: group._sum.totalMad ?? 0,
      lastOrderAt: group._max.createdAt?.toISOString() ?? emptyDate,
      lastLoginAt: customer?.lastLoginAt?.toISOString() ?? null,
      createdAt: customer?.createdAt?.toISOString() ?? null,
      discordUsername: customer?.discordUsername ?? null,
      profileIncomplete: isPlaceholder(group.customerEmail),
    };
  });

  for (const customer of registeredCustomers) {
    if (groupByEmail.has(customer.email)) continue;
    rows.push({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      kind: "registered",
      emailVerified: customer.emailVerified,
      orderCount: 0,
      totalSpent: 0,
      lastOrderAt: emptyDate,
      lastLoginAt: customer.lastLoginAt?.toISOString() ?? null,
      createdAt: customer.createdAt.toISOString(),
      discordUsername: customer.discordUsername,
      profileIncomplete: isPlaceholder(customer.email),
    });
  }

  return rows
    .sort((a, b) => {
      const aDate = a.orderCount > 0 ? a.lastOrderAt : a.createdAt ?? "";
      const bDate = b.orderCount > 0 ? b.lastOrderAt : b.createdAt ?? "";
      return bDate.localeCompare(aDate);
    })
    .slice(0, take);
}

/**
 * Deletes a customer account. Orders are preserved: the Order→Customer relation
 * is `onDelete: SetNull`, so past orders keep their snapshot name/email and stay
 * in the history as guest rows. Guarded against deleting yourself or another
 * admin.
 */
export async function deleteCustomerAccount(
  customerId: string,
  actingAdminId: string,
): Promise<{ ok: boolean; error?: string }> {
  await ensureDatabaseReady();
  if (!customerId) return { ok: false, error: "Compte introuvable." };
  if (customerId === actingAdminId) {
    return { ok: false, error: "Vous ne pouvez pas supprimer votre propre compte." };
  }
  const target = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, role: true },
  });
  if (!target) return { ok: false, error: "Compte introuvable." };
  if (target.role === "ADMIN") {
    return { ok: false, error: "Impossible de supprimer un compte administrateur." };
  }
  await prisma.customer.delete({ where: { id: customerId } });
  return { ok: true };
}

interface CreateOrderInput {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  /** Optional: unset until the customer picks a method on the payment page. */
  paymentMethod?: string;
  items: { productId: string; quantity: number }[];
  /** Optional promo code applied at checkout (re-validated server-side here). */
  promoCode?: string;
  /** Optional Ghost Credit (whole MAD) the logged-in customer chose to spend.
   *  Re-capped server-side to the live balance and the remaining total. */
  ghostCreditToApplyMad?: number;
}

function normalizeOptionalPhone(value?: string) {
  const phone = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!phone) return null;
  if (!/^\+?[0-9][0-9\s().-]*$/.test(phone)) return undefined;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15 ? phone : undefined;
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<{ id: string; publicOrderNumber: string; publicOrderPathSegment: string } | null> {
  await ensureDatabaseReady();
  // Hard backstop for the global "Accept customer orders" toggle: refuse to
  // create an order (no incomplete/partial row) while ordering is disabled,
  // even if a caller bypassed the action-layer guard.
  if (!(await isOrderingCurrentlyEnabled())) return null;
  // Resolve + re-price every line from the DB (never trust client prices). The
  // shared resolver also tags each line with its parent product + category so a
  // promo code can be evaluated against product/category restrictions.
  const resolvedLines = await resolveCartLines(input.items);
  if (resolvedLines.length === 0) return null;

  const subtotalMad = resolvedLines.reduce(
    (sum, item) => sum + item.unitPriceMad * item.quantity,
    0,
  );
  const rawPromoCode = input.promoCode?.trim();
  try {
    const sessionCustomer = await getCurrentCustomer();
    const customerName = sessionCustomer?.name ?? input.customerName;
    const customerEmail = sessionCustomer?.email ?? input.customerEmail.trim().toLowerCase();
    const customerPhone = normalizeOptionalPhone(input.customerPhone);
    if (customerPhone === undefined) return null;
    const result = await prisma.$transaction(async (tx) => {
      const customer = sessionCustomer
        ? await tx.customer.update({
            where: { id: sessionCustomer.id },
            data: { name: customerName, phone: customerPhone ?? undefined },
          })
        : await tx.customer.upsert({
            where: { email: customerEmail },
            update: { name: customerName, phone: customerPhone ?? undefined },
            create: {
              name: customerName,
              email: customerEmail,
              phone: customerPhone,
            },
          });

      const created = await tx.order.create({
        data: {
          customerId: customer.id,
          customerName,
          customerEmail,
          paymentMethod: input.paymentMethod ?? "",
          status: "pending_payment",
          totalMad: subtotalMad,
          items: {
            create: resolvedLines.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              unitPriceMad: item.unitPriceMad,
            })),
          },
        },
        include: { items: { select: { id: true, productId: true, variantId: true } } },
      });

      let discountMad = 0;
      // Apply and reserve the promo atomically. A failure here (race on the last
      // use, or a code that turned invalid) rolls back the whole order so the
      // customer is never charged an unexpected total.
      if (rawPromoCode) {
        const lineKeyToOrderItemId = new Map<string, string>();
        for (const line of resolvedLines) {
          const match = created.items.find(
            (it) => it.productId === line.productId && (it.variantId ?? null) === (line.variantId ?? null),
          );
          if (match) lineKeyToOrderItemId.set(line.lineKey, match.id);
        }
        const reservation = await reservePromoInTx(tx, {
          rawCode: rawPromoCode,
          orderId: created.id,
          lines: resolvedLines,
          lineKeyToOrderItemId,
          isLoggedIn: Boolean(sessionCustomer),
          customerId: customer.id,
          customerEmail,
          now: new Date(),
        });
        if (!reservation.ok) {
          throw new PromoApplicationError(reservation.error ?? "Code promo invalide.");
        }
        discountMad = reservation.discountMad;
      }

      // Spend Ghost Credit chosen by a logged-in customer. Re-checked here
      // server-side (never trust the client amount): capped at the live wallet
      // balance (after applying any due expiry) and at the remaining total, and
      // debited from the ledger in this same transaction.
      let creditAppliedMad = 0;
      const requestedCredit = Math.floor(input.ghostCreditToApplyMad ?? 0);
      if (sessionCustomer && requestedCredit > 0) {
        await expireWalletIfDue(tx, customer.id);
        const wallet = await tx.customer.findUnique({
          where: { id: customer.id },
          select: { ghostCreditBalanceMad: true },
        });
        const balance = wallet?.ghostCreditBalanceMad ?? 0;
        const remainingTotal = Math.max(0, subtotalMad - discountMad);
        creditAppliedMad = Math.max(0, Math.min(requestedCredit, balance, remainingTotal));
        if (creditAppliedMad > 0) {
          await debitCreditTx(tx, {
            customerId: customer.id,
            amountMad: creditAppliedMad,
            reason: "order_spend",
            idempotencyKey: `credit-spend:${created.id}`,
            orderId: created.id,
            source: "system",
            note: "Crédit Ghost utilisé sur la commande",
            allowNegative: false,
          });
        }
      }

      const finalTotalMad = Math.max(0, subtotalMad - discountMad - creditAppliedMad);
      if (discountMad > 0 || creditAppliedMad > 0) {
        await tx.order.update({
          where: { id: created.id },
          data: { discountMad, ghostCreditAppliedMad: creditAppliedMad, totalMad: finalTotalMad },
        });
      }

      const noteParts: string[] = [];
      if (discountMad > 0) noteParts.push(`Promo -${discountMad} DH`);
      if (creditAppliedMad > 0) noteParts.push(`Crédit Ghost -${creditAppliedMad} DH`);
      await tx.paymentEvent.create({
        data: {
          orderId: created.id,
          type: "status_change",
          toStatus: "pending_payment",
          note: noteParts.length ? `Order created. ${noteParts.join(", ")}.` : "Order created.",
        },
      });

      return { order: created, totalMad: finalTotalMad };
    });
    const order = result.order;
    const totalMad = result.totalMad;

    const reference = await publicOrderReference(order);

    try {
      await sendTransactionalEmail({
        to: customerEmail,
        orderId: order.id,
        customerId: order.customerId,
        templateKey: "order_received",
        type: "order_received",
        variables: {
          customer_name: customerName,
          order_number: reference.number,
          payment_url: absoluteAppUrl(`/payment/${reference.pathSegment}`),
          order_url: absoluteAppUrl(`/order/${reference.pathSegment}`),
          total: `${totalMad} MAD`,
        },
      });
    } catch (emailError) {
      console.error("[email:order_received]", emailError);
    }

    void notifyOrderCreated({
      order,
      publicOrderNumber: reference.number,
      itemSummary: resolvedLines
        .map((item) => `${item.quantity}x ${item.name}`)
        .join(", "),
      adminUrl: absoluteAppUrl(`/admin/orders/${order.id}`),
    });

    return {
      id: order.id,
      publicOrderNumber: reference.number,
      publicOrderPathSegment: reference.pathSegment,
    };
  } catch (error) {
    console.error("[createOrder]", error);
    return null;
  }
}

export async function findOrderByEmailAndId(
  id: string,
  email: string,
): Promise<{
  id: string;
  status: string;
  publicOrderPathSegment: string;
  deliveryToken: string | null;
} | null> {
  await ensureDatabaseReady();
  const normalizedEmail = email.trim().toLowerCase();
  const publicOrderNumber = parsePublicOrderNumber(id);

  if (publicOrderNumber !== null) {
    const [order] = await prisma.order.findMany({
      skip: publicOrderNumber - 1,
      take: 1,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, status: true, customerEmail: true, deliveryToken: true },
    });

    if (order?.customerEmail.toLowerCase() === normalizedEmail) {
      return {
        id: order.id,
        status: order.status,
        publicOrderPathSegment: formatPublicOrderPathSegment(publicOrderNumber),
        deliveryToken: order.deliveryToken,
      };
    }
  }

  const order = await prisma.order.findFirst({
    where: { id: id.trim(), customerEmail: { equals: normalizedEmail, mode: "insensitive" } },
    select: { id: true, status: true, createdAt: true, deliveryToken: true },
  });
  if (!order) return null;
  const reference = await publicOrderReference(order);
  return {
    id: order.id,
    status: order.status,
    publicOrderPathSegment: reference.pathSegment,
    deliveryToken: order.deliveryToken,
  };
}
