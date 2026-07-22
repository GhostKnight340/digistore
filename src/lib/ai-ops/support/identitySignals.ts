/**
 * Identity signals — PURE extraction (no DB), unit-testable.
 *
 * Pulls every correlation signal we can from a ticket + its text: the sender
 * email, order references (typed field + parsed from subject/body), payment
 * references (provider ids), and a phone number. The resolver service
 * (src/lib/ai-ops/support/identity.ts) turns these into DB matches.
 *
 * Adding a new signal here + a resolver there extends identification WITHOUT
 * touching the AI workflow.
 */

export interface IdentitySignals {
  senderEmail: string | null;
  orderRefs: string[];
  paymentRefs: string[];
  phone: string | null;
}

const ORDER_REF_PATTERNS = [
  /GH-[A-Z]-\d{3,}/gi,
  /#\s?\d{3,}/g,
  /\bn[°o]\s?\.?\s?\d{3,}\b/gi,
  /\bcommande\s+#?\s?\d{3,}\b/gi,
  /\border\s+#?\s?\d{3,}\b/gi,
];

/** Every order reference mentioned (normalized, de-duplicated). */
export function extractOrderRefs(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const re of ORDER_REF_PATTERNS) {
    const matches = text.match(re);
    if (!matches) continue;
    for (const m of matches) {
      const digits = m.match(/\d{3,}/);
      if (m.toUpperCase().startsWith("GH-")) found.add(m.toUpperCase());
      else if (digits) found.add(`#${digits[0]}`);
    }
  }
  return [...found].slice(0, 8);
}

/**
 * Candidate payment references: opaque provider ids the customer might quote
 * (e.g. a PayPal order/capture id). We keep tokens that look like ids — 10-24
 * chars mixing letters and digits, or all-caps alphanumerics — bounded so the
 * resolver never runs an unbounded number of lookups.
 */
export function extractPaymentRefs(text: string): string[] {
  if (!text) return [];
  const tokens = text.match(/\b[A-Za-z0-9]{10,24}\b/g);
  if (!tokens) return [];
  const out: string[] = [];
  for (const t of tokens) {
    const hasDigit = /\d/.test(t);
    const hasAlpha = /[A-Za-z]/.test(t);
    const allCaps = t === t.toUpperCase();
    if ((hasDigit && hasAlpha) || (allCaps && hasDigit)) {
      if (!out.includes(t)) out.push(t);
    }
    if (out.length >= 5) break;
  }
  return out;
}

/** First plausible phone number (8-15 digits), normalized to `+?digits`. */
export function extractPhone(text: string): string | null {
  if (!text) return null;
  const matches = text.match(/\+?\d[\d\s().-]{6,}\d/g);
  if (!matches) return null;
  for (const m of matches) {
    const plus = m.trim().startsWith("+");
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) return `${plus ? "+" : ""}${digits}`;
  }
  return null;
}

/** Assemble all signals from a ticket's fields + free text. */
export function extractIdentitySignals(input: {
  email: string | null;
  orderRef: string | null;
  phone?: string | null;
  text: string;
}): IdentitySignals {
  const refs = new Set<string>();
  if (input.orderRef) refs.add(input.orderRef.trim());
  for (const r of extractOrderRefs(input.text)) refs.add(r);
  return {
    senderEmail: input.email?.trim().toLowerCase() || null,
    orderRefs: [...refs].slice(0, 8),
    paymentRefs: extractPaymentRefs(input.text),
    phone: input.phone?.trim() || extractPhone(input.text),
  };
}
