import { headers } from "next/headers";
import {
  consumeAll,
  createStore,
  sweep,
  type Dimension,
  type RateLimitPolicy,
  type RateLimitResult,
} from "./rateLimitCore";

/**
 * Shared abuse-prevention limiter for the public, unauthenticated surface:
 * order lookup, the auth actions, feedback attachment upload and search.
 *
 * Read the LIMITATION block at the top of ./rateLimitCore before treating any
 * of these budgets as a security guarantee — the store is per-instance and
 * resets on a serverless cold start.
 */

const store = createStore();

/** Longest window any policy below uses — drives the lazy sweep. */
const MAX_WINDOW_MS = 60 * 60 * 1000;
const SWEEP_THRESHOLD = 5_000;

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

  /** Preserves the historic 8-per-15-min email budget, adds an IP dimension. */
  loginEmail: { limit: 8, windowMs: 15 * MIN },
  /** Looser than the e-mail budget: offices and mobile carriers share an IP. */
  loginIp: { limit: 20, windowMs: 15 * MIN },

  registerIp: { limit: 5, windowMs: 60 * MIN },

  /** Sends an e-mail on Resend's quota to an attacker-chosen address. */
  passwordResetEmail: { limit: 3, windowMs: 60 * MIN },
  passwordResetIp: { limit: 10, windowMs: 60 * MIN },
  resendVerificationEmail: { limit: 3, windowMs: 60 * MIN },
  resendVerificationIp: { limit: 10, windowMs: 60 * MIN },

  /** Each accepted upload writes megabytes of base64 into the database. */
  attachmentIp: { limit: 5, windowMs: 10 * MIN },

  /** Keystroke autocomplete — must stay comfortable for real typing. */
  searchIp: { limit: 60, windowMs: 1 * MIN },
} satisfies Record<string, RateLimitPolicy>;

// ── Client IP ────────────────────────────────────────────────────────────────

/**
 * Same derivation the codebase already uses (see src/app/actions/feedback.ts
 * and src/lib/checkout/emailVerification.ts). Note these headers are supplied by
 * the proxy; on Vercel x-forwarded-for is trustworthy, but a self-hosted
 * deployment behind a misconfigured proxy could see a spoofed value.
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

/**
 * Charge one attempt against every listed dimension. Dimensions are namespaced
 * per action so an IP's search budget is independent of its login budget.
 */
export function consume(dimensions: Dimension[]): RateLimitResult {
  if (store.size > SWEEP_THRESHOLD) sweep(store, MAX_WINDOW_MS);
  return consumeAll(store, dimensions);
}

/** Build a namespaced dimension, e.g. dim("login:ip", ip, POLICIES.loginIp). */
export function dim(namespace: string, value: string, policy: RateLimitPolicy): Dimension {
  return { key: `${namespace}:${value}`, policy };
}

/** Test-only: drop all recorded events. */
export function __resetForTests(): void {
  store.clear();
}
