import { headers } from "next/headers";
import type { Dimension, RateLimitPolicy, RateLimitResult } from "./rateLimitCore";

/**
 * Shared abuse-prevention limiter for the public, unauthenticated surface: order
 * lookup, the auth actions, feedback / refund attachment upload and search.
 *
 * Backend (see ./rateLimit/*): a DURABLE, cross-instance limiter, unlike the
 * per-process Map it replaced.
 *   1. Primary  — Upstash Redis via @upstash/ratelimit (sliding window).
 *   2. Fallback — a Postgres fixed-window counter (RateLimitCounter), used when
 *                 Redis is unavailable, so limits still hold across instances.
 *   3. Both down — FAIL CLOSED (deny). Sensitive endpoints must never silently
 *                 become unlimited; if Postgres itself is down the app can't serve
 *                 these routes anyway.
 *
 * `POLICIES` remains the single source of truth for every budget and is reused by
 * auth, support, payment-proof/refund and order-lookup routes.
 */

import { redisConfigured, redisConsume } from "./rateLimit/redis";
import { dbConsume, sweepExpiredCounters } from "./rateLimit/dbCounter";

export type { Dimension, RateLimitPolicy, RateLimitResult } from "./rateLimitCore";

// ── Budgets ──────────────────────────────────────────────────────────────────
// Sized per action: rarer + more damaging (password reset e-mails, order-token
// lookups) get tighter budgets than routine ones (login, search keystrokes).
// Every budget is generous enough that a legitimate user retrying by hand will
// not trip it.

const MIN = 60 * 1000;

export const POLICIES = {
  /** Order lookup is a deliberate, occasional act — never a hot path. */
  orderLookupIp: { limit: 10, windowMs: 10 * MIN },
  orderLookupEmail: { limit: 5, windowMs: 10 * MIN },

  /**
   * Escalating penalty budgets charged ONLY on a FAILED lookup (wrong email / no
   * such order / unauthorized). Much tighter and over a longer window than the
   * per-attempt budgets above, so a handful of honest typos are fine but a script
   * grinding order-number×email combinations is throttled hard and quickly.
   */
  orderLookupFailIp: { limit: 20, windowMs: 60 * MIN },
  orderLookupFailEmail: { limit: 10, windowMs: 60 * MIN },

  /**
   * Order creation. Guest checkout means this is reachable without a session,
   * and each accepted call writes an Order + items + a payment event and sends a
   * transactional e-mail on Resend's quota. Generous enough that a customer
   * retrying by hand — or legitimately buying twice — never trips it; the
   * duplicate-order guard handles honest double-taps before they reach here.
   */
  orderCreateIp: { limit: 12, windowMs: 10 * MIN },
  orderCreateEmail: { limit: 6, windowMs: 10 * MIN },

  /** Preserves the historic 8-per-15-min email budget, adds an IP dimension. */
  loginEmail: { limit: 8, windowMs: 15 * MIN },
  /** Looser than the e-mail budget: offices and mobile carriers share an IP. */
  loginIp: { limit: 20, windowMs: 15 * MIN },
  /** Escalating penalty for repeated FAILED logins from one IP. */
  loginFailIp: { limit: 30, windowMs: 60 * MIN },

  registerIp: { limit: 5, windowMs: 60 * MIN },

  /** Sends an e-mail on Resend's quota to an attacker-chosen address. */
  passwordResetEmail: { limit: 3, windowMs: 60 * MIN },
  passwordResetIp: { limit: 10, windowMs: 60 * MIN },
  resendVerificationEmail: { limit: 3, windowMs: 60 * MIN },
  resendVerificationIp: { limit: 10, windowMs: 60 * MIN },

  /** Each accepted upload writes megabytes into Blob/Postgres. */
  attachmentIp: { limit: 5, windowMs: 10 * MIN },

  /** Keystroke autocomplete — must stay comfortable for real typing. */
  searchIp: { limit: 60, windowMs: 1 * MIN },
} satisfies Record<string, RateLimitPolicy>;

// ── Client IP ────────────────────────────────────────────────────────────────

/**
 * Derive the client IP from Vercel's documented request headers. On Vercel
 * `x-forwarded-for`'s first hop is set by the platform and is trustworthy; a
 * self-hosted deployment behind a misconfigured proxy could see a spoofed value,
 * which is why the email/identifier dimension exists alongside the IP one.
 */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    return (fwd ? fwd.split(",")[0] : h.get("x-real-ip") || "").trim() || "unknown";
  } catch {
    return "unknown";
  }
}

/** IP for a route handler that already has the Request in hand. */
export function requestIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip") || "").trim() || "unknown";
}

// ── Enforcement ──────────────────────────────────────────────────────────────

let sweptAt = 0;
const SWEEP_INTERVAL_MS = 5 * MIN;

/**
 * Charge one attempt against every listed dimension, as one all-or-nothing
 * decision. Durable + shared across serverless instances. Tries Redis first,
 * then the Postgres counter, then fails closed. Async (the durable stores are
 * network calls) — callers must `await`.
 */
export async function consume(dimensions: Dimension[]): Promise<RateLimitResult> {
  if (redisConfigured()) {
    try {
      return await redisConsume(dimensions);
    } catch (err) {
      console.error("[rateLimit] Redis unavailable, falling back to Postgres counter", err);
    }
  }

  try {
    const result = await dbConsume(dimensions);
    // Opportunistically prune expired counter rows (no serverless scheduler).
    const now = Date.now();
    if (now - sweptAt > SWEEP_INTERVAL_MS) {
      sweptAt = now;
      void sweepExpiredCounters(now);
    }
    return result;
  } catch (err) {
    // Both durable stores are unavailable. Fail CLOSED so a sensitive endpoint
    // never becomes unlimited. (If Postgres is down these routes can't work
    // anyway — everything they do is a DB read/write.)
    console.error("[rateLimit] durable stores unavailable — failing closed", err);
    return { allowed: false, remaining: 0, retryAfterMs: 60 * 1000 };
  }
}

/** Build a namespaced dimension, e.g. dim("login:ip", ip, POLICIES.loginIp). */
export function dim(namespace: string, value: string, policy: RateLimitPolicy): Dimension {
  return { key: `${namespace}:${value}`, policy };
}
