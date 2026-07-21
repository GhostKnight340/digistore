/**
 * Cross-instance rate limiting backed by the DB (spec §4).
 *
 * Each dimension's counter is incremented with an atomic upsert, so the limit
 * holds even when many serverless instances run concurrently — unlike the
 * in-process limiter (src/lib/rateLimitCore.ts), which resets per instance.
 * Fixed-window; expired rows are swept opportunistically.
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { RATE_POLICIES, rateBucket, windowEnd, overLimit } from "./rateLimitBuckets";

export interface RateContext {
  userId: string;
  guildId: string;
  module: string;
  provider: string;
  now?: number;
  /** Optional per-dimension limit overrides from settings (spec §10). */
  limits?: Partial<Record<"user" | "guild" | "module" | "provider" | "global", number>>;
}

export interface RateDecision {
  allowed: boolean;
  /** Which dimension tripped (for logging + the Discord reply). */
  exceeded?: string;
  retryAfterMs?: number;
}

function valueFor(dimension: string, ctx: RateContext): string {
  switch (dimension) {
    case "user":
      return ctx.userId;
    case "guild":
      return ctx.guildId;
    case "module":
      return ctx.module;
    case "provider":
      return ctx.provider;
    default:
      return "all";
  }
}

let sweeps = 0;

/**
 * Charge one request against every rate dimension. Returns the first dimension
 * that exceeds its ceiling (fixed-window). Fails OPEN on a DB error — a limiter
 * outage must not take the assistant down.
 */
export async function consumeRateLimit(ctx: RateContext): Promise<RateDecision> {
  const now = ctx.now ?? Date.now();
  try {
    for (const policy of RATE_POLICIES) {
      const limit = ctx.limits?.[policy.dimension] ?? policy.limit;
      const bucket = rateBucket(policy.dimension, valueFor(policy.dimension, ctx), policy.windowMs, now);
      const endMs = windowEnd(policy.windowMs, now);
      const row = await prisma.aiRateCounter.upsert({
        where: { bucket },
        create: { bucket, count: 1, expiresAt: new Date(endMs) },
        update: { count: { increment: 1 } },
      });
      if (overLimit(row.count, limit)) {
        return { allowed: false, exceeded: policy.dimension, retryAfterMs: endMs - now };
      }
    }
    // Opportunistic sweep of expired counters (bounded, best-effort).
    if (++sweeps % 50 === 0) {
      await prisma.aiRateCounter.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }).catch(() => {});
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}
