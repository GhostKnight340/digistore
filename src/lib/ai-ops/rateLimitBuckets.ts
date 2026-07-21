/**
 * Cross-instance rate-limit policies + bucket derivation — PURE (no DB).
 *
 * A fixed-window counter model: each (dimension, value) gets a bucket key that
 * changes every window, so incrementing it in the DB and comparing to the limit
 * gives a shared limit across app instances. The dimensions match spec §4:
 * Discord user, guild, module, provider, and a global cap.
 */

export interface RatePolicy {
  dimension: "user" | "guild" | "module" | "provider" | "global";
  limit: number;
  windowMs: number;
}

const MINUTE = 60_000;

/** Default per-minute ceilings. Made configurable via settings in a later phase. */
export const RATE_POLICIES: RatePolicy[] = [
  { dimension: "user", limit: 12, windowMs: MINUTE },
  { dimension: "guild", limit: 60, windowMs: MINUTE },
  { dimension: "module", limit: 90, windowMs: MINUTE },
  { dimension: "provider", limit: 120, windowMs: MINUTE },
  { dimension: "global", limit: 240, windowMs: MINUTE },
];

/** Deterministic bucket key: "{dimension}:{value}:{windowIndex}". */
export function rateBucket(dimension: string, value: string, windowMs: number, now: number): string {
  const windowIndex = Math.floor(now / windowMs);
  const safeValue = String(value || "-").replace(/[:|]/g, "_");
  return `${dimension}:${safeValue}:${windowIndex}`;
}

/** The UTC instant the current window ends (for Retry-After / row expiry). */
export function windowEnd(windowMs: number, now: number): number {
  return (Math.floor(now / windowMs) + 1) * windowMs;
}

/** A post-increment count exceeds the limit when it is strictly greater. */
export function overLimit(count: number, limit: number): boolean {
  return count > limit;
}
