import "server-only";

import { getDb, newId, nowIso } from "./sqlite";
import type { ActionResult } from "@/lib/dto";

const ALLOWED_PROOF_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/pdf",
];

export async function submitPayment(
  orderId: string,
  proof?: { fileName: string; mimeType: string; dataBase64: string },
): Promise<ActionResult> {
  const db = getDb();
  const order = db.prepare(`SELECT id, status, customerEmail FROM "Order" WHERE id = ?`).get(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "pending_payment") {
    return { ok: false, error: "Order is not in pending_payment state." };
  }

  if (proof) {
    if (!ALLOWED_PROOF_TYPES.includes(proof.mimeType)) {
      return { ok: false, error: "File type not allowed. Use PNG, JPG, JPEG or PDF." };
    }
    if (proof.dataBase64.length > 7 * 1024 * 1024) {
      return { ok: false, error: "File too large. Maximum 5 MB." };
    }
  }

  try {
    db.exec("BEGIN IMMEDIATE");

    db.prepare(`UPDATE "Order" SET status = ?, updatedAt = ? WHERE id = ?`).run(
      "payment_submitted", nowIso(), orderId,
    );

    if (proof) {
      const existing = db.prepare("SELECT id FROM PaymentProof WHERE orderId = ?").get(orderId);
      if (existing) {
        db.prepare(
          "UPDATE PaymentProof SET fileName = ?, mimeType = ?, data = ?, uploadedAt = ? WHERE orderId = ?",
        ).run(proof.fileName, proof.mimeType, proof.dataBase64, nowIso(), orderId);
      } else {
        db.prepare(
          "INSERT INTO PaymentProof (id, orderId, fileName, mimeType, data, uploadedAt) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(newId(), orderId, proof.fileName, proof.mimeType, proof.dataBase64, nowIso());
      }
    }

    db.prepare(
      `INSERT INTO PaymentEvent (id, orderId, type, fromStatus, toStatus, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId(), orderId, "status_change", "pending_payment", "payment_submitted",
      proof ? `Proof uploaded: ${proof.fileName}` : "No proof uploaded.",
      nowIso(),
    );

    db.prepare(
      `INSERT INTO EmailLog (id, orderId, type, recipient, subject, body, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId(), orderId, "payment_submitted", order.customerEmail as string,
      "Paiement soumis — vérification en cours",
      "We received your payment submission and are verifying it. We will notify you shortly.",
      nowIso(),
    );

    db.exec("COMMIT");
    return { ok: true };
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch {}
    console.error("[submitPayment]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Submit failed." };
  }
}

export async function approvePayment(orderId: string): Promise<ActionResult> {
  const db = getDb();
  const order = db.prepare(`SELECT id, status, customerEmail FROM "Order" WHERE id = ?`).get(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "payment_confirmed" || order.status === "delivered") {
    return { ok: false, error: "Payment already confirmed." };
  }

  const fromStatus = order.status as string;

  try {
    db.exec("BEGIN IMMEDIATE");

    db.prepare(`UPDATE "Order" SET status = ?, updatedAt = ? WHERE id = ?`).run(
      "payment_confirmed", nowIso(), orderId,
    );
    db.prepare(
      `INSERT INTO PaymentEvent (id, orderId, type, fromStatus, toStatus, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(newId(), orderId, "status_change", fromStatus, "payment_confirmed", "Admin approved payment.", nowIso());
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
    console.error("[approvePayment]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Approve failed." };
  }
}

export async function rejectPayment(orderId: string): Promise<ActionResult> {
  const db = getDb();
  const order = db.prepare(`SELECT id, status, customerEmail FROM "Order" WHERE id = ?`).get(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "rejected") return { ok: false, error: "Already rejected." };

  const fromStatus = order.status as string;

  try {
    db.exec("BEGIN IMMEDIATE");

    db.prepare(`UPDATE "Order" SET status = ?, updatedAt = ? WHERE id = ?`).run(
      "rejected", nowIso(), orderId,
    );
    db.prepare(
      `INSERT INTO PaymentEvent (id, orderId, type, fromStatus, toStatus, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(newId(), orderId, "status_change", fromStatus, "rejected", "Admin rejected payment.", nowIso());
    db.prepare(
      `INSERT INTO EmailLog (id, orderId, type, recipient, subject, body, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId(), orderId, "payment_rejected", order.customerEmail as string,
      "Paiement refusé",
      "We could not confirm your payment. Please contact us on WhatsApp with your order number.",
      nowIso(),
    );

    db.exec("COMMIT");
    return { ok: true };
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch {}
    console.error("[rejectPayment]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Reject failed." };
  }
}

export async function markPaymentIssue(orderId: string): Promise<ActionResult> {
  const db = getDb();
  const order = db.prepare(`SELECT id, status, customerEmail FROM "Order" WHERE id = ?`).get(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "payment_issue") return { ok: false, error: "Already marked as issue." };

  const fromStatus = order.status as string;

  try {
    db.exec("BEGIN IMMEDIATE");

    db.prepare(`UPDATE "Order" SET status = ?, updatedAt = ? WHERE id = ?`).run(
      "payment_issue", nowIso(), orderId,
    );
    db.prepare(
      `INSERT INTO PaymentEvent (id, orderId, type, fromStatus, toStatus, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(newId(), orderId, "status_change", fromStatus, "payment_issue", "Admin flagged a payment issue.", nowIso());
    db.prepare(
      `INSERT INTO EmailLog (id, orderId, type, recipient, subject, body, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId(), orderId, "payment_issue", order.customerEmail as string,
      "Problème avec votre paiement",
      "An issue was detected with your payment. Please contact our WhatsApp support.",
      nowIso(),
    );

    db.exec("COMMIT");
    return { ok: true };
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch {}
    console.error("[markPaymentIssue]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Mark issue failed." };
  }
}

export async function getPaymentProof(
  orderId: string,
): Promise<{ data: string; mimeType: string; fileName: string } | null> {
  const proof = getDb().prepare("SELECT data, mimeType, fileName FROM PaymentProof WHERE orderId = ?").get(orderId);
  if (!proof) return null;
  return { data: proof.data as string, mimeType: proof.mimeType as string, fileName: proof.fileName as string };
}
