import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import { timeAdmin } from "./adminTiming";
import { formatPublicOrderNumber, parsePublicOrderNumber } from "@/lib/orderNumber";
import type { OrderStatus } from "@/lib/types";
import type { AdminOverviewDTO, CustomerDTO, CustomerOrderDTO, AdminOrderDTO, AdminOrderSummaryDTO } from "@/lib/dto";

type OrderRecord = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;
type AdminOrderSummaryRecord = Awaited<ReturnType<typeof loadAdminOrderSummaries>>[number];

const REVENUE_ORDER_STATUSES = ["payment_confirmed", "delivered", "fulfilled"];

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function buildCustomerDTO(data: OrderRecord, publicOrderNumber?: string): CustomerOrderDTO {
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
      productId: item.product.slug,
      name: item.product.name,
      quantity: item.quantity,
      unitPriceMad: item.unitPriceMad,
    })),
    deliveredCodes: data.deliveredCodes.map((delivered) => ({
      productId: delivered.product.slug,
      orderItemId: delivered.orderItemId,
      code: delivered.digitalCode?.code ?? delivered.manualCode ?? "",
    })),
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
          quantity: true,
          unitPriceMad: true,
          product: { select: { slug: true, name: true } },
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
          quantity: true,
          unitPriceMad: true,
          product: { select: { slug: true, name: true } },
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
      productId: item.product.slug,
      name: item.product.name,
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
      items: { include: { product: true } },
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
          select: {
            id: true,
            type: true,
            recipient: true,
            subject: true,
            body: true,
            createdAt: true,
          },
        }),
      (rows) => rows.length,
    ),
  ]);

  if (!order) return null;
  return {
    ...buildCustomerDTO(order),
    emailLogs: emailLogs.map((log) => ({
      id: log.id,
      type: log.type,
      recipient: log.recipient,
      subject: log.subject,
      body: log.body,
      createdAt: iso(log.createdAt),
    })),
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
        select: {
          id: true,
          type: true,
          recipient: true,
          subject: true,
          body: true,
          createdAt: true,
        },
      }),
    (rows) => rows.length,
  );
  return logs.map((log) => ({
    id: log.id,
    type: log.type,
    recipient: log.recipient,
    subject: log.subject,
    body: log.body,
    createdAt: iso(log.createdAt),
  }));
}

export async function getAdminStats(): Promise<{
  totalOrders: number;
  pendingCount: number;
  totalRevenue: number;
  customerCount: number;
}> {
  await ensureDatabaseReady();
  const [totalOrders, revenueResult, pendingCount, customerCount] = await Promise.all([
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
    timeAdmin("admin.stats", "customer.count", () => prisma.customer.count(), (count) => count),
  ]);
  return {
    totalOrders,
    totalRevenue: revenueResult._sum.totalMad ?? 0,
    pendingCount,
    customerCount,
  };
}

export async function getAdminOverview(): Promise<AdminOverviewDTO> {
  await ensureDatabaseReady();
  const [totalOrders, pendingFulfillment, revenue, customers, recentOrders] =
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
      timeAdmin("admin.overview", "customer.count", () => prisma.customer.count(), (count) => count),
      getAdminOrdersPage({ take: 10 }),
    ]);

  return {
    totalOrders,
    pendingFulfillment,
    totalRevenue: revenue._sum.totalMad ?? 0,
    customers,
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
      where: { slug: { in: slugs }, active: true },
    }),
    prisma.productVariant.findMany({
      where: {
        id: { in: slugs },
        active: true,
        product: { active: true },
      },
      include: { product: true },
    }),
  ]);

  const bySlug = new Map(
    products.map((product) => [
      product.slug,
      { productId: product.id, unitPriceMad: product.priceMad },
    ]),
  );
  for (const variant of variants) {
    bySlug.set(variant.id, {
      productId: variant.productId,
      unitPriceMad: variant.priceMad,
    });
  }
  const lineItems = input.items
    .map((item) => {
      const purchasable = bySlug.get(item.productId);
      if (!purchasable || item.quantity < 1) return null;
      return {
        productId: purchasable.productId,
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
              quantity: item.quantity,
              unitPriceMad: item.unitPriceMad,
            })),
          },
        },
      });

      await tx.emailLog.create({
        data: {
          orderId: created.id,
          type: "order_received",
          recipient: input.customerEmail,
          subject: "Commande recue - en attente de paiement",
          body: "We received your order. Please complete your payment to proceed.",
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
