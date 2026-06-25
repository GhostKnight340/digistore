import "server-only";

import { getDb, newId, nowIso } from "./sqlite";
import type { ActionResult, ItemAssignment } from "@/lib/dto";

export async function confirmPayment(orderId: string): Promise<ActionResult> {
  const db = getDb();
  const order = db.prepare(`SELECT id, status, customerEmail FROM "Order" WHERE id = ?`).get(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "payment_confirmed" || order.status === "delivered") {
    return { ok: false, error: "Payment already confirmed." };
  }

  const fromStatus = order.status as string;

  try {
    db.exec("BEGIN IMMEDIATE");

    db.prepare(`UPDATE "Order" SET status = 'payment_confirmed', updatedAt = ? WHERE id = ?`).run(nowIso(), orderId);
    db.prepare(
      `INSERT INTO PaymentEvent (id, orderId, type, fromStatus, toStatus, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(newId(), orderId, "status_change", fromStatus, "payment_confirmed", "Admin confirmed payment.", nowIso());
    db.prepare(
      `INSERT INTO EmailLog (id, orderId, type, recipient, subject, body, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId(), orderId, "payment_confirmed", order.customerEmail as string,
      "Paiement confirmé",
      "Your payment has been confirmed. Your code will be delivered shortly.",
      nowIso(),
    );

    db.exec("COMMIT");
    return { ok: true };
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch {}
    console.error("[confirmPayment]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Confirm failed." };
  }
}

export async function deliverOrder(
  orderId: string,
  assignments: ItemAssignment[],
): Promise<ActionResult> {
  const db = getDb();
  const order = db.prepare(`SELECT id, status, customerEmail FROM "Order" WHERE id = ?`).get(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "delivered") return { ok: false, error: "Order is already delivered." };
  if (order.status !== "payment_confirmed") {
    return { ok: false, error: "Payment must be confirmed before delivery." };
  }

  const items = db.prepare("SELECT id, quantity FROM OrderItem WHERE orderId = ?").all(orderId);

  for (const item of items) {
    const assignment = assignments.find((a) => a.orderItemId === (item.id as string));
    const entries = (assignment?.codes ?? []).filter((e) => e.digitalCodeId || e.manualCode?.trim());
    if (entries.length < (item.quantity as number)) {
      return { ok: false, error: "Assign a code to every unit before delivering." };
    }
  }

  try {
    db.exec("BEGIN IMMEDIATE");

    for (const item of items) {
      const assignment = assignments.find((a) => a.orderItemId === (item.id as string));
      const entries = (assignment?.codes ?? [])
        .filter((e) => e.digitalCodeId || e.manualCode?.trim())
        .slice(0, item.quantity as number);

      for (const entry of entries) {
        let digitalCodeId: string | null = null;
        let manualCode: string | null = null;

        if (entry.digitalCodeId) {
          const code = db.prepare("SELECT id, status FROM DigitalCode WHERE id = ?").get(entry.digitalCodeId);
          if (!code || code.status === "used" || code.status === "disabled") {
            db.exec("ROLLBACK");
            return { ok: false, error: "Selected code is no longer available." };
          }
          db.prepare(
            "UPDATE DigitalCode SET status = 'used', assignedOrderId = ?, usedAt = ?, updatedAt = ? WHERE id = ?",
          ).run(orderId, nowIso(), nowIso(), entry.digitalCodeId);
          digitalCodeId = entry.digitalCodeId;
        } else {
          manualCode = entry.manualCode!.trim();
        }

        db.prepare(
          `INSERT INTO DeliveredCode (id, orderId, orderItemId, productId, digitalCodeId, manualCode, deliveredAt)
           SELECT ?, ?, ?, productId, ?, ?, ? FROM OrderItem WHERE id = ?`,
        ).run(newId(), orderId, item.id as string, digitalCodeId, manualCode, nowIso(), item.id as string);
      }
    }

    db.prepare(`UPDATE "Order" SET status = 'delivered', updatedAt = ? WHERE id = ?`).run(nowIso(), orderId);
    db.prepare(
      `INSERT INTO PaymentEvent (id, orderId, type, fromStatus, toStatus, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(newId(), orderId, "status_change", "payment_confirmed", "delivered", "Admin delivered code(s).", nowIso());
    db.prepare(
      `INSERT INTO EmailLog (id, orderId, type, recipient, subject, body, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId(), orderId, "code_delivered", order.customerEmail as string,
      "Votre code est disponible",
      "Your payment was confirmed. Your code is now available. Thank you for your purchase.",
      nowIso(),
    );

    db.exec("COMMIT");
    return { ok: true };
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch {}
    console.error("[deliverOrder]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Delivery failed." };
  }
}
