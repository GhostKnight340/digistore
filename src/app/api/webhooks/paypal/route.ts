import { NextRequest, NextResponse } from "next/server";
import { ensureDatabaseReady, prisma } from "@/lib/db/prisma";
import { getPayPalOrder, verifyPayPalWebhookSignature } from "@/lib/paypal/client";
import {
  applyVerifiedPaypalOrder,
  findGhostOrderIdByPaypalOrderId,
  reconcileRefundedCapture,
} from "@/lib/paypal/operations";

/**
 * PayPal webhook receiver. Every event is signature-verified against
 * PayPal's API before it is trusted, and every status-changing event is
 * re-fetched from PayPal (never taken from the payload) before it touches a
 * Ghost order. Processing is idempotent via a unique event-id ledger, so
 * PayPal's automatic retries and duplicate deliveries are safe.
 */
export async function POST(req: NextRequest) {
  let event: Record<string, unknown>;
  try {
    event = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const transmissionId = req.headers.get("paypal-transmission-id");
  const transmissionTime = req.headers.get("paypal-transmission-time");
  const certUrl = req.headers.get("paypal-cert-url");
  const authAlgo = req.headers.get("paypal-auth-algo");
  const transmissionSig = req.headers.get("paypal-transmission-sig");

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    console.error("[paypal:webhook] missing verification headers");
    return NextResponse.json({ error: "Missing verification headers." }, { status: 400 });
  }

  let verified = false;
  try {
    verified = await verifyPayPalWebhookSignature(
      { transmissionId, transmissionTime, certUrl, authAlgo, transmissionSig },
      event,
    );
  } catch (error) {
    console.error(
      "[paypal:webhook] verification request failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json({ error: "Verification unavailable." }, { status: 502 });
  }

  if (!verified) {
    console.error("[paypal:webhook] signature verification failed", {
      eventType: event.event_type,
    });
    return NextResponse.json({ error: "Signature verification failed." }, { status: 401 });
  }

  const eventId = typeof event.id === "string" ? event.id : null;
  const eventType = typeof event.event_type === "string" ? event.event_type : "unknown";
  const resource = isRecord(event.resource) ? event.resource : {};
  const resourceId = typeof resource.id === "string" ? resource.id : null;

  if (!eventId) {
    return NextResponse.json({ error: "Missing event id." }, { status: 400 });
  }

  await ensureDatabaseReady();

  // Idempotency: the unique index on eventId makes this a safe, single
  // round-trip dedupe check against PayPal's automatic webhook retries.
  try {
    await prisma.paymentWebhookEvent.create({
      data: { provider: "paypal", eventId, eventType, resourceId },
    });
  } catch {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const ghostOrderId = await handlePaypalEvent(eventType, resource);
    // Complete the audit trail: the ledger row is written before processing
    // (to win the dedupe race), so the Ghost order it resolved to is only
    // known now. Without this the model is a dedupe ledger, not the audit
    // trail its indexed orderId implies.
    if (ghostOrderId) {
      await prisma.paymentWebhookEvent
        .update({ where: { eventId }, data: { orderId: ghostOrderId } })
        .catch(() => {
          // Audit metadata only — never fail an already-applied payment on it.
        });
    }
  } catch (error) {
    // Release the dedupe row so PayPal's retry can actually re-run this event.
    // Acking 200 here would record the event as seen forever and silently
    // leave the order unconfirmed — recoverable only by reading logs.
    await prisma.paymentWebhookEvent.delete({ where: { eventId } }).catch(() => {
      // If the release fails the event stays deduped; the 500 below plus this
      // log is the only signal, so keep both.
    });
    console.error(
      "[paypal:webhook] handler error — released for retry",
      eventType,
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Returns the Ghost order id the event applied to, for the audit trail. */
async function handlePaypalEvent(
  eventType: string,
  resource: Record<string, unknown>,
): Promise<string | null> {
  switch (eventType) {
    case "PAYMENT.CAPTURE.COMPLETED":
    case "PAYMENT.CAPTURE.DENIED": {
      const paypalOrderId = extractRelatedOrderId(resource);
      if (!paypalOrderId) return null;
      const ghostOrderId = await findGhostOrderIdByPaypalOrderId(paypalOrderId);
      if (!ghostOrderId) return null;
      // Never trust the webhook payload's status alone — re-fetch the order
      // from PayPal before changing anything.
      const trusted = await getPayPalOrder(paypalOrderId);
      await applyVerifiedPaypalOrder(ghostOrderId, trusted);
      return ghostOrderId;
    }
    case "CHECKOUT.ORDER.APPROVED": {
      // Informational only — Ghost captures on the browser's approve
      // callback (or a later COMPLETED webhook); approval alone never marks
      // an order paid.
      return null;
    }
    // Refund paths resolve the order internally and report via ActionResult
    // rather than returning an id, so the ledger's orderId stays null here.
    case "PAYMENT.CAPTURE.REVERSED": {
      const captureId = typeof resource.id === "string" ? resource.id : null;
      if (!captureId) return null;
      await reconcileRefundedCapture(captureId);
      return null;
    }
    case "PAYMENT.CAPTURE.REFUNDED": {
      const captureId = extractCaptureIdFromRefundResource(resource);
      if (!captureId) return null;
      await reconcileRefundedCapture(captureId);
      return null;
    }
    default:
      return null;
  }
}

function extractRelatedOrderId(resource: Record<string, unknown>): string | null {
  const supplementary = isRecord(resource.supplementary_data) ? resource.supplementary_data : null;
  const related = supplementary && isRecord(supplementary.related_ids) ? supplementary.related_ids : null;
  const orderId = related?.order_id;
  return typeof orderId === "string" ? orderId : null;
}

function extractCaptureIdFromRefundResource(resource: Record<string, unknown>): string | null {
  const links = Array.isArray(resource.links) ? resource.links : [];
  for (const link of links) {
    if (!isRecord(link)) continue;
    if (link.rel === "up" && typeof link.href === "string") {
      const parts = link.href.split("/").filter(Boolean);
      return parts[parts.length - 1] ?? null;
    }
  }
  return null;
}
