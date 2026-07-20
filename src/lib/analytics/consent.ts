/**
 * Analytics consent — the decision layer.
 *
 * Ghost.ma previously loaded GA4 unconditionally in production. This module is
 * the gate: no analytics provider may be loaded or initialised until the visitor
 * has actively chosen. Everything here is pure and client-safe so the rule can
 * be unit-tested without a browser or a DOM.
 *
 * Scope, deliberately narrow: this governs ANALYTICS only. The session cookie,
 * the checkout e-mail-verification session and the cart in localStorage are
 * strictly necessary to provide a service the customer asked for — they are not
 * gated here and must never be, or accepting/refusing analytics would break
 * checkout.
 *
 * No dark patterns: "Accepter" and "Refuser" are equally weighted and equally
 * reachable, refusing is one click, and the choice is re-openable from the
 * footer at any time. There is no "legitimate interest" pre-tick and no
 * consent-by-scrolling — an undecided visitor is treated exactly like a refusal
 * until they choose.
 */

/** Where the visitor's choice lives. Not a cookie: it is not itself tracking. */
export const CONSENT_STORAGE_KEY = "ghost.analytics-consent";

/**
 * Bump when the set of providers materially changes (e.g. adding Meta Pixel).
 * A stored choice from an older version is treated as undecided, because the
 * visitor consented to a different thing.
 */
export const CONSENT_VERSION = 1;

export type ConsentDecision = "granted" | "denied";

export interface StoredConsent {
  decision: ConsentDecision;
  version: number;
  /** ISO-8601. Kept so a retention/refresh policy can be applied later. */
  decidedAt: string;
}

/**
 * Parses whatever is in storage. Anything unrecognised, corrupt, or written by
 * an older consent version reads as `null` — undecided — because failing open
 * would mean tracking someone who never agreed.
 */
export function parseStoredConsent(raw: string | null | undefined): StoredConsent | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (record.decision !== "granted" && record.decision !== "denied") return null;
    if (record.version !== CONSENT_VERSION) return null;
    if (typeof record.decidedAt !== "string") return null;
    return {
      decision: record.decision,
      version: CONSENT_VERSION,
      decidedAt: record.decidedAt,
    };
  } catch {
    return null;
  }
}

/** Serialises a fresh decision for storage. */
export function serializeConsent(decision: ConsentDecision, now: Date = new Date()): string {
  return JSON.stringify({
    decision,
    version: CONSENT_VERSION,
    decidedAt: now.toISOString(),
  } satisfies StoredConsent);
}

/** Inputs that decide whether an analytics provider may run at all. */
export interface AnalyticsGateInput {
  /** True only on the real production runtime (never preview/staging). */
  isProduction: boolean;
  /** The provider's measurement/pixel id, if configured. */
  providerId: string | null | undefined;
  /** The visitor's stored decision, or null when they have not chosen. */
  consent: StoredConsent | null;
  /** `NEXT_PUBLIC_ANALYTICS_ENABLED` — a global kill switch. */
  globallyEnabled: boolean;
  /**
   * Debug mode (`NEXT_PUBLIC_ANALYTICS_DEBUG`). Makes events observable in a
   * non-production runtime WITHOUT sending them anywhere — see
   * {@link shouldLogAnalyticsToConsole}. It never relaxes the consent rule.
   */
  debug: boolean;
}

/**
 * May this provider be loaded and initialised right now?
 *
 * Every condition must hold. Note the ordering is not significant — this is a
 * conjunction, written out one clause per line so each has a reason attached.
 */
export function mayLoadProvider(input: AnalyticsGateInput): boolean {
  // A kill switch that works without touching provider ids or redeploying keys.
  if (!input.globallyEnabled) return false;
  // No id means nothing to send to. Never fall back to a baked-in property.
  if (!input.providerId) return false;
  // Staging and preview must never pollute the live property.
  if (!input.isProduction) return false;
  // The consent rule itself: silence unless explicitly granted. Undecided and
  // refused are treated identically.
  return input.consent?.decision === "granted";
}

/**
 * Should events be printed to the console instead of sent?
 *
 * This is what makes the analytics layer testable locally: with
 * `NEXT_PUBLIC_ANALYTICS_DEBUG=true` a developer sees exactly what WOULD be
 * sent, in a runtime where {@link mayLoadProvider} guarantees nothing is
 * actually transmitted. It is deliberately production-off: turning it on in
 * production would only add console noise, never a new data flow.
 */
export function shouldLogAnalyticsToConsole(input: {
  isProduction: boolean;
  debug: boolean;
}): boolean {
  return input.debug && !input.isProduction;
}
