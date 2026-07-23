import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { Dimension, RateLimitPolicy, RateLimitResult } from "../rateLimitCore";

/**
 * Primary durable backend: Upstash Redis via @upstash/ratelimit (sliding window).
 * Shared across every serverless instance, so a distributed attacker sees ONE
 * budget — unlike the in-process Map this replaces. Throws on any Redis error so
 * the caller can fall back to the Postgres counter (see ../rateLimit).
 */

let client: Redis | null = null;
let checked = false;

export function redisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function redis(): Redis | null {
  if (checked) return client;
  checked = true;
  if (!redisConfigured()) return null;
  client = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  return client;
}

// One Ratelimit instance per distinct policy (limit + window). Cached so we
// don't rebuild them per request. The `prefix` namespaces our keys inside Redis.
const limiters = new Map<string, Ratelimit>();

function limiterFor(policy: RateLimitPolicy): Ratelimit | null {
  const r = redis();
  if (!r) return null;
  const cacheKey = `${policy.limit}:${policy.windowMs}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: r,
      // Sliding window keeps the budget smooth across the window boundary.
      limiter: Ratelimit.slidingWindow(policy.limit, `${policy.windowMs} ms`),
      prefix: "ghost:rl",
      analytics: false,
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

/**
 * Charge one attempt against every dimension with all-or-nothing semantics: a
 * read pass (getRemaining, non-consuming) rejects before any token is spent, so
 * a request denied on one dimension does not burn budget on the others — matching
 * the in-memory consumeAll contract. Throws if Redis is unreachable.
 */
export async function redisConsume(dimensions: Dimension[]): Promise<RateLimitResult> {
  if (dimensions.length === 0) return { allowed: true, remaining: 0, retryAfterMs: 0 };

  // Check pass — no consumption.
  let worst: RateLimitResult | null = null;
  for (const d of dimensions) {
    const limiter = limiterFor(d.policy);
    if (!limiter) throw new Error("Upstash Redis not configured");
    const { remaining, reset } = await limiter.getRemaining(d.key);
    if (remaining <= 0) {
      const retryAfterMs = Math.max(0, reset - Date.now());
      if (!worst || retryAfterMs > worst.retryAfterMs) {
        worst = { allowed: false, remaining: 0, retryAfterMs };
      }
    }
  }
  if (worst) return worst;

  // Charge pass — consume one token on each dimension.
  let minRemaining = Number.POSITIVE_INFINITY;
  for (const d of dimensions) {
    const limiter = limiterFor(d.policy)!;
    const res = await limiter.limit(d.key);
    if (!res.success) {
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, res.reset - Date.now()) };
    }
    minRemaining = Math.min(minRemaining, res.remaining);
  }
  return {
    allowed: true,
    remaining: Number.isFinite(minRemaining) ? minRemaining : 0,
    retryAfterMs: 0,
  };
}
