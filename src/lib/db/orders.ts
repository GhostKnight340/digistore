import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import type { OrderStatus } from "@/lib/types";
import type { AdminOverviewDTO, CustomerDTO, CustomerOrderDTO, AdminOrderDTO } from "@/lib/dto";

type OrderRecord = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;
type AdminOrderRecord = Awaited<ReturnType<typeof loadAdminOrders>>[number];

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function buildCustomerDTO(data: OrderRecord): CustomerOrderDTO {
  return {
    id: data.id,
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
    include: {
      items: { include: { product: true } },
      deliveredCodes: { include: { product: true, digitalCode: true } },
      paymentProof: { select: { id: true } },
      paymentEvents: { orderBy: { createdAt: "asc" } },
    },
  });
}

function loadAdminOrders(options: { take?: number; statuses?: string[] } = {}) {
  return prisma.order.findMany({
    take: options.take ?? 50,
    where: options.statuses?.length ? { status: { in: options.statuses } } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      items: { include: { product: true } },
      deliveredCodes: { include: { product: true, digitalCode: true } },
      paymentProof: { select: { id: true, mimeType: true } },
      paymentEvents: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function getCustomerOrder(
  id: string,
): Promise<CustomerOrderDTO | null> {
  await ensureDatabaseReady();
  const data = await loadOrder(id);
  return data ? buildCustomerDTO(data) : null;
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
      paymentProof: { select: { id: true } },
      paymentEvents: { orderBy: { createdAt: "asc" } },
    },
  });
  return orders.map(buildCustomerDTO);
}

export async function getAdminOrders(): Promise<AdminOrderDTO[]> {
  return getAdminOrdersPage();
}

export async function getAdminOrdersPage(options: {
  take?: number;
  statuses?: string[];
} = {}): Promise<AdminOrderDTO[]> {
  await ensureDatabaseReady();
  const orders = await loadAdminOrders(options);

  return orders.map((order: AdminOrderRecord) => ({
    ...buildCustomerDTO(order),
    emailLogs: [],
    proofMimeType: order.paymentProof?.mimeType ?? null,
  }));
}

export async function getOrderEmailLogs(orderId: string): Promise<import("@/lib/dto").EmailLogDTO[]> {
  await ensureDatabaseReady();
  const logs = await prisma.emailLog.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
  });
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
    prisma.order.count(),
    prisma.order.aggregate({ _sum: { totalMad: true } }),
    prisma.order.count({ where: { status: { not: "delivered" } } }),
    prisma.customer.count(),
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
      prisma.order.count(),
      prisma.order.count({ where: { status: { not: "delivered" } } }),
      prisma.order.aggregate({ _sum: { totalMad: true } }),
      prisma.customer.count(),
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
  const customers = await prisma.customer.findMany({
    take,
    orderBy: { updatedAt: "desc" },
    select: {
      name: true,
      email: true,
      orders: {
        select: { totalMad: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return customers.map((customer) => ({
    name: customer.name,
    email: customer.email,
    orderCount: customer.orders.length,
    totalSpent: customer.orders.reduce((sum, order) => sum + order.totalMad, 0),
    lastOrderAt:
      customer.orders[0]?.createdAt.toISOString() ?? new Date(0).toISOString(),
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
  const products = await prisma.product.findMany({
    where: { slug: { in: slugs }, active: true },
  });

  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const lineItems = input.items
    .map((item) => {
      const product = bySlug.get(item.productId);
      if (!product || item.quantity < 1) return null;
      return {
        productId: product.id,
        quantity: item.quantity,
        unitPriceMad: product.priceMad,
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
): Promise<{ id: string } | null> {
  await ensureDatabaseReady();
  const order = await prisma.order.findFirst({
    where: { id, customerEmail: email },
    select: { id: true },
  });
  return order ?? null;
}
