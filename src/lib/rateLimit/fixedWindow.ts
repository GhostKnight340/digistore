/**
 * Pure fixed-window helpers for the durable Postgres fallback limiter. No DB, no
 * Next — directly unit-testable. The DB layer (./dbCounter) is a thin wrapper
 * that persists the counts these functions describe.
 */
import type { RateLimitPolicy } from "../rateLimitCore";

/**
 * Bucket key for a dimension in the current fixed window: "{key}:w{index}" where
 * index = floor(now / windowMs). A new window starts a fresh counter, which is
 * why an attacker can at worst get `2 × limit` across a boundary — acceptable for
 * a fallback that only runs while Redis is down.
 */
export function windowBucket(key: string, windowMs: number, now: number): string {
  return `${key}:w${Math.floor(now / windowMs)}`;
}

/** When the current window ends (ms since epoch) — used for row expiry + retry. */
export function windowExpiry(windowMs: number, now: number): number {
  return (Math.floor(now / windowMs) + 1) * windowMs;
}

/**
 * Decision for a dimension given the counter value that WOULD result after this
 * attempt (i.e. the post-increment count). Denied when it exceeds the limit.
 */
export function fixedWindowDecision(
  countAfter: number,
  policy: RateLimitPolicy,
  windowMs: number,
  now: number,
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  if (countAfter > policy.limit) {
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, windowExpiry(windowMs, now) - now) };
  }
  return { allowed: true, remaining: policy.limit - countAfter, retryAfterMs: 0 };
}
