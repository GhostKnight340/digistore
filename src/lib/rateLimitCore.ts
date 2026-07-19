/**
 * Pure sliding-window rate-limit core. No Next, no DB — so it is directly
 * unit-testable (see test/lib/rateLimit.test.ts). The Next-facing wrappers and
 * the per-endpoint budgets live in ./rateLimit.
 *
 * ⚠ LIMITATION — READ BEFORE RELYING ON THIS FOR SECURITY ⚠
 * The store is an in-process Map, so these limits are PER SERVERLESS INSTANCE.
 * On Vercel each cold start begins with an empty store, and concurrent requests
 * are spread across many instances — so a parallel or distributed attacker gets
 * roughly (limit × instance count) attempts, not `limit`. This is the same
 * weakness the login limiter in src/app/actions/auth.ts always had, and the
 * same one documented in src/lib/checkout/emailVerification.ts.
 *
 * It is NOT a substitute for a durable limit. It raises the cost of casual and
 * single-connection abuse; it does not stop a determined distributed attacker.
 * A durable limit needs shared state (Redis/Upstash, or a counter table) — both
 * of which require either a new dependency or a schema migration, and neither
 * was available here. Where a durable, migration-free defence WAS possible it is
 * used instead of (not in addition to) trusting this: the `q` length cap in
 * src/app/api/search/route.ts, the magic-byte sniff and the pending-attachment
 * circuit breaker in src/app/api/feedback/attachment/route.ts.
 */

export interface RateLimitPolicy {
  /** Max events permitted inside `windowMs`. */
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Events still available in the current window (0 when denied). */
  remaining: number;
  /** Hint for how long until the oldest event falls out of the window. */
  retryAfterMs: number;
}

/** Timestamps of recent events, keyed by an opaque dimension key. */
export type RateLimitStore = Map<string, number[]>;

export function createStore(): RateLimitStore {
  return new Map();
}

function recent(store: RateLimitStore, key: string, windowMs: number, now: number): number[] {
  const hits = store.get(key);
  if (!hits) return [];
  return hits.filter((t) => now - t < windowMs);
}

/**
 * Would this event be allowed? Does NOT record it — so several dimensions can
 * be tested before any of them is charged.
 */
export function check(
  store: RateLimitStore,
  key: string,
  policy: RateLimitPolicy,
  now: number = Date.now(),
): RateLimitResult {
  const hits = recent(store, key, policy.windowMs, now);
  if (hits.length >= policy.limit) {
    const oldest = Math.min(...hits);
    return { allowed: false, remaining: 0, retryAfterMs: oldest + policy.windowMs - now };
  }
  return { allowed: true, remaining: policy.limit - hits.length - 1, retryAfterMs: 0 };
}

/** Record one event against `key`, pruning anything outside the window. */
export function record(
  store: RateLimitStore,
  key: string,
  policy: RateLimitPolicy,
  now: number = Date.now(),
): void {
  const hits = recent(store, key, policy.windowMs, now);
  hits.push(now);
  store.set(key, hits);
}

export interface Dimension {
  key: string;
  policy: RateLimitPolicy;
}

/**
 * Enforce several independent dimensions (e.g. by-IP AND by-email) as one
 * decision. Every dimension is checked BEFORE any is charged, so a request
 * denied on one dimension does not burn budget on the others — and so a caller
 * cannot be double-penalised for a single attempt.
 */
export function consumeAll(
  store: RateLimitStore,
  dimensions: Dimension[],
  now: number = Date.now(),
): RateLimitResult {
  let worst: RateLimitResult | null = null;
  for (const d of dimensions) {
    const result = check(store, d.key, d.policy, now);
    if (!result.allowed && (!worst || result.retryAfterMs > worst.retryAfterMs)) {
      worst = result;
    }
  }
  if (worst) return worst;

  for (const d of dimensions) record(store, d.key, d.policy, now);
  return { allowed: true, remaining: 0, retryAfterMs: 0 };
}

/**
 * Drop keys with no events left inside `maxWindowMs`. Without this the store
 * grows one entry per distinct IP forever — an in-process memory leak that an
 * attacker rotating source addresses could drive. Callers sweep lazily once the
 * store crosses a size threshold rather than on a timer (there is no long-lived
 * scheduler on serverless).
 */
export function sweep(store: RateLimitStore, maxWindowMs: number, now: number = Date.now()): void {
  for (const [key, hits] of store) {
    if (hits.every((t) => now - t >= maxWindowMs)) store.delete(key);
  }
}
