import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import { timeAdmin } from "./adminTiming";
import { sendTransactionalEmail } from "@/lib/email/send-email";
import { formatPublicOrderNumber, parsePublicOrderNumber } from "@/lib/orderNumber";
import type { OrderStatus } from "@/lib/types";
import type { AdminOverviewDTO, CustomerDTO, CustomerOrderDTO, AdminOrderDTO, AdminOrderSummaryDTO } from "@/lib/dto";

type OrderRecord = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;
type AdminOrderSummaryRecord = Awaited<ReturnType<typeof loadAdminOrderSummaries>>[number];

const REVENUE_ORDER_STATUSES = ["payment_confirmed", "delivered", "fulfilled"];

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
  return item.variant.faceValue != null
    ? `${item.product.name} ${item.variant.faceValue} ${item.variant.faceCurrency}`
    : item.variant.name;
}

function buildCustomerDTO(
  data: OrderRecord,
  publicOrderNumber?: string,
  options: { includeUndeliveredCodes?: boolean } = {},
): CustomerOrderDTO {
  const canExposeCodes = data.status === "delivered" || options.includeUndeliveredCodes;
  return {
    id: data.id,
    publicOrderNumber,
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
    })),
    deliveredCodes: canExposeCodes
      ? data.deliveredCodes.map((delivered) => ({
          productId: delivered.product.slug,
          orderItemId: delivered.orderItemId,
          code: delivered.digitalCode?.code ?? delivered.manualCode ?? "",
        }))
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
  };
}

function loadOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
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
      deliveredCodes: {
        select: {
          orderItemId: true,
          manualCode: true,
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

function buildAdminSummaryDTO(order: AdminOrderSummaryRecord): AdminOrderSummaryDTO {
  return {
    id: order.id,
    status: order.status as OrderStatus,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    paymentMethod: order.paymentMethod,
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

export async function getCustomerOrder(
  id: string,
): Promise<CustomerOrderDTO | null> {
  await ensureDatabaseReady();
  const data = await loadOrder(id);
  if (!data) return null;

  const earlierOrders = await prisma.order.count({
    where: {
      OR: [
        { createdAt: { lt: data.createdAt } },
        { createdAt: data.createdAt, id: { lt: data.id } },
      ],
    },
  });

  return buildCustomerDTO(data, formatPublicOrderNumber(earlierOrders + 1));
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
  return orders.map((order) => buildCustomerDTO(order));
}

export async function getAdminOrders(): Promise<AdminOrderSummaryDTO[]> {
  return getAdminOrdersPage();
}

export async function getAdminOrdersPage(options: {
  take?: number;
  statuses?: string[];
} = {}): Promise<AdminOrderSummaryDTO[]> {
  await ensureDatabaseReady();
  const orders = await timeAdmin(
    "admin.orders",
    "order.findMany.summary",
    () => loadAdminOrderSummaries(options),
    (rows) => rows.length,
  );

  return orders.map(buildAdminSummaryDTO);
}

export async function getAdminOrderDetail(orderId: string): Promise<AdminOrderDTO | null> {
  await ensureDatabaseReady();
  const [order, emailLogs] = await Promise.all([
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
  ]);

  if (!order) return null;
  return {
    ...buildCustomerDTO(order, undefined, { includeUndeliveredCodes: true }),
    emailLogs: emailLogs.map(buildEmailLogDTO),
    proofMimeType: order.paymentProof?.mimeType ?? null,
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
  const groups = await timeAdmin(
    "admin.customers",
    "order.groupBy.customerEmail",
    () =>
      prisma.order.groupBy({
        by: ["customerEmail"],
        take,
        _count: { _all: true },
        _sum: { totalMad: true },
        _max: { createdAt: true },
        orderBy: { _max: { createdAt: "desc" } },
      }),
    (rows) => rows.length,
  );

  const emails = groups.map((group) => group.customerEmail);
  const customers = await timeAdmin(
    "admin.customers",
    "customer.findMany.names",
    () =>
      prisma.customer.findMany({
        where: { email: { in: emails } },
        select: { name: true, email: true },
      }),
    (rows) => rows.length,
  );
  const names = new Map(customers.map((customer) => [customer.email, customer.name]));

  return groups.map((group) => ({
    name: names.get(group.customerEmail) ?? group.customerEmail,
    email: group.customerEmail,
    orderCount: group._count._all,
    totalSpent: group._sum.totalMad ?? 0,
    lastOrderAt: group._max.createdAt?.toISOString() ?? new Date(0).toISOString(),
  }));
}

interface CreateOrderInput {
  customerName: string;
  customerEmail: string;
  paymentMethod: string;
  items: { productId: string; quantity: number }[];
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<{ id: string } | null> {
  await ensureDatabaseReady();
  const slugs = input.items.map((item) => item.productId);
  const [products, variants] = await Promise.all([
    prisma.product.findMany({
      where: {
        slug: { in: slugs },
        active: true,
        categoryRecord: { is: { active: true } },
      },
    }),
    prisma.productVariant.findMany({
      where: {
        id: { in: slugs },
        active: true,
        product: {
          active: true,
          categoryRecord: { is: { active: true } },
        },
      },
      include: { product: true },
    }),
  ]);

  const bySlug = new Map(
    products.map((product) => [
      product.slug,
      { productId: product.id, variantId: null as string | null, unitPriceMad: product.priceMad },
    ]),
  );
  for (const variant of variants) {
    bySlug.set(variant.id, {
      productId: variant.productId,
      variantId: variant.id,
      unitPriceMad: variant.priceMad,
    });
  }
  const lineItems = input.items
    .map((item) => {
      const purchasable = bySlug.get(item.productId);
      if (!purchasable || item.quantity < 1) return null;
      return {
        productId: purchasable.productId,
        variantId: purchasable.variantId,
        quantity: item.quantity,
        unitPriceMad: purchasable.unitPriceMad,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (lineItems.length === 0) return null;

  const totalMad = lineItems.reduce(
    (sum, item) => sum + item.unitPriceMad * item.quantity,
    0,
  );
  try {
    const order = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { email: input.customerEmail },
        update: { name: input.customerName },
        create: {
          name: input.customerName,
          email: input.customerEmail,
        },
      });

      const created = await tx.order.create({
        data: {
          customerId: customer.id,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          paymentMethod: input.paymentMethod,
          status: "pending_payment",
          totalMad,
          items: {
            create: lineItems.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              unitPriceMad: item.unitPriceMad,
            })),
          },
        },
      });

      await tx.paymentEvent.create({
        data: {
          orderId: created.id,
          type: "status_change",
          toStatus: "pending_payment",
          note: "Order created.",
        },
      });

      return created;
    });

    try {
      await sendTransactionalEmail({
        to: input.customerEmail,
        orderId: order.id,
        customerId: order.customerId,
        templateKey: "order_received",
        type: "order_received",
        variables: {
          customer_name: input.customerName,
          order_number: order.id,
          payment_url: `/payment/${order.id}`,
          order_url: `/order/${order.id}`,
          total: `${totalMad} MAD`,
        },
      });
    } catch (emailError) {
      console.error("[email:order_received]", emailError);
    }

    return { id: order.id };
  } catch (error) {
    console.error("[createOrder]", error);
    return null;
  }
}

export async function findOrderByEmailAndId(
  id: string,
  email: string,
): Promise<{ id: string; status: string } | null> {
  await ensureDatabaseReady();
  const normalizedEmail = email.trim().toLowerCase();
  const publicOrderNumber = parsePublicOrderNumber(id);

  if (publicOrderNumber !== null) {
    const [order] = await prisma.order.findMany({
      skip: publicOrderNumber - 1,
      take: 1,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, status: true, customerEmail: true },
    });

    if (order?.customerEmail.toLowerCase() === normalizedEmail) {
      return { id: order.id, status: order.status };
    }
  }

  const order = await prisma.order.findFirst({
    where: { id: id.trim(), customerEmail: { equals: normalizedEmail, mode: "insensitive" } },
    select: { id: true, status: true },
  });
  return order ?? null;
}
