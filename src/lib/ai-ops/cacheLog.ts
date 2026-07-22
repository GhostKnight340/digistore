/**
 * Prompt-caching activity logging (spec: Activity & Logs integration).
 *
 * Emits a single structured record per Anthropic call describing the cache
 * outcome, keyed to the SAME execution/correlation id as the parent AI request.
 * These are INVESTIGATION records, not alerts — normal cache hits and writes log
 * at info and never touch Discord. An actionable `warn` is raised only when a
 * cache-config rejection forced an uncached fallback (a recurring one is worth a
 * human's attention). Cross-run patterns ("repeated writes with almost no reads
 * over a meaningful sample") are surfaced by the metrics view, not per call.
 *
 * Only token counts and sanitized metadata are logged — never prompt contents.
 */

import "server-only";

import { log } from "@/lib/ops/log";
import type { AiCacheOutcome } from "./provider";

/** Maps a cache outcome to its canonical activity-event name. */
function cacheEvent(cache: AiCacheOutcome): string {
  if (cache.fallbackReason) return "anthropic.cache.fallback_uncached";
  if (!cache.applied) return "anthropic.cache.skipped";
  if (cache.hit) return "anthropic.cache.hit";
  if (cache.created) return "anthropic.cache.created";
  return "anthropic.cache.skipped"; // applied but no activity (below threshold)
}

/**
 * Records the prompt-caching outcome of a module run. No-op when the module did
 * not want caching (nothing to investigate). Best-effort: logging must never
 * break the observed flow.
 */
export function logCacheOutcome(
  module: string,
  executionId: string | null,
  cache: AiCacheOutcome | undefined,
): void {
  if (!cache || !cache.enabled) return;

  const context = {
    operation: cacheEvent(cache),
    result: cache.applied ? (cache.hit ? "hit" : cache.created ? "created" : "no_activity") : "skipped",
    module,
    executionId: executionId ?? undefined,
    strategy: cache.strategy,
    ttl: cache.ttl,
    ...(cache.skipReason ? { code: cache.skipReason } : {}),
    // Token counts + sanitized metadata only — never prompt contents.
    cacheCreationTokens: cache.cacheCreationTokens,
    cacheReadTokens: cache.cacheReadTokens,
    uncachedInputTokens: cache.uncachedInputTokens,
    savingsUsd: cache.savingsUsd,
  };

  if (cache.fallbackReason) {
    // A cache-config rejection that forced an uncached retry — actionable.
    log.warn("anthropic prompt cache fallback", { ...context, code: "malformed_cache_configuration" });
  } else {
    log.info("anthropic prompt cache activity", context);
  }
}
