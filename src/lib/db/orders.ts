import "server-only";

import { getDb, newId, nowIso } from "./sqlite";
import type { OrderStatus } from "@/lib/types";
import type { CustomerOrderDTO, AdminOrderDTO } from "@/lib/dto";

function buildCustomerDTO(
  order: Record<string, unknown>,
  items: Record<string, unknown>[],
  deliveredCodes: Record<string, unknown>[],
  paymentEvents: Record<string, unknown>[],
  hasProof: boolean,
): CustomerOrderDTO {
  return {
    id: order.id as string,
    status: order.status as OrderStatus,
    customerName: order.customerName as string,
    customerEmail: order.customerEmail as string,
    paymentMethod: order.paymentMethod as string,
    totalMad: order.totalMad as number,
    createdAt: order.createdAt as string,
    items: items.map((it) => ({
      id: it.id as string,
      productId: it.slug as string,
      name: it.name as string,
      quantity: it.quantity as number,
      unitPriceMad: it.unitPriceMad as number,
    })),
    deliveredCodes: deliveredCodes.map((dc) => ({
      productId: dc.slug as string,
      code: (dc.code ?? dc.manualCode ?? "") as string,
    })),
    proofUploaded: hasProof,
    paymentEvents: paymentEvents.map((ev) => ({
      id: ev.id as string,
      type: ev.type as string,
      fromStatus: (ev.fromStatus as string) ?? null,
      toStatus: (ev.toStatus as string) ?? null,
      note: (ev.note as string) ?? null,
      createdAt: ev.createdAt as string,
    })),
  };
}

function loadOrder(id: string) {
  const db = getDb();
  const order = db.prepare(`SELECT * FROM "Order" WHERE id = ?`).get(id);
  if (!order) return null;

  const items = db.prepare(
    `SELECT oi.id, oi.quantity, oi.unitPriceMad, p.slug, p.name
     FROM OrderItem oi JOIN Product p ON p.id = oi.productId
     WHERE oi.orderId = ?`,
  ).all(id);

  const deliveredCodes = db.prepare(
    `SELECT dc.manualCode, p.slug, dig.code
     FROM DeliveredCode dc
     JOIN Product p ON p.id = dc.productId
     LEFT JOIN DigitalCode dig ON dig.id = dc.digitalCodeId
     WHERE dc.orderId = ?`,
  ).all(id);

  const paymentEvents = db.prepare(
    `SELECT * FROM PaymentEvent WHERE orderId = ? ORDER BY createdAt ASC`,
  ).all(id);

  const proof = db.prepare("SELECT id FROM PaymentProof WHERE orderId = ?").get(id);

  return { order, items, deliveredCodes, paymentEvents, hasProof: !!proof };
}

export async function getCustomerOrder(id: string): Promise<CustomerOrderDTO | null> {
  const data = loadOrder(id);
  if (!data) return null;
  return buildCustomerDTO(data.order, data.items, data.deliveredCodes, data.paymentEvents, data.hasProof);
}

export async function getOrderSummaries(ids: string[]): Promise<CustomerOrderDTO[]> {
  if (ids.length === 0) return [];
  const results: CustomerOrderDTO[] = [];
  for (const id of ids) {
    const data = loadOrder(id);
    if (data) results.push(buildCustomerDTO(data.order, data.items, data.deliveredCodes, data.paymentEvents, data.hasProof));
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAdminOrders(): Promise<AdminOrderDTO[]> {
  const db = getDb();
  const orders = db.prepare(`SELECT * FROM "Order" ORDER BY createdAt DESC`).all();

  return orders.map((order) => {
    const id = order.id as string;

    const items = db.prepare(
      `SELECT oi.id, oi.quantity, oi.unitPriceMad, p.slug, p.name
       FROM OrderItem oi JOIN Product p ON p.id = oi.productId
       WHERE oi.orderId = ?`,
    ).all(id);

    const deliveredCodes = db.prepare(
      `SELECT dc.manualCode, p.slug, dig.code
       FROM DeliveredCode dc
       JOIN Product p ON p.id = dc.productId
       LEFT JOIN DigitalCode dig ON dig.id = dc.digitalCodeId
       WHERE dc.orderId = ?`,
    ).all(id);

    const paymentEvents = db.prepare(
      `SELECT * FROM PaymentEvent WHERE orderId = ? ORDER BY createdAt ASC`,
    ).all(id);

    const proof = db.prepare("SELECT id, mimeType FROM PaymentProof WHERE orderId = ?").get(id);

    const emailLogs = db.prepare(
      `SELECT * FROM EmailLog WHERE orderId = ? ORDER BY createdAt ASC`,
    ).all(id);

    return {
      ...buildCustomerDTO(order, items, deliveredCodes, paymentEvents, !!proof),
      emailLogs: emailLogs.map((e) => ({
        id: e.id as string,
        type: e.type as string,
        recipient: e.recipient as string,
        subject: e.subject as string,
        body: e.body as string,
        createdAt: e.createdAt as string,
      })),
      proofMimeType: proof ? (proof.mimeType as string) : null,
    };
  });
}

interface CreateOrderInput {
  customerName: string;
  customerEmail: string;
  paymentMethod: string;
  items: { productId: string; quantity: number }[];
}

export async function createOrder(input: CreateOrderInput): Promise<{ id: string } | null> {
  const db = getDb();
  const slugs = input.items.map((i) => i.productId);

  const products = db.prepare(
    `SELECT id, slug, priceMad FROM Product WHERE slug IN (${slugs.map(() => "?").join(",")}) AND active = 1`,
  ).all(...slugs);

  const bySlug = new Map(products.map((p) => [p.slug as string, p]));

  if (products.length === 0) {
    console.warn(`[createOrder] No active products found for slugs ${JSON.stringify(slugs)}.`);
  }

  const lineItems = input.items
    .map((i) => {
      const product = bySlug.get(i.productId);
      if (!product || i.quantity < 1) return null;
      return { productId: product.id as string, quantity: i.quantity, unitPriceMad: product.priceMad as number };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (lineItems.length === 0) return null;

  const totalMad = lineItems.reduce((sum, li) => sum + li.unitPriceMad * li.quantity, 0);
  const orderId = newId();
  const ts = nowIso();

  try {
    db.exec("BEGIN IMMEDIATE");

    db.prepare(
      `INSERT INTO "Order" (id, customerName, customerEmail, paymentMethod, status, totalMad, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'pending_payment', ?, ?, ?)`,
    ).run(orderId, input.customerName, input.customerEmail, input.paymentMethod, totalMad, ts, ts);

    for (const li of lineItems) {
      db.prepare(
        `INSERT INTO OrderItem (id, orderId, productId, quantity, unitPriceMad) VALUES (?, ?, ?, ?, ?)`,
      ).run(newId(), orderId, li.productId, li.quantity, li.unitPriceMad);
    }

    db.prepare(
      `INSERT INTO EmailLog (id, orderId, type, recipient, subject, body, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId(), orderId, "order_received", input.customerEmail,
      "Commande reçue — en attente de paiement",
      "We received your order. Please complete your payment to proceed.",
      ts,
    );

    db.prepare(
      `INSERT INTO PaymentEvent (id, orderId, type, fromStatus, toStatus, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(newId(), orderId, "status_change", null, "pending_payment", "Order created.", ts);

    db.exec("COMMIT");
    return { id: orderId };
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch {}
    console.error("[createOrder]", e);
    return null;
  }
}
