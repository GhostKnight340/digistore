/**
 * Business Intelligence module — weekly financial/profitability brief to Discord
 * (spec: BI focus = margins, category profitability, concentration, growth).
 *
 * Runs on the base scheduler (Mondays 09:00) and via "Run now". Like the other
 * report modules: NEVER touches Prisma (figures come from the safe tool layer),
 * inherits every guardrail via `runModule`, and uses the AI for PROSE ONLY — a
 * provider 429/outage degrades to a deterministic figures-only narrative, so the
 * financial brief always ships. Unlike Supplier Intelligence (a silent monitor),
 * BI is a scheduled REPORT: it always posts the weekly financial picture.
 */

import "server-only";

import { runModule, type ModuleRunContext, type ModuleRunOutput } from "../runner";
import { gatherBiMetrics, type BiMetrics } from "../bi/metrics";
import { buildBiPrompt } from "../bi/prompt";
import { buildBiPayload, buildBiText } from "../bi/format";
import { BUSINESS_INTELLIGENCE_MODULE } from "../bi/module";
import { coerceNarrative, type AiNarrative } from "../narrative";
import { deliverToChannel, notifyAiFailure } from "../discord/deliver";
import type { ExecutionTrigger } from "../types";

export { BUSINESS_INTELLIGENCE_MODULE };

/** A deterministic narrative built from the figures — no invented numbers. */
function fallbackNarrative(metrics: BiMetrics): AiNarrative {
  const f = metrics.figures;
  const trends: string[] = [];
  if (f.revenueDeltaPct) trends.push(`revenue ${f.revenueDeltaPct} vs ${metrics.baselineLabel}`);
  if (f.marginDeltaPp) trends.push(`margin ${f.marginDeltaPp}`);

  const priorities: string[] = [];
  if (f.topCategorySharePct != null && f.topCategorySharePct >= 70) {
    priorities.push("Revenue is concentrated in one category — consider diversifying.");
  }
  if (f.lowMarginCategories.length) {
    priorities.push(`Review the low-margin categories (${f.lowMarginCategories.map((c) => c.category).join(", ")}).`);
  }
  if (f.costCoveragePct != null && f.costCoveragePct < 80) {
    priorities.push("Capture supplier cost on more fulfillments so margins are complete.");
  }
  if (!priorities.length) priorities.push("No structural risk visible — keep monitoring margin and concentration.");

  return {
    summary:
      f.marginPct != null
        ? `Weekly financials are below; gross margin and category profitability are the focus.`
        : `Weekly financials are below (supplier cost data is limited this week).`,
    recommendations: ["Review the figures and act on anything unusual."],
    trends: trends.length ? `Trend: ${trends.join(", ")}.` : "",
    topPriorities: priorities,
  };
}

/** The module body handed to the runner (guardrails wrap this). */
export async function businessIntelligenceBody(ctx: ModuleRunContext): Promise<ModuleRunOutput> {
  const metrics = await gatherBiMetrics(ctx.executionId);

  let narrative: AiNarrative;
  let usage = { tokensIn: 0, tokensOut: 0, costUsd: 0 };
  let cacheOutcome: ModuleRunOutput["cache"];
  let provider = ctx.provider;
  let model = ctx.model;
  let narrativeFailed = false;
  try {
    const completion = await ctx.client.complete({
      model: ctx.model,
      // Stable reusable prefix = the BI system prompt; the weekly figures below
      // are the volatile suffix. Explicit stable-prefix caching pins the
      // breakpoint on the system block.
      cache: ctx.cache,
      system: buildBiPrompt(ctx.settings.reportLanguage, ctx.config.instructions),
      input: { windowLabel: metrics.windowLabel, baselineLabel: metrics.baselineLabel, figures: metrics.figures, unavailable: metrics.unavailable },
      maxTokens: ctx.maxTokens ?? undefined,
      timeoutMs: 30_000,
    });
    narrative = coerceNarrative(completion.text, fallbackNarrative(metrics));
    provider = completion.provider;
    model = completion.model;
    usage = {
      tokensIn: completion.usage.tokensIn,
      tokensOut: completion.usage.tokensOut,
      costUsd: completion.usage.estimatedCostUsd,
    };
    cacheOutcome = completion.cache;
  } catch {
    narrativeFailed = true;
    narrative = fallbackNarrative(metrics);
  }

  const payload = buildBiPayload(metrics, narrative);
  const text = buildBiText(metrics, narrative);

  const delivery = await deliverToChannel(
    { overrideChannelId: ctx.config.discordChannelId, moduleKey: BUSINESS_INTELLIGENCE_MODULE, purpose: "business_intelligence" },
    payload,
    "business_intelligence",
  );
  if (!delivery.ok) {
    await notifyAiFailure("Business Intelligence", delivery.error, "business_intelligence");
    throw new Error(`bi_delivery_failed:${delivery.error}`);
  }

  const how = narrativeFailed ? "figures-only (AI narrative unavailable)" : `via ${provider}/${model}`;
  return {
    provider,
    model,
    summary: `Business Intelligence posted ${how}.`,
    text,
    usage,
    cache: cacheOutcome,
  };
}

export interface RunBiInput {
  trigger: ExecutionTrigger;
  idempotencyKey?: string | null;
  triggeredBy?: string | null;
  modelOverride?: string | null;
  maxTokens?: number | null;
}

/**
 * Runs Business Intelligence through the guarded runner. Used by "Run now"; the
 * scheduler invokes `businessIntelligenceBody` directly via the module-body
 * registry.
 */
export async function runBusinessIntelligence(input: RunBiInput) {
  return runModule({
    module: BUSINESS_INTELLIGENCE_MODULE,
    trigger: input.trigger,
    triggeredBy: input.triggeredBy ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    modelOverride: input.modelOverride ?? null,
    maxTokens: input.maxTokens ?? null,
    body: businessIntelligenceBody,
  });
}
