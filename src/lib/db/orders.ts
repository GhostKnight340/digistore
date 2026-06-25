import "server-only";

import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@/lib/types";
import type {
  CustomerOrderDTO,
  AdminOrderDTO,
} from "@/lib/dto";

type DbOrderWithRelations = Awaited<
  ReturnType<typeof loadOrderRecord>
>;

function loadOrderRecord(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { product: true } },
      deliveredCodes: { include: { product: true, digitalCode: true } },
      emailLogs: true,
    },
  });
}

function toCustomerDTO(order: NonNullable<DbOrderWithRelations>): CustomerOrderDTO {
  return {
    id: order.id,
    status: order.status as OrderStatus,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    paymentMethod: order.paymentMethod,
    totalMad: order.totalMad,
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((it) => ({
      id: it.id,
      productId: it.product.slug,
      name: it.product.name,
      quantity: it.quantity,
      unitPriceMad: it.unitPriceMad,
      category: it.product.category,
      region: it.product.region,
      deliveryType: it.product.deliveryType,
    })),
    // Only delivered codes are exposed to the customer — never raw inventory.
    deliveredCodes: order.deliveredCodes.map((dc) => ({
      productId: dc.product.slug,
      code: dc.digitalCode?.code ?? dc.manualCode ?? "",
    })),
  };
}

/** Customer-facing single order (with its delivered codes). */
export async function getCustomerOrder(
  id: string,
): Promise<CustomerOrderDTO | null> {
  const order = await loadOrderRecord(id);
  return order ? toCustomerDTO(order) : null;
}

/** Order summaries for the account page (looked up by remembered ids). */
export async function getOrderSummaries(
  ids: string[],
): Promise<CustomerOrderDTO[]> {
  if (ids.length === 0) return [];
  const orders = await prisma.order.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: "desc" },
    include: {
      items: { include: { product: true } },
      deliveredCodes: { include: { product: true, digitalCode: true } },
      emailLogs: true,
    },
  });
  return orders.map(toCustomerDTO);
}

/** Admin view of all orders (newest first), including simulated email logs. */
export async function getAdminOrders(): Promise<AdminOrderDTO[]> {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      items: { include: { product: true } },
      deliveredCodes: { include: { product: true, digitalCode: true } },
      emailLogs: { orderBy: { createdAt: "asc" } },
    },
  });
  return orders.map((order) => ({
    ...toCustomerDTO(order),
    emailLogs: order.emailLogs.map((e) => ({
      id: e.id,
      type: e.type,
      recipient: e.recipient,
      subject: e.subject,
      body: e.body,
      createdAt: e.createdAt.toISOString(),
    })),
  }));
}

interface CreateOrderInput {
  customerName: string;
  customerEmail: string;
  paymentMethod: string;
  items: { productId: string; quantity: number }[]; // productId = slug
}

/**
 * Creates a pending_payment order. Prices are recomputed from the database —
 * never trusted from the client. Logs a simulated order_received email.
 */
export async function createOrder(
  input: CreateOrderInput,
): Promise<{ id: string } | null> {
  const slugs = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { slug: { in: slugs }, active: true },
  });
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  if (products.length === 0) {
    // Almost always means the database has not been seeded yet.
    // Run: npm run prisma:migrate && npm run prisma:seed
    console.warn(
      `[createOrder] No active products found for slugs ${JSON.stringify(
        slugs,
      )}. Has the database been migrated and seeded?`,
    );
  }

  const lineItems = input.items
    .map((i) => {
      const product = bySlug.get(i.productId);
      if (!product || i.quantity < 1) return null;
      return {
        productId: product.id,
        quantity: i.quantity,
        unitPriceMad: product.priceMad,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (lineItems.length === 0) return null;

  const totalMad = lineItems.reduce(
    (sum, li) => sum + li.unitPriceMad * li.quantity,
    0,
  );

  const order = await prisma.order.create({
    data: {
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      paymentMethod: input.paymentMethod,
      status: "pending_payment",
      totalMad,
      items: { create: lineItems },
      emailLogs: {
        create: {
          type: "order_received",
          recipient: input.customerEmail,
          subject: "Paiement en cours de vérification",
          body: "We received your order and are verifying the payment.",
        },
      },
    },
  });

  return { id: order.id };
}
