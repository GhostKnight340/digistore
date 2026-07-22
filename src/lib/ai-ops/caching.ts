/**
 * Anthropic prompt caching — the PURE core (no server-only, no network, no DB).
 *
 * Prompt caching is a prefix match: Anthropic evaluates `tools → system →
 * messages` in order, and any byte change in the prefix invalidates everything
 * after the last `cache_control` breakpoint. This module holds the deterministic
 * decisions around that contract so they stay unit-testable:
 *
 *   - which providers/models can cache at all (Anthropic direct only — the
 *     `cache_control` field is Anthropic-specific and must NOT be sent to
 *     OpenRouter/Gemini/OpenAI-compatible adapters);
 *   - the two supported strategies (automatic top-level vs explicit stable
 *     prefix) and when each is eligible;
 *   - the cost model (5-minute write 1.25×, 1-hour write 2×, read 0.1× base
 *     input price) and the savings estimate;
 *   - a canonical tool ordering so a department's tool list serializes the same
 *     way every request (reordered tools invalidate the whole cache).
 *
 * Nothing here assumes a cache was actually created or read — that is only
 * knowable from the response `usage` fields (see hitFromUsage/createdFromUsage).
 * A request below the model's minimum cacheable size is processed normally and
 * simply reports zero cache activity; that is "no cache activity", not an error.
 */

import { priceFor } from "./usage";

/** The configured caching strategy for a module (spec: promptCachingStrategy). */
export type CacheStrategy = "automatic" | "explicit_static_prefix" | "disabled";

/** Cache TTL (spec: promptCacheTtl). 1h is opt-in only; 5m is the default. */
export type CacheTtl = "5m" | "1h";

export function isCacheStrategy(v: unknown): v is CacheStrategy {
  return v === "automatic" || v === "explicit_static_prefix" || v === "disabled";
}
export function isCacheTtl(v: unknown): v is CacheTtl {
  return v === "5m" || v === "1h";
}

/**
 * Why caching was NOT applied to a request, or why no cache resulted. Recorded
 * per execution so the admin can tell "cache enabled" from "cache created" from
 * "cache hit" from "no cache activity" (spec: distinguish these clearly).
 */
export type CacheSkipReason =
  | "provider_unsupported"
  | "model_unsupported"
  | "caching_disabled"
  | "no_eligible_block"
  | "below_min_threshold"
  | "malformed_cache_configuration"
  | "retried_uncached"
  | "no_cache_usage_returned";

/**
 * Only Anthropic's DIRECT Messages API adapter speaks the `cache_control`
 * contract this system relies on. OpenRouter, Gemini, Ollama, and OpenAI-
 * compatible adapters must never receive `cache_control` (spec: provider
 * compatibility) — their adapters don't translate it, so it is a no-op at best
 * and a 400 at worst.
 */
const CACHE_CAPABLE_PROVIDERS = new Set<string>(["anthropic"]);

export function providerSupportsCaching(provider: string): boolean {
  return CACHE_CAPABLE_PROVIDERS.has(provider);
}

/**
 * Minimum cacheable prefix per model, in tokens. A prefix shorter than this
 * silently will NOT cache (no error) — the request is processed normally and the
 * response reports zero cache activity. Values from Anthropic's prompt-caching
 * docs; the system's default model (claude-haiku-4-5) needs 4096.
 */
const MODEL_MIN_CACHEABLE_TOKENS: Record<string, number> = {
  "claude-haiku-4-5": 4096,
  "claude-opus-4-8": 4096,
  "claude-opus-4-7": 4096,
  "claude-opus-4-6": 4096,
  "claude-opus-4-5": 4096,
  "claude-sonnet-5": 1024,
  "claude-sonnet-4-6": 2048,
  "claude-sonnet-4-5": 1024,
  "claude-fable-5": 2048,
};

/** Conservative default when a Claude model is not in the table. */
const DEFAULT_MIN_CACHEABLE_TOKENS = 4096;

/**
 * Whether a (bare, Anthropic-resolved) model id supports prompt caching. Every
 * Claude model does; a non-Claude id routed through the Anthropic adapter (which
 * should not happen) is treated as unsupported so we never send `cache_control`
 * to something that may reject it.
 */
export function modelSupportsCaching(model: string): boolean {
  return /^claude-/i.test((model ?? "").trim());
}

/** The model's minimum cacheable prefix size, in tokens. */
export function minCacheableTokens(model: string): number {
  return MODEL_MIN_CACHEABLE_TOKENS[(model ?? "").trim()] ?? DEFAULT_MIN_CACHEABLE_TOKENS;
}

/** The caching configuration resolved from a module's settings. */
export interface CacheConfig {
  enabled: boolean;
  strategy: CacheStrategy;
  ttl: CacheTtl;
}

/** Context the directive resolver needs beyond the config. */
export interface CacheResolveContext {
  provider: string;
  model: string;
  /** True when there is a stable reusable prefix (a non-empty system prompt). */
  hasStablePrefix: boolean;
}

/**
 * The decision for a single request: whether to attach `cache_control`, with
 * which strategy/TTL — or, if not, the reason (for observability). Pure.
 */
export type CacheDirective =
  | { apply: true; strategy: Exclude<CacheStrategy, "disabled">; ttl: CacheTtl }
  | { apply: false; skipReason: CacheSkipReason };

/**
 * Resolves the per-request cache directive from a module's config + the request
 * context. Fails closed to `apply:false` with a recorded reason; only Anthropic
 * + a Claude model + an eligible block ever caches.
 */
export function resolveCacheDirective(config: CacheConfig, ctx: CacheResolveContext): CacheDirective {
  if (!config.enabled || config.strategy === "disabled") {
    return { apply: false, skipReason: "caching_disabled" };
  }
  if (!providerSupportsCaching(ctx.provider)) {
    return { apply: false, skipReason: "provider_unsupported" };
  }
  if (!modelSupportsCaching(ctx.model)) {
    return { apply: false, skipReason: "model_unsupported" };
  }
  // Explicit stable-prefix caching needs a stable block to pin the breakpoint on
  // (the system prompt). Without one there is nothing reusable to cache.
  if (config.strategy === "explicit_static_prefix" && !ctx.hasStablePrefix) {
    return { apply: false, skipReason: "no_eligible_block" };
  }
  return { apply: true, strategy: config.strategy, ttl: config.ttl };
}

// ── Cost model ───────────────────────────────────────────────────────────────

/** Cache-write price multipliers over the base input price, by TTL. */
export function cacheWriteMultiplier(ttl: CacheTtl): number {
  return ttl === "1h" ? 2 : 1.25;
}

/** Cache reads (and refreshes) cost 0.1× the base input price. */
export const CACHE_READ_MULTIPLIER = 0.1;

export interface CacheUsageTokens {
  /** Full-price input tokens NOT served from or written to cache. */
  uncachedInputTokens: number;
  /** Tokens written to the cache this request (billed at the write multiplier). */
  cacheCreationTokens: number;
  /** Tokens served from the cache this request (billed at 0.1×). */
  cacheReadTokens: number;
  tokensOut: number;
}

export interface CacheCostBreakdown {
  /** Actual estimated cost WITH caching (write premium + cheap reads + output). */
  actualCostUsd: number;
  /** What the same tokens would have cost with NO caching (all input at 1×). */
  costWithoutCacheUsd: number;
  /** costWithoutCache − actual. Positive = money saved; negative = write overhead. */
  savingsUsd: number;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * The cache-aware cost of one Anthropic call, plus the counterfactual no-cache
 * cost and the savings. Uses the centralized model price table (usage.ts) so
 * prices live in exactly one place. Pure.
 */
export function computeCacheCost(model: string, ttl: CacheTtl, u: CacheUsageTokens): CacheCostBreakdown {
  const price = priceFor(model);
  const inRate = price.inPerMTok / 1_000_000;
  const outRate = price.outPerMTok / 1_000_000;
  const uncached = Math.max(0, u.uncachedInputTokens || 0);
  const writes = Math.max(0, u.cacheCreationTokens || 0);
  const reads = Math.max(0, u.cacheReadTokens || 0);
  const out = Math.max(0, u.tokensOut || 0);

  const actualInput = uncached * inRate + writes * inRate * cacheWriteMultiplier(ttl) + reads * inRate * CACHE_READ_MULTIPLIER;
  const actualCostUsd = round6(actualInput + out * outRate);

  // Counterfactual: every input token (uncached + writes + reads) at the base
  // input price, i.e. what an uncached run of the same prompt would have cost.
  const totalInput = uncached + writes + reads;
  const costWithoutCacheUsd = round6(totalInput * inRate + out * outRate);

  return { actualCostUsd, costWithoutCacheUsd, savingsUsd: round6(costWithoutCacheUsd - actualCostUsd) };
}

// ── Post-hoc classification (from response usage) ────────────────────────────

/** A cache was READ this request (a genuine hit, not just a write). */
export function hitFromUsage(cacheReadTokens: number): boolean {
  return (cacheReadTokens || 0) > 0;
}

/** A cache was WRITTEN this request (the ~1.25×/2× write premium was paid). */
export function createdFromUsage(cacheCreationTokens: number): boolean {
  return (cacheCreationTokens || 0) > 0;
}

/** Both zero → the request had no cache activity (below threshold, or first cold write missed). */
export function noCacheActivity(cacheCreationTokens: number, cacheReadTokens: number): boolean {
  return !createdFromUsage(cacheCreationTokens) && !hitFromUsage(cacheReadTokens);
}

// ── Determinism helpers ──────────────────────────────────────────────────────

/**
 * Sorts tool-like objects by a stable canonical key (name) so a department's
 * tool list serializes identically every request. Reordering tools invalidates
 * the tools + system + messages caches, so DB retrieval order must never leak
 * into the request. Returns a new array; input is not mutated.
 */
export function sortToolsCanonical<T extends { name: string }>(tools: readonly T[]): T[] {
  return [...tools].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
