import "server-only";

/**
 * CEO Briefing orchestrator (server entry).
 *
 * Hybrid pipeline (spec): deterministic facts → candidate issues (severity in
 * code) → AI writes/prioritizes among candidates and returns approved action ids
 * → server resolves ids to real routes. The AI never invents facts, routes, or
 * actions, never executes anything, and can never lower a genuine critical
 * (validation rejects that and we fall back).
 *
 * Cost control: the briefing is cached in a `StoreSetting` row (5–15 min TTL,
 * keyed by a hash of the material facts). We only call the model on a manual
 * refresh, when the material facts change, or when the cache expires — never on
 * every client render. If the AI is disabled/unavailable/times out/returns
 * something invalid, the deterministic fallback renders — never an empty card.
 *
 * The pure pieces live under ./ceoBriefing/*; the client renders the fallback
 * from ./ceoBriefing/fallback (client-safe) for its instant view.
 */

import type { CeoBriefingDTO } from "@/lib/dto";
import { getOperationsSnapshot } from "@/lib/ops/dashboard";
import { countOpenSupportTickets } from "@/lib/db/supportTickets";
import { getAiOpsSettings } from "@/lib/ai-ops/store";
import { resolveProvider, AiProviderError } from "@/lib/ai-ops/provider";
import { startExecution, finishExecution, recordUsage } from "@/lib/ai-ops/executions";
import type { OperationsSnapshotDTO } from "@/lib/dto";

import { computeCandidates, materialFactsHash } from "./ceoBriefing/candidates";
import { buildAiPayload } from "./ceoBriefing/snapshot";
import { buildBriefingPrompt, validateAiDecision, assembleFromDecision } from "./ceoBriefing/ai";
import { fallbackBriefingFromCandidates } from "./ceoBriefing/fallback";
import { readBriefingCache, writeBriefingCache } from "./ceoBriefing/cache";
import type { CandidateExtras } from "./ceoBriefing/types";

const MODULE = "ceo_briefing";
/** Serve a cached briefing for this long before regenerating (spec: 5–15 min). */
const CACHE_TTL_MS = 10 * 60 * 1000;
/** Providers that can actually produce a briefing; others go straight to fallback. */
const REAL_PROVIDERS = new Set(["anthropic", "openrouter"]);

/** In-lambda dedupe so a burst of renders shares one generation. */
let inflight: Promise<CeoBriefingDTO> | null = null;

export interface GetCeoBriefingOptions {
  /** Reuse an already-loaded snapshot (the ops page passes its own). */
  snapshot?: OperationsSnapshotDTO;
  /** Bypass the cache and regenerate now (manual refresh). */
  forceRefresh?: boolean;
  adminName?: string | null;
}

async function safeSupportOpen(): Promise<number> {
  try {
    return await countOpenSupportTickets();
  } catch {
    return 0;
  }
}

/**
 * Resolve the current CEO Briefing (AI or deterministic fallback), honoring the
 * cache. Always resolves to a valid, non-empty briefing.
 */
export async function getCeoBriefing(options: GetCeoBriefingOptions = {}): Promise<CeoBriefingDTO> {
  if (!options.forceRefresh && inflight) return inflight;
  const run = generate(options);
  if (!options.forceRefresh) {
    inflight = run.finally(() => {
      inflight = null;
    });
    return inflight;
  }
  return run;
}

async function generate(options: GetCeoBriefingOptions): Promise<CeoBriefingDTO> {
  const snapshot = options.snapshot ?? (await getOperationsSnapshot({ adminName: options.adminName ?? undefined }));
  const extras: CandidateExtras = { supportOpen: await safeSupportOpen() };
  const candidates = computeCandidates(snapshot, extras);
  const hash = materialFactsHash(candidates);
  const now = new Date().toISOString();

  // Cache hit: same material facts, still fresh, and not a forced refresh.
  if (!options.forceRefresh) {
    const cached = await readBriefingCache();
    if (cached && cached.briefing.snapshotHash === hash && Date.now() - cached.generatedAtMs < CACHE_TTL_MS) {
      return cached.briefing;
    }
  }

  const settings = await getAiOpsSettings();
  const provider = settings.defaultProvider;
  const model = settings.defaultModel;

  if (settings.globalEnabled && REAL_PROVIDERS.has(provider)) {
    const briefing = await tryAi(snapshot, extras, candidates, hash, now, {
      provider,
      model,
      timeoutMs: settings.providerTimeoutMs,
    });
    if (briefing) {
      await writeBriefingCache({ briefing, generatedAtMs: Date.now(), model });
      return briefing;
    }
  }

  // Deterministic fallback — always valid, never empty.
  const fallback = fallbackBriefingFromCandidates(candidates, now, hash);
  await writeBriefingCache({ briefing: fallback, generatedAtMs: Date.now(), model: null });
  return fallback;
}

async function tryAi(
  snapshot: OperationsSnapshotDTO,
  extras: CandidateExtras,
  candidates: ReturnType<typeof computeCandidates>,
  hash: string,
  now: string,
  cfg: { provider: string; model: string; timeoutMs: number },
): Promise<CeoBriefingDTO | null> {
  const payload = buildAiPayload(snapshot, extras, candidates, now);
  const { system, input } = buildBriefingPrompt(payload);
  const executionId = await startExecution({
    module: MODULE,
    trigger: "manual",
    executionMode: "auto",
    provider: cfg.provider,
    model: cfg.model,
  });
  const startedAtMs = Date.now();
  try {
    const client = resolveProvider(cfg.provider);
    const result = await client.complete({
      model: cfg.model,
      system,
      input,
      maxTokens: 600,
      timeoutMs: cfg.timeoutMs,
      // Cache the (stable) system prompt; the volatile payload sits after it.
      cache: { enabled: true, strategy: "explicit_static_prefix", ttl: "5m" },
    });
    const decision = validateAiDecision(result.structured ?? result.text, candidates, payload.allowedActionIds);
    const briefing = assembleFromDecision(decision, candidates, now, hash);

    await recordUsage({
      module: MODULE,
      provider: result.provider,
      model: result.model,
      tokensIn: result.usage.tokensIn,
      tokensOut: result.usage.tokensOut,
      costUsd: result.usage.estimatedCostUsd,
      executionId,
      cacheEnabled: result.cache?.enabled,
      cacheHit: result.cache?.hit,
      cacheCreated: result.cache?.created,
      cacheCreationTokens: result.cache?.cacheCreationTokens,
      cacheReadTokens: result.cache?.cacheReadTokens,
      cacheStrategy: result.cache?.strategy ?? null,
      cacheTtl: result.cache?.ttl ?? null,
      costWithoutCacheUsd: result.cache?.costWithoutCacheUsd ?? null,
    });
    await finishExecution(executionId, MODULE, startedAtMs, {
      status: "success",
      summary: `${briefing.state} · ${decision.primaryIssueType} · conf ${decision.confidence.toFixed(2)}`,
      estimatedTokensIn: result.usage.tokensIn,
      estimatedTokensOut: result.usage.tokensOut,
      estimatedCostUsd: result.usage.estimatedCostUsd,
    });
    return briefing;
  } catch (err) {
    // Safe, non-identifying failure reason (provider bodies are already drained).
    const reason = err instanceof AiProviderError ? err.code : err instanceof Error ? err.message.slice(0, 120) : "unknown";
    await finishExecution(executionId, MODULE, startedAtMs, { status: "failure", error: reason });
    return null; // caller renders the deterministic fallback
  }
}
