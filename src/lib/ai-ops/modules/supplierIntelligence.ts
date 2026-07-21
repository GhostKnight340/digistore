/**
 * Supplier Intelligence module — periodic supplier health/cost report to Discord
 * (spec: Supplier Intelligence). Runs on the base scheduler (every 6h) and via
 * "Run now".
 *
 * Like Daily Reports: NEVER touches Prisma (figures come from the safe tool
 * layer), inherits every guardrail by running through `runModule`, and uses the
 * AI for PROSE ONLY — a provider 429/outage degrades to a deterministic
 * figures-only narrative, so the supplier check always ships.
 */

import "server-only";

import { runModule, type ModuleRunContext, type ModuleRunOutput } from "../runner";
import { gatherSupplierMetrics, type SupplierMetrics } from "../supplier/metrics";
import { buildSupplierPrompt } from "../supplier/prompt";
import { buildSupplierPayload, buildSupplierText } from "../supplier/format";
import { SUPPLIER_INTELLIGENCE_MODULE } from "../supplier/module";
import { coerceNarrative, type AiNarrative } from "../narrative";
import { deliverToChannel, notifyAiFailure } from "../discord/deliver";
import type { ExecutionTrigger } from "../types";

export { SUPPLIER_INTELLIGENCE_MODULE };

/** A deterministic narrative built from the figures — no invented numbers. */
function fallbackNarrative(metrics: SupplierMetrics): AiNarrative {
  const f = metrics.figures;
  const down = f.suppliers.filter((s) => s.status !== "healthy");
  const priorities: string[] = [];
  if (down.length) priorities.push("Restore the suppliers flagged below to healthy.");
  if (f.fulfillment.failed && f.fulfillment.failed > 0) priorities.push("Investigate the failed fulfillments.");
  if (!priorities.length) priorities.push("No supplier issues — keep monitoring costs and availability.");
  return {
    summary: down.length
      ? `${down.length} supplier(s) need attention; see the health and alerts below.`
      : "All suppliers report healthy; figures are below.",
    recommendations: ["Review the alerts and act on anything unusual."],
    trends: "",
    topPriorities: priorities,
  };
}

/**
 * The module body handed to the runner (guardrails wrap this). Always delivers
 * to the supplier channel; a delivery failure throws so the run is recorded as
 * failed and the scheduler retries.
 */
export async function supplierBody(ctx: ModuleRunContext): Promise<ModuleRunOutput> {
  const metrics = await gatherSupplierMetrics(ctx.executionId);

  let narrative: AiNarrative;
  let usage = { tokensIn: 0, tokensOut: 0, costUsd: 0 };
  let provider = ctx.provider;
  let model = ctx.model;
  let narrativeFailed = false;
  try {
    const completion = await ctx.client.complete({
      model: ctx.model,
      system: buildSupplierPrompt(ctx.settings.reportLanguage, ctx.config.instructions),
      input: { windowLabel: metrics.windowLabel, figures: metrics.figures, unavailable: metrics.unavailable },
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
  } catch {
    narrativeFailed = true;
    narrative = fallbackNarrative(metrics);
  }

  const payload = buildSupplierPayload(metrics, narrative);
  const text = buildSupplierText(metrics, narrative);

  const delivery = await deliverToChannel(
    { overrideChannelId: ctx.config.discordChannelId, moduleKey: SUPPLIER_INTELLIGENCE_MODULE, purpose: "supplier_reports" },
    payload,
    "supplier_intelligence",
  );
  if (!delivery.ok) {
    await notifyAiFailure("Supplier Intelligence", delivery.error, "supplier_intelligence");
    throw new Error(`supplier_delivery_failed:${delivery.error}`);
  }

  const how = narrativeFailed ? "figures-only (AI narrative unavailable)" : `via ${provider}/${model}`;
  return {
    provider,
    model,
    summary: `Supplier Intelligence posted ${how}.`,
    text,
    usage,
  };
}

export interface RunSupplierInput {
  trigger: ExecutionTrigger;
  idempotencyKey?: string | null;
  triggeredBy?: string | null;
  modelOverride?: string | null;
  maxTokens?: number | null;
}

/**
 * Runs Supplier Intelligence through the guarded runner. Used by "Run now"; the
 * scheduler invokes `supplierBody` directly via the module-body registry.
 */
export async function runSupplierIntelligence(input: RunSupplierInput) {
  return runModule({
    module: SUPPLIER_INTELLIGENCE_MODULE,
    trigger: input.trigger,
    triggeredBy: input.triggeredBy ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    modelOverride: input.modelOverride ?? null,
    maxTokens: input.maxTokens ?? null,
    body: supplierBody,
  });
}
