/**
 * Daily Reports module — executive reports posted to Discord (spec: Daily
 * Reports).
 *
 * Like the Discord assistant, this NEVER touches Prisma: every figure comes from
 * the safe tool layer (`callTool`, via gatherReportMetrics) and the provider/
 * model/budget/logging guardrails are inherited by running through `runModule`.
 * The AI is used ONLY for prose (summary, recommendations, trends, priorities);
 * all numbers are computed deterministically and printed by the formatter, so a
 * figure can never be hallucinated.
 *
 * One module, four report types (morning / evening / weekly / monthly), each
 * independently scheduled and configured. Scheduling drives this via
 * reportDispatch; manual "@Ghost CEO … report" commands and the admin
 * "Run now"/"Preview" buttons drive it directly.
 */

import "server-only";

import { runModule, type ModuleRunContext, type ModuleRunOutput } from "../runner";
import { gatherReportMetrics, type ReportMetrics } from "../reports/metrics";
import { buildReportPrompt, type ReportNarrative } from "../reports/prompt";
import { buildReportPayload, buildReportText } from "../reports/format";
import { deliverReport, notifyReportFailure } from "../reports/discord";
import { reportDefinition, reportLabel, type ReportType } from "../reports/reportTypes";
import { DAILY_REPORTS_MODULE } from "../reports/module";
import { coerceNarrative } from "../narrative";
import type { ExecutionTrigger } from "../types";

export { DAILY_REPORTS_MODULE };

export interface GenerateReportInput {
  reportType: ReportType;
  trigger: ExecutionTrigger;
  /** When true, post to the configured Discord channel; false = preview only. */
  deliver: boolean;
  idempotencyKey?: string | null;
  triggeredBy?: string | null;
  /** Per-report overrides resolved by the scheduler / admin. */
  modelOverride?: string | null;
  maxTokens?: number | null;
  /** The report's own channel override (highest precedence). */
  discordChannelId?: string | null;
}

export interface GenerateReportResult {
  ok: boolean;
  reason?: string;
  executionId?: string | null;
  costUsd?: number;
  /** The rendered markdown (for previews and the on-demand reply). */
  text?: string;
  delivered?: boolean;
}

/** A deterministic narrative built from the figures — no invented numbers. */
function fallbackNarrative(metrics: ReportMetrics): ReportNarrative {
  const def = reportDefinition(metrics.type);
  const f = metrics.figures;
  const priorities: string[] = [];
  if (f.ordersWaiting && f.ordersWaiting > 0) priorities.push("Process the orders still waiting.");
  if (f.pendingPaymentConfirmations && f.pendingPaymentConfirmations > 0) {
    priorities.push("Confirm the pending payments.");
  }
  if (f.operationalAlerts.length) priorities.push("Resolve the operational alerts listed below.");
  if (!priorities.length) priorities.push("No blocking items — keep monitoring fulfillment and stock.");
  return {
    summary: `${def.title}: figures for ${metrics.windowLabel} are below.`,
    recommendations: ["Review the figures and act on anything unusual."],
    trends: "",
    topPriorities: priorities,
  };
}

/** The module body handed to the runner (guardrails wrap this). */
async function reportBody(input: GenerateReportInput, ctx: ModuleRunContext): Promise<ModuleRunOutput> {
  const metrics = await gatherReportMetrics(input.reportType, ctx.executionId);

  // The AI writes ONLY the prose. It is best-effort: if the provider is rate-
  // limited, down, or times out, we still deliver the report with the
  // deterministic fallback narrative — the figures (the real value) always ship.
  let narrative: ReportNarrative;
  let usage = { tokensIn: 0, tokensOut: 0, costUsd: 0 };
  let provider = ctx.provider;
  let model = ctx.model;
  let narrativeFailed = false;
  try {
    const completion = await ctx.client.complete({
      model: ctx.model,
      system: buildReportPrompt(input.reportType, ctx.settings.reportLanguage, ctx.config.instructions),
      // Send ONLY the computed figures (+ which sources were unavailable), never
      // the raw tool snapshot: the figures already carry every number the model
      // needs, so this ~halves input tokens with no loss of grounding.
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

  const payload = buildReportPayload(metrics, narrative);
  const text = buildReportText(metrics, narrative);

  let delivered = false;
  if (input.deliver) {
    const result = await deliverReport(input.discordChannelId ?? null, payload);
    if (result.ok) {
      delivered = true;
    } else if (input.trigger === "schedule") {
      // Scheduled delivery is the whole point: notify the admin and throw so the
      // run is recorded as failed and the scheduler retries on the next pass
      // (the idempotency key is not advanced until a delivery succeeds).
      await notifyReportFailure(input.reportType, result.error);
      throw new Error(`report_delivery_failed:${result.error}`);
    }
    // Manual/on-demand: best-effort delivery; the rendered text is still
    // returned so the admin sees the report even without a channel configured.
  }

  // The runner reads `text`; generateReport returns it to the caller.
  const how = narrativeFailed ? "figures-only (AI narrative unavailable)" : `via ${provider}/${model}`;
  return {
    provider,
    model,
    summary: `${reportLabel(input.reportType)} ${delivered ? "posted" : "generated"} ${how}.`,
    text,
    usage,
  };
}

/**
 * Generates one report and (optionally) delivers it. Runs through the guarded
 * runner so a disabled module / blown budget / disabled global switch returns a
 * typed failure — never an exception, never a hallucinated number.
 */
export async function generateReport(input: GenerateReportInput): Promise<GenerateReportResult> {
  const result = await runModule({
    module: DAILY_REPORTS_MODULE,
    trigger: input.trigger,
    triggeredBy: input.triggeredBy ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    modelOverride: input.modelOverride ?? null,
    maxTokens: input.maxTokens ?? null,
    body: (ctx) => reportBody(input, ctx),
  });

  if (!result.ok) return { ok: false, reason: result.reason };
  return {
    ok: true,
    executionId: result.executionId,
    costUsd: result.costUsd,
    text: result.text,
    delivered: input.deliver,
  };
}
