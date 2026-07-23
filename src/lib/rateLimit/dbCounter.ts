import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Dimension, RateLimitResult } from "../rateLimitCore";
import { fixedWindowDecision, windowBucket, windowExpiry } from "./fixedWindow";

/**
 * Durable Postgres fallback for the public rate limiter, used ONLY when Upstash
 * Redis is unavailable. A fixed-window counter row per dimension in
 * `RateLimitCounter`, incremented atomically — so limits still hold across
 * serverless instances (unlike the in-process Map). Throws on a DB error; the
 * orchestrator (../rateLimit) then fails CLOSED so a sensitive endpoint never
 * becomes unlimited.
 *
 * Semantics mirror the in-memory consumeAll: a read pass rejects before any
 * dimension is charged, so a request denied on one dimension doesn't burn budget
 * on the others.
 */

export async function dbConsume(dimensions: Dimension[], now: number = Date.now()): Promise<RateLimitResult> {
  if (dimensions.length === 0) return { allowed: true, remaining: 0, retryAfterMs: 0 };

  const buckets = dimensions.map((d) => ({
    dim: d,
    bucket: windowBucket(d.key, d.policy.windowMs, now),
    expiresAt: new Date(windowExpiry(d.policy.windowMs, now)),
  }));

  // Read pass: current counts for every bucket in one query.
  const existing = await prisma.rateLimitCounter.findMany({
    where: { bucket: { in: buckets.map((b) => b.bucket) } },
    select: { bucket: true, count: true },
  });
  const countByBucket = new Map(existing.map((r) => [r.bucket, r.count]));

  let worst: RateLimitResult | null = null;
  for (const b of buckets) {
    const current = countByBucket.get(b.bucket) ?? 0;
    // Would this attempt exceed the limit? (current + 1 is the post-charge count)
    const decision = fixedWindowDecision(current + 1, b.dim.policy, b.dim.policy.windowMs, now);
    if (!decision.allowed && (!worst || decision.retryAfterMs > worst.retryAfterMs)) {
      worst = decision;
    }
  }
  if (worst) return worst;

  // Charge pass: atomic upsert-increment per bucket.
  let minRemaining = Number.POSITIVE_INFINITY;
  for (const b of buckets) {
    const row = await prisma.rateLimitCounter.upsert({
      where: { bucket: b.bucket },
      create: { bucket: b.bucket, count: 1, expiresAt: b.expiresAt },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    const remaining = Math.max(0, b.dim.policy.limit - row.count);
    minRemaining = Math.min(minRemaining, remaining);
  }

  return {
    allowed: true,
    remaining: Number.isFinite(minRemaining) ? minRemaining : 0,
    retryAfterMs: 0,
  };
}

/** Opportunistically drop expired counter rows (no long-lived scheduler exists
 * on serverless). Best-effort; never throws. */
export async function sweepExpiredCounters(now: number = Date.now()): Promise<void> {
  try {
    await prisma.rateLimitCounter.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  } catch {
    // ignore
  }
}
