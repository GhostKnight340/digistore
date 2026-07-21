/**
 * Reusable module-execution harness.
 *
 * The one place a module "runs": it wires the guardrails (global switch, module
 * enabled, budget) around an execution record and a provider call, and records
 * usage. For this FOUNDATION task the actual module bodies are not implemented —
 * a run performs a mock provider call and returns a placeholder — but the harness
 * (budget gate, execution log, usage accounting, idempotency) is complete and is
 * what both the scheduler and interactive triggers call later.
 */

import "server-only";

import { getAiOpsSettings, getModuleConfig } from "./store";
import {
  finishExecution,
  moduleDaySpendUsd,
  moduleExecutionsToday,
  monthSpendUsd,
  recordUsage,
  startExecution,
} from "./executions";
import { evaluateBudget } from "./budget";
import { resolveProvider } from "./provider";
import { isModuleKey, type ExecutionTrigger } from "./types";

export interface RunModuleInput {
  module: string;
  trigger: ExecutionTrigger;
  triggeredBy?: string | null;
  idempotencyKey?: string | null;
}

export type RunModuleResult =
  | { ok: true; executionId: string | null; summary: string; costUsd: number }
  | { ok: false; reason: string };

/**
 * Runs one module execution behind the guardrails. Returns a typed result;
 * never throws for a business-rule denial (only unexpected errors bubble as a
 * failed execution record).
 */
export async function runModule(input: RunModuleInput): Promise<RunModuleResult> {
  const { module } = input;
  if (!isModuleKey(module)) return { ok: false, reason: "unknown_module" };

  const settings = await getAiOpsSettings();
  if (!settings.globalEnabled) return { ok: false, reason: "global_disabled" };

  const config = await getModuleConfig(module);
  if (!config) return { ok: false, reason: "module_missing" };
  if (!config.enabled) return { ok: false, reason: "module_disabled" };

  // Budget gate (spec §12: budget limit enforcement).
  const now = new Date();
  const [monthSpent, daySpent, execCount] = await Promise.all([
    monthSpendUsd(now),
    moduleDaySpendUsd(module, now),
    moduleExecutionsToday(module, now),
  ]);
  const budget = evaluateBudget(
    {
      monthlyBudgetUsd: settings.monthlyBudgetUsd,
      warningThresholdUsd: settings.warningThresholdUsd,
      hardLimitUsd: settings.hardLimitUsd,
    },
    {
      monthSpentUsd: monthSpent,
      moduleDaySpentUsd: daySpent,
      moduleDailyCapUsd: config.maxDailyCostUsd,
      moduleExecutionsToday: execCount,
      moduleMaxExecutionsPerDay: config.maxExecutionsPerDay,
    },
  );
  if (!budget.allowed) return { ok: false, reason: budget.reason ?? "budget_blocked" };

  const provider = config.providerOverride ?? settings.defaultProvider;
  const model = config.modelOverride ?? settings.defaultModel;
  const startedAtMs = Date.now();
  const executionId = await startExecution({
    module,
    trigger: input.trigger,
    executionMode: config.executionMode,
    provider,
    model,
    triggeredBy: input.triggeredBy ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
  });

  try {
    const client = resolveProvider(provider);
    const completion = await client.complete({
      model,
      system: config.instructions || `You are the ${config.label} for Ghost.ma.`,
      input: { note: "foundation placeholder run" },
    });
    await recordUsage({
      module,
      provider: completion.provider,
      model: completion.model,
      tokensIn: completion.usage.tokensIn,
      tokensOut: completion.usage.tokensOut,
      costUsd: completion.usage.estimatedCostUsd,
      executionId,
    });
    await finishExecution(executionId, module, startedAtMs, {
      status: "success",
      summary: `Foundation run via ${completion.provider}/${completion.model}.`,
      estimatedTokensIn: completion.usage.tokensIn,
      estimatedTokensOut: completion.usage.tokensOut,
      estimatedCostUsd: completion.usage.estimatedCostUsd,
    });
    return {
      ok: true,
      executionId,
      summary: `Foundation run via ${completion.provider}/${completion.model}.`,
      costUsd: completion.usage.estimatedCostUsd,
    };
  } catch (error) {
    await finishExecution(executionId, module, startedAtMs, {
      status: "failure",
      error: error instanceof Error ? error.message : "run_failed",
    });
    return { ok: false, reason: "run_failed" };
  }
}
