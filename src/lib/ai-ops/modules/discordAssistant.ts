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
import { buildSystemPrompt, SNAPSHOT_TOOLS } from "../discord/assistantPrompt";
import type { ConversationTurn } from "../discord/conversation";
import type { ToolName } from "../types";

export const DISCORD_ASSISTANT_MODULE = "discord_assistant" as const;

/**
 * Safe input for a snapshot tool. Interim: the fixed "today" snapshot uses the
 * date-range tools scoped to today; the tool-calling loop (next phase) lets the
 * model pick the range per question.
 */
function toolInput(tool: ToolName): unknown {
  const range = { range: { preset: "today" as const } };
  switch (tool) {
    case "getSalesSummary":
    case "getOrderSummary":
    case "getPaymentSummary":
    case "getFulfillmentPerformance":
    case "getCustomerMetrics":
      return range;
    case "getProductPerformance":
      return { ...range, limit: 10 };
    case "getRecentOperationalEvents":
      return { limit: 15 };
    default:
      return {};
  }
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
  history?: ConversationTurn[];
  /** Discord user id for audit (stored as the execution's triggeredBy). */
  discordUserId?: string | null;
}

/**
 * Gather the snapshot through the safe tool layer. Only granted tools are pulled
 * (permissions are also re-checked inside `callTool`); a failed/denied tool is
 * recorded as unavailable rather than aborting the whole answer.
 */
async function gatherSnapshot(ctx: ModuleRunContext): Promise<Record<string, unknown>> {
  const granted = new Set<string>(ctx.config.grantedTools);
  const snapshot: Record<string, unknown> = {};
  for (const { tool, label } of SNAPSHOT_TOOLS) {
    if (!granted.has(tool)) continue; // respect the permission model
    const result = await callTool({
      module: DISCORD_ASSISTANT_MODULE,
      tool,
      input: toolInput(tool),
      executionId: ctx.executionId,
    });
    snapshot[label] = result.ok ? result.data : { unavailable: true, reason: result.status };
  }
  return snapshot;
}

/** The module body handed to the runner (guardrails wrap this). */
async function assistantBody(input: AnswerInput, ctx: ModuleRunContext): Promise<ModuleRunOutput> {
  const businessData = await gatherSnapshot(ctx);
  const completion = await ctx.client.complete({
    model: ctx.model,
    system: buildSystemPrompt(ctx.config.instructions),
    input: {
      question: input.question,
      conversation: input.history ?? [],
      businessData,
      dataScope: "today",
    },
    timeoutMs: 30_000,
  });
  const answer = completion.text.trim();
  return {
    provider: completion.provider,
    model: completion.model,
    summary: `CEO assistant answered via ${completion.provider}/${completion.model}.`,
    text: answer,
    usage: {
      tokensIn: completion.usage.tokensIn,
      tokensOut: completion.usage.tokensOut,
      costUsd: completion.usage.estimatedCostUsd,
    },
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
