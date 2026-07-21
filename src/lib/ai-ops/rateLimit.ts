/**
 * Rate limiting for AI tool calls.
 *
 * Reuses the existing pure sliding-window core (src/lib/rateLimitCore.ts) rather
 * than inventing another limiter. Two dimensions are enforced per call: a
 * per-module budget and a tighter per-(module,tool) budget, so one module can't
 * hammer a single expensive tool and no module can exceed its overall call rate.
 *
 * In-process/per-instance like the public rate limiter — good enough as a
 * foundation guardrail; a cross-instance limiter can be layered later. The store
 * is module-level and swept lazily to bound growth.
 */

import {
  consumeAll,
  createStore,
  sweep,
  type RateLimitPolicy,
  type RateLimitResult,
} from "@/lib/rateLimitCore";

export const AI_TOOL_POLICIES = {
  /** Overall calls per module. */
  perModule: { limit: 60, windowMs: 60_000 } as RateLimitPolicy,
  /** Calls per (module, tool). */
  perModuleTool: { limit: 20, windowMs: 60_000 } as RateLimitPolicy,
};

const store = createStore();
const MAX_WINDOW_MS = 60_000;
let calls = 0;

/**
 * Charge one tool call against both dimensions. Returns the limiter decision;
 * the caller denies with a `rate_limited` tool-call log when `allowed` is false.
 */
export function consumeToolBudget(
  module: string,
  tool: string,
  now: number = Date.now(),
): RateLimitResult {
  // Lazy sweep to bound the store (no long-lived scheduler on serverless).
  if (++calls % 200 === 0) sweep(store, MAX_WINDOW_MS, now);
  return consumeAll(
    store,
    [
      { key: `ai:mod:${module}`, policy: AI_TOOL_POLICIES.perModule },
      { key: `ai:tool:${module}:${tool}`, policy: AI_TOOL_POLICIES.perModuleTool },
    ],
    now,
  );
}

/** Test hook: reset the in-memory store. */
export function __resetToolRateLimit(): void {
  store.clear();
  calls = 0;
}
