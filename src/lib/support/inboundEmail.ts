/**
 * Inbound email normalization + Resend (Svix) webhook signature verification.
 *
 * Resend Inbound POSTs a signed JSON event to our webhook. This module verifies
 * the Svix signature (HMAC-SHA256 over `id.timestamp.body`, ±5-min tolerance)
 * and normalizes the many possible payload shapes into one struct. No DB.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveOriginalSender, type SenderConfidence } from "./senderResolution";

export interface NormalizedEmailAttachment {
  fileName: string;
  mimeType: string;
  dataBase64: string;
}

export interface NormalizedInboundEmail {
  messageId: string;
  inReplyTo: string | null;
  references: string | null;
  /** The parsed From (the forwarding/envelope sender when forwarded). */
  fromEmail: string;
  fromName: string | null;
  toEmail: string | null;
  subject: string | null;
  text: string | null;
  html: string | null;
  attachments: NormalizedEmailAttachment[];
  /** All headers, preserved verbatim for auditing. */
  rawHeaders: { name: string; value: string }[];
  /** The resolved real customer sender (null → route to manual review). */
  originalSender: string | null;
  /** Which header produced the resolution + how confident. */
  senderSource: string;
  senderConfidence: SenderConfidence;
}

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

/**
 * Whether the inbound-email transport is configured. It is an OPTIONAL
 * integration: when unset, the webhook is inert and the Customer Support AI
 * still works normally on website tickets. Enable later by setting
 * RESEND_INBOUND_WEBHOOK_SECRET (+ Resend inbound MX) — no other code changes.
 */
export function isInboundEmailConfigured(): boolean {
  return !!process.env.RESEND_INBOUND_WEBHOOK_SECRET;
}

/** Verify a Svix-signed webhook (Resend). Returns false on any problem. */
export function verifyResendSignature(opts: {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  secret: string;
  now?: number;
}): boolean {
  const { id, timestamp, signature, body, secret } = opts;
  if (!id || !timestamp || !signature || !secret) return false;
  const ts = Number(timestamp);
  const nowSec = (opts.now ?? Date.now()) / 1000;
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) return false;

  const rawKey = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Buffer;
  try {
    keyBytes = Buffer.from(rawKey, "base64");
  } catch {
    return false;
  }
  const expected = createHmac("sha256", keyBytes).update(`${id}.${timestamp}.${body}`).digest("base64");
  const expectedBuf = Buffer.from(expected, "base64");

  // Header is a space-separated list of "v1,<base64sig>" entries.
  for (const part of signature.split(" ")) {
    const comma = part.indexOf(",");
    const sig = comma >= 0 ? part.slice(comma + 1) : part;
    if (!sig) continue;
    try {
      const sigBuf = Buffer.from(sig, "base64");
      if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) return true;
    } catch {
      // malformed entry — try the next
    }
  }
  return false;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Pull an email address + display name from Resend's `from` (string or object). */
function parseAddress(from: unknown): { email: string | null; name: string | null } {
  if (typeof from === "string") {
    const m = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
    if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
    return { email: from.trim().toLowerCase() || null, name: null };
  }
  if (from && typeof from === "object") {
    const o = from as Record<string, unknown>;
    return { email: asString(o.email)?.toLowerCase() ?? null, name: asString(o.name) };
  }
  return { email: null, name: null };
}

/** Normalize headers (array of {name,value} OR a name→value map) into a list. */
function collectHeaders(headers: unknown): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  if (Array.isArray(headers)) {
    for (const h of headers) {
      if (!h || typeof h !== "object") continue;
      const name = asString((h as Record<string, unknown>).name);
      const value = asString((h as Record<string, unknown>).value);
      if (name && value) out.push({ name, value });
    }
  } else if (headers && typeof headers === "object") {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      const value = asString(v);
      if (k && value) out.push({ name: k, value });
    }
  }
  return out;
}

/** Case-insensitive header lookup over a collected header list. */
function headerGetter(list: { name: string; value: string }[]): (name: string) => string | null {
  return (name: string) => {
    const lower = name.toLowerCase();
    const hit = list.find((h) => h.name.toLowerCase() === lower);
    return hit ? hit.value : null;
  };
}

function parseAttachments(raw: unknown): NormalizedEmailAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedEmailAttachment[] = [];
  for (const a of raw) {
    if (out.length >= MAX_ATTACHMENTS) break;
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    const dataBase64 = asString(o.content) ?? asString(o.contentBase64) ?? asString(o.data);
    if (!dataBase64) continue;
    if (dataBase64.length * 0.75 > MAX_ATTACHMENT_BYTES) continue; // too large — skip
    out.push({
      fileName: asString(o.filename) ?? asString(o.fileName) ?? `piece-${out.length + 1}`,
      mimeType: asString(o.content_type) ?? asString(o.contentType) ?? asString(o.mimeType) ?? "application/octet-stream",
      dataBase64,
    });
  }
  return out;
}

/**
 * Normalize a Resend Inbound webhook body into our struct. Accepts several
 * shapes (fields under `data` or at the top level). Returns null if there is no
 * usable sender — the caller then records a skipped intake.
 */
export function normalizeInboundEmail(raw: unknown): NormalizedInboundEmail | null {
  if (!raw || typeof raw !== "object") return null;
  const top = raw as Record<string, unknown>;
  const data = (top.data && typeof top.data === "object" ? top.data : top) as Record<string, unknown>;

  const { email: fromEmail, name: fromName } = parseAddress(data.from);
  if (!fromEmail) return null;

  const to = Array.isArray(data.to) ? data.to[0] : data.to;
  const rawHeaders = collectHeaders(data.headers);
  const headerGet = headerGetter(rawHeaders);
  const messageId =
    asString(data.message_id) ?? asString(data.messageId) ?? headerGet("Message-ID") ?? asString(top.id) ?? "";

  // Recover the real customer sender (forwarded mail may have a Ghost.ma From).
  const sender = resolveOriginalSender(fromEmail, headerGet);

  return {
    // Fall back to a synthetic id so idempotency still has a stable key.
    messageId: messageId || `<inbound-${fromEmail}-${asString(data.subject) ?? ""}>`.slice(0, 240),
    inReplyTo: headerGet("In-Reply-To") ?? asString(data.in_reply_to),
    references: headerGet("References") ?? asString(data.references),
    fromEmail,
    fromName,
    toEmail: parseAddress(to).email,
    subject: asString(data.subject),
    text: asString(data.text),
    html: asString(data.html),
    attachments: parseAttachments(data.attachments),
    rawHeaders,
    originalSender: sender.originalSender,
    senderSource: sender.source,
    senderConfidence: sender.confidence,
  };
}
