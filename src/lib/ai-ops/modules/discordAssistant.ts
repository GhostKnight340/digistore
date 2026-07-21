/**
 * Discord CEO Assistant — the first functional AI module (spec §6).
 *
 * Answers natural-language business questions (English or French) asked in
 * Discord. It NEVER touches Prisma: every figure comes from the safe tool layer
 * (`callTool`), and the wording comes from the configured AI provider resolved
 * by the guardrail runner (never a hardcoded provider/model). All the standard
 * guardrails — global switch, module-enabled, permissions, rate limits, budget,
 * execution + usage logging — are inherited by running through `runModule`.
 *
 * Approach: for each granted read-only tool we fetch a compact "today" snapshot
 * once, hand it to the model as grounding data, and ask it to answer strictly
 * from that data. This is deterministic and model-agnostic (no reliance on
 * provider-specific function-calling), and every fetch is a logged, permissioned
 * `callTool`. A metric whose tool was unavailable is passed through as such so
 * the model can say the data is missing instead of inventing a number.
 */

import "server-only";

import { callTool } from "../tools/service";
import { runModule, type ModuleRunContext, type ModuleRunOutput } from "../runner";
import { buildSystemPrompt } from "../discord/assistantPrompt";
import { runToolLoop, type ToolLoopLimits } from "../toolLoop";
import type { ConvTurn } from "../discord/conversationBuffer";

export const DISCORD_ASSISTANT_MODULE = "discord_assistant" as const;

/** Per-tool call cap is a fixed guardrail; the rest come from settings (spec §10). */
const MAX_CALLS_PER_TOOL = 3;
const BACKOFF_MS = 500;

/** Build the loop bounds from AI Operations settings so they change without a deploy. */
function loopLimits(ctx: ModuleRunContext): ToolLoopLimits {
  return {
    maxRounds: ctx.settings.maxToolRounds,
    maxCallsPerTool: MAX_CALLS_PER_TOOL,
    maxTotalCalls: ctx.settings.maxToolCallsPerExecution,
    timeoutMs: ctx.settings.providerTimeoutMs,
    maxRetries: ctx.settings.providerMaxRetries,
    backoffMs: BACKOFF_MS,
  };
}

export interface AssistantAnswer {
  ok: true;
  answer: string;
  executionId: string | null;
  costUsd: number;
}
export interface AssistantFailure {
  ok: false;
  reason: string;
}
export type AssistantResult = AssistantAnswer | AssistantFailure;

export interface AnswerInput {
  question: string;
  /** Prior turns in this Discord thread (already scoped to one thread/user). */
  history?: ConvTurn[];
  /** Discord user id for audit (stored as the execution's triggeredBy). */
  discordUserId?: string | null;
}

/**
 * The module body handed to the runner (guardrails wrap this). It runs the
 * bounded tool-calling loop: the model selects the granted safe tools it needs
 * (including several for comparison questions), each executed via `callTool`,
 * and answers strictly from the results.
 */
async function assistantBody(input: AnswerInput, ctx: ModuleRunContext): Promise<ModuleRunOutput> {
  const result = await runToolLoop({
    client: ctx.client,
    model: ctx.model,
    grantedTools: ctx.config.grantedTools,
    // Every tool the model picks is executed through the safe tool layer, which
    // re-checks permission, validates input, rate-limits, redacts, and logs.
    executeTool: ({ name, input: toolInput }) =>
      callTool({ module: DISCORD_ASSISTANT_MODULE, tool: name, input: toolInput, executionId: ctx.executionId }),
    systemPrompt: buildSystemPrompt(ctx.config.instructions),
    question: input.question,
    history: input.history,
    limits: loopLimits(ctx),
  });
  return {
    provider: result.provider,
    model: result.model,
    summary: `CEO assistant answered via ${result.provider}/${result.model} (${result.toolCalls} tool call(s)).`,
    text: result.text,
    usage: result.usage,
  };
}

/**
 * Answer a business question from Discord. Runs the whole thing through the
 * guarded runner, so a disabled module / blown budget / disabled global switch
 * returns a typed failure (never an exception, never a hallucinated number).
 */
export async function answerBusinessQuestion(input: AnswerInput): Promise<AssistantResult> {
  const question = (input.question ?? "").trim();
  if (!question) return { ok: false, reason: "empty_question" };

  const result = await runModule({
    module: DISCORD_ASSISTANT_MODULE,
    trigger: "discord",
    triggeredBy: input.discordUserId ?? null,
    body: (ctx) => assistantBody(input, ctx),
  });

  if (!result.ok) return { ok: false, reason: result.reason };
  const answer = result.text.trim();
  if (!answer) return { ok: false, reason: "empty_answer" };
  return { ok: true, answer, executionId: result.executionId, costUsd: result.costUsd };
}
