/**
 * Reusable module-execution harness.
 *
 * The one place a module "runs": it wires the guardrails (global switch, module
 * enabled, budget) around an execution record and a provider call, and records
 * usage. A caller may supply a real `body` (the module's actual logic — gather
 * data via the safe tool layer, call the provider, return an answer); when it
 * doesn't, the harness performs the mock placeholder run the foundation shipped
 * with. Either way the guardrails (budget gate, execution log, usage accounting,
 * idempotency) are identical and centralized here.
 */

import "server-only";

import { getAiOpsSettings, getModuleConfig, type AiModuleConfigDTO, type AiOpsSettingsDTO } from "./store";
import {
  finishExecution,
  moduleDaySpendUsd,
  moduleExecutionsToday,
  monthSpendUsd,
  recordUsage,
  startExecution,
} from "./executions";
import { evaluateBudget } from "./budget";
import { AiProviderError, resolveProvider, type AiProviderClient } from "./provider";
import { isModuleKey, type ExecutionTrigger, type ModuleKey } from "./types";

/**
 * What a module body receives: the resolved config/settings, the provider client
 * and model chosen by the guardrails (never hardcoded), and the open execution
 * id so tool calls can be correlated to this run.
 */
export interface ModuleRunContext {
  module: ModuleKey;
  config: AiModuleConfigDTO;
  settings: AiOpsSettingsDTO;
  provider: string;
  model: string;
  executionId: string | null;
  client: AiProviderClient;
}

/** What a module body returns: the answer text, a short summary, and usage. */
export interface ModuleRunOutput {
  provider: string;
  model: string;
  summary: string;
  text: string;
  usage: { tokensIn: number; tokensOut: number; costUsd: number };
}

export type ModuleBody = (ctx: ModuleRunContext) => Promise<ModuleRunOutput>;

export interface RunModuleInput {
  module: string;
  trigger: ExecutionTrigger;
  triggeredBy?: string | null;
  idempotencyKey?: string | null;
  /** The module's real logic. Omitted → the foundation placeholder run. */
  body?: ModuleBody;
}

export type RunModuleResult =
  | { ok: true; executionId: string | null; summary: string; text: string; costUsd: number }
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
    const runCtx: ModuleRunContext = { module, config, settings, provider, model, executionId, client };
    const output = input.body ? await input.body(runCtx) : await placeholderRun(runCtx);
    await recordUsage({
      module,
      provider: output.provider,
      model: output.model,
      tokensIn: output.usage.tokensIn,
      tokensOut: output.usage.tokensOut,
      costUsd: output.usage.costUsd,
      executionId,
    });
    await finishExecution(executionId, module, startedAtMs, {
      status: "success",
      summary: output.summary,
      estimatedTokensIn: output.usage.tokensIn,
      estimatedTokensOut: output.usage.tokensOut,
      estimatedCostUsd: output.usage.costUsd,
    });
    return {
      ok: true,
      executionId,
      summary: output.summary,
      text: output.text,
      costUsd: output.usage.costUsd,
    };
  } catch (error) {
    // Surface the provider's normalized error category (never the key/message
    // body) so the caller can show a useful, specific reply.
    const reason = error instanceof AiProviderError ? `provider_${error.code}` : "run_failed";
    await finishExecution(executionId, module, startedAtMs, {
      status: "failure",
      error: error instanceof Error ? error.message : "run_failed",
    });
    return { ok: false, reason };
  }
}

/**
 * The foundation's placeholder run — a single mock/real provider call with fixed
 * input, used whenever a caller doesn't supply a real `body`. Kept so scheduled
 * modules that aren't implemented yet still exercise the full guardrail path.
 */
async function placeholderRun(ctx: ModuleRunContext): Promise<ModuleRunOutput> {
  const completion = await ctx.client.complete({
    model: ctx.model,
    system: ctx.config.instructions || `You are the ${ctx.config.label} for Ghost.ma.`,
    input: { note: "foundation placeholder run" },
  });
  return {
    provider: completion.provider,
    model: completion.model,
    summary: `Foundation run via ${completion.provider}/${completion.model}.`,
    text: completion.text,
    usage: {
      tokensIn: completion.usage.tokensIn,
      tokensOut: completion.usage.tokensOut,
      costUsd: completion.usage.estimatedCostUsd,
    },
  };
}
