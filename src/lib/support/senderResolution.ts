/**
 * Original-sender resolution for forwarded support email — PURE, unit-testable.
 *
 * When Zoho forwards a customer's email into Resend Inbound, the parsed `From`
 * may be a Ghost.ma forwarding address, not the customer. We recover the real
 * customer sender from headers, in a SAFE priority order, and NEVER trust
 * spoofable hints like X-Forwarded-For (which may hold IPs or forged values).
 *
 * Priority:
 *   1. From, when it is not a Ghost.ma forwarding address.
 *   2. Resent-From / Resent-Sender.
 *   3. X-Original-From.
 *   4. Reply-To, only when it is a SINGLE valid external address.
 *   5. Return-Path, final fallback, never a bounce or forwarding address.
 * If none resolve, the message is left for manual review (no ticket created).
 */

export type SenderConfidence = "high" | "medium" | "low" | "none";

export interface SenderResolution {
  /** The address that actually delivered the message (the parsed From). */
  envelopeSender: string | null;
  /** The resolved real customer address, or null if it couldn't be established. */
  originalSender: string | null;
  /** Which header produced the resolution: from | resent-from | resent-sender |
   *  x-original-from | reply-to | return-path | none. */
  source: string;
  confidence: SenderConfidence;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(e: string): boolean {
  return EMAIL_RE.test(e);
}

/** A Ghost.ma address (any subdomain) — treated as a forwarding/internal address. */
export function isGhostAddress(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return domain === "ghost.ma" || domain.endsWith(".ghost.ma");
}

/** Extract every valid address from a header value (handles "Name <a@b>, c@d"). */
export function parseAddresses(value: string | null | undefined): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const part of value.split(",")) {
    const angle = part.match(/<([^>]+)>/);
    const raw = (angle ? angle[1] : part).trim().toLowerCase();
    if (isValidEmail(raw) && !out.includes(raw)) out.push(raw);
  }
  return out;
}

function firstAddress(value: string | null | undefined): string | null {
  return parseAddresses(value)[0] ?? null;
}

/** A bounce / system Return-Path we must never treat as a customer. */
function isBounce(email: string): boolean {
  const local = email.slice(0, email.indexOf("@")).toLowerCase();
  return local === "mailer-daemon" || local === "postmaster" || local.includes("bounce");
}

/**
 * Resolve the original customer sender. `headerGet` reads a header case-
 * insensitively (null if absent). `fromEmail` is the parsed From (envelope).
 */
export function resolveOriginalSender(
  fromEmail: string | null,
  headerGet: (name: string) => string | null,
): SenderResolution {
  const envelopeSender = fromEmail ? fromEmail.toLowerCase() : null;
  const external = (e: string | null | undefined): e is string => !!e && isValidEmail(e) && !isGhostAddress(e);

  // 1. From, when external (not a Ghost.ma forwarding address).
  if (external(envelopeSender)) {
    return { envelopeSender, originalSender: envelopeSender, source: "from", confidence: "high" };
  }
  // 2. Resent-From / Resent-Sender.
  for (const h of ["resent-from", "resent-sender"] as const) {
    const a = firstAddress(headerGet(h));
    if (external(a)) return { envelopeSender, originalSender: a, source: h, confidence: "high" };
  }
  // 3. X-Original-From.
  const xof = firstAddress(headerGet("x-original-from"));
  if (external(xof)) return { envelopeSender, originalSender: xof, source: "x-original-from", confidence: "medium" };
  // 4. Reply-To — ONLY when it is a single valid external address.
  const replyTo = parseAddresses(headerGet("reply-to"));
  if (replyTo.length === 1 && external(replyTo[0])) {
    return { envelopeSender, originalSender: replyTo[0], source: "reply-to", confidence: "medium" };
  }
  // 5. Return-Path — final fallback, never a bounce or forwarding address.
  const rp = firstAddress(headerGet("return-path"));
  if (external(rp) && !isBounce(rp)) {
    return { envelopeSender, originalSender: rp, source: "return-path", confidence: "low" };
  }
  // Deliberately NEVER read X-Forwarded-For (spoofable / may be an IP).
  return { envelopeSender, originalSender: null, source: "none", confidence: "none" };
}
