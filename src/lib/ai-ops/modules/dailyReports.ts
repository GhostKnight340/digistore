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
import { buildReportPrompt, coerceReportNarrative, type ReportNarrative } from "../reports/prompt";
import { buildReportPayload, buildReportText } from "../reports/format";
import { deliverReport, notifyReportFailure } from "../reports/discord";
import { reportDefinition, reportLabel, type ReportType } from "../reports/reportTypes";
import { DAILY_REPORTS_MODULE } from "../reports/module";
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

/**
 * A deterministic briefing built from the computed deltas — used when the AI
 * narrative is unavailable (provider down / rate-limited / unparseable). It
 * quotes only figures/comparison values, so it can never hallucinate a number,
 * and it follows the same "omit what carries no insight" contract as the prompt.
 */
function fallbackNarrative(metrics: ReportMetrics): ReportNarrative {
  const def = reportDefinition(metrics.type);
  const f = metrics.figures;
  const c = metrics.comparison;

  const whatChanged: string[] = [];
  if (c.available) {
    if (c.revenue.deltaPct && c.revenue.direction !== "flat") {
      whatChanged.push(`Revenue ${c.revenue.direction === "up" ? "rose" : "fell"} ${c.revenue.deltaPct} versus ${c.baselineLabel}.`);
    }
    if (c.ordersTotal.deltaAbs != null && c.ordersTotal.direction !== "flat") {
      whatChanged.push(`Order volume ${c.ordersTotal.direction === "up" ? "increased" : "decreased"} versus ${c.baselineLabel}.`);
    }
    for (const p of c.productMovements.slice(0, 2)) {
      if (p.status === "new") whatChanged.push(`${p.name} began selling (${p.current}).`);
      else if (p.status === "gone") whatChanged.push(`${p.name} stopped selling.`);
      else whatChanged.push(`${p.name} demand ${p.status === "up" ? "rose" : "fell"}${p.deltaPct ? ` (${p.deltaPct})` : ""}.`);
    }
  }

  const anomalies: string[] = [];
  if (f.ordersWaiting && f.ordersWaiting > 0) anomalies.push(`${f.ordersWaiting} order(s) still waiting to be processed.`);
  if (f.pendingPaymentConfirmations && f.pendingPaymentConfirmations > 0) {
    anomalies.push(`${f.pendingPaymentConfirmations} payment(s) awaiting confirmation.`);
  }
  for (const alert of f.operationalAlerts) anomalies.push(alert);

  const recommendedActions: string[] = [];
  if (f.pendingPaymentConfirmations && f.pendingPaymentConfirmations > 0) recommendedActions.push("Review the pending payment confirmations first.");
  if (f.ordersWaiting && f.ordersWaiting > 0) recommendedActions.push("Clear the orders still waiting.");
  if (f.operationalAlerts.length) recommendedActions.push("Resolve the operational alerts listed above.");

  const quiet = !whatChanged.length && !anomalies.length;
  return {
    executiveSummary: quiet
      ? "No significant operational changes were detected since the previous period."
      : `${def.title}: the notable items for ${metrics.windowLabel} are below (AI narrative was unavailable).`,
    whatChanged,
    anomalies,
    likelyExplanation: "",
    recommendedActions: recommendedActions.slice(0, 3),
    keepUnchanged: "",
    watchList: "",
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
      // Send the computed figures + the period-over-period comparison (+ which
      // sources were unavailable), never the raw tool snapshot: these already
      // carry every number the model may quote, so this keeps input tokens low
      // with no loss of grounding.
      input: {
        windowLabel: metrics.windowLabel,
        figures: metrics.figures,
        comparison: metrics.comparison,
        unavailable: metrics.unavailable,
      },
      maxTokens: ctx.maxTokens ?? undefined,
      timeoutMs: 30_000,
    });
    narrative = coerceReportNarrative(completion.text, fallbackNarrative(metrics));
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
