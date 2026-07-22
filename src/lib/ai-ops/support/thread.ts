/**
 * Email/thread parsing helpers — PURE (no DB), unit-testable.
 *
 * Used by the reply-batching recheck and by the inbound email intake: find the
 * newest customer-message time, split RFC References/In-Reply-To header ids,
 * strip quoted history + signatures before AI analysis, and best-effort extract
 * an order reference from a subject/body.
 */

/** Newest customer-message time in ms (falls back to the ticket createdAt, else 0). */
export function lastCustomerMessageAt(
  replies: { author: string; createdAt: string }[],
  createdAt: string,
): number {
  let latest = 0;
  for (const r of replies) {
    if (r.author !== "customer") continue;
    const t = Date.parse(r.createdAt);
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  if (latest > 0) return latest;
  const c = Date.parse(createdAt);
  return Number.isFinite(c) ? c : 0;
}

/** Split a References / In-Reply-To header value into its `<id>` message ids. */
export function parseReferenceIds(headerValue: string | null | undefined): string[] {
  if (!headerValue) return [];
  const ids = headerValue.match(/<[^>]+>/g);
  return ids ? [...new Set(ids)] : [];
}

/**
 * Strip quoted reply history and signatures from an inbound plain-text email so
 * the AI analyzes only the new message. Best-effort: cuts at common quote
 * markers ("On … wrote:", "-----Original Message-----", a run of ">"-quoted
 * lines) and at the "-- " signature delimiter.
 */
export function stripQuotedReply(text: string): string {
  if (!text) return "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const cutPatterns = [
    /^On .+ wrote:$/i,
    /^Le .+ a écrit\s*:$/i,
    /^-{2,}\s*Original Message\s*-{2,}/i,
    /^_{5,}$/,
    /^From:\s.+/i,
    /^De\s*:\s.+/i,
  ];
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed === "--") break; // signature delimiter ("-- ", trailing space trimmed)
    if (cutPatterns.some((re) => re.test(trimmed))) break;
    // A block of quoted lines usually starts the history; stop at the first.
    if (/^\s*>/.test(trimmed) && out.join("").trim().length > 0) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

/** Best-effort order reference from a subject/body (e.g. "#000128", "GH-…", "n° 128"). */
export function extractOrderRef(text: string): string | null {
  if (!text) return null;
  const patterns = [
    /GH-[A-Z]-\d{3,}/i,
    /#\s?(\d{3,})/,
    /\bn[°o]\s?\.?\s?(\d{3,})\b/i,
    /\bcommande\s+#?\s?(\d{3,})\b/i,
    /\border\s+#?\s?(\d{3,})\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return (m[0].startsWith("GH-") ? m[0] : `#${m[1]}`).toUpperCase();
  }
  return null;
}
