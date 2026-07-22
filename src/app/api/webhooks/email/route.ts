import { verifyResendSignature, normalizeInboundEmail } from "@/lib/support/inboundEmail";
import { receiveInboundEmail } from "@/lib/support/emailIntake";

/**
 * Inbound support-email receiver (Resend Inbound → Svix-signed webhook).
 *
 * Every delivery is signature-verified before it is trusted. A valid email is
 * stored ONCE as a pending intake (idempotent by Message-ID / event id) with a
 * future `dueAt`, then the support-email cron matches/creates a ticket. The
 * handler never blocks on that work — it acks fast so Resend doesn't retry.
 *
 * Fails CLOSED (503) if `RESEND_INBOUND_WEBHOOK_SECRET` is unset — no unverified
 * email is ever ingested. Env needed to activate: RESEND_INBOUND_WEBHOOK_SECRET
 * (the Svix signing secret from the Resend inbound webhook), plus the inbound
 * domain + MX records configured in Resend so mail to support@ghost.ma is routed here.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  const raw = await request.text();

  if (!secret) return new Response("inbound email not configured", { status: 503 });

  const verified = verifyResendSignature({
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    body: raw,
    secret,
  });
  if (!verified) return new Response("invalid signature", { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const email = normalizeInboundEmail(payload);
  // Nothing usable (e.g. a non-email event or no sender) — ack so Resend stops retrying.
  if (!email) return new Response("ignored", { status: 200 });

  const eventId =
    payload && typeof payload === "object" && typeof (payload as { id?: unknown }).id === "string"
      ? (payload as { id: string }).id
      : null;

  try {
    await receiveInboundEmail(email, eventId);
  } catch {
    // Transient failure — 500 lets Resend retry (receive is idempotent).
    return new Response("error", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}
