/**
 * Bounded tool-calling loop (spec §7).
 *
 * Drives a provider that supports function/tool calls: the model may select
 * ONLY the tools its module is granted, each call is validated + executed
 * through the safe tool layer (`callTool`), and the results are fed back until
 * the model produces a final answer. Hard bounds cap the number of rounds, the
 * total tool calls, and the calls per individual tool, so a run can never loop
 * or fan out without limit. The model never runs code and never writes.
 *
 * Providers without tool-calling (the mock, or a model that just answers) end
 * the loop immediately with their text — a safe degrade.
 */

import { toolDefinitionsFor } from "./toolDefs";
import { isToolName, type AiProvider, type ToolName } from "./types";
import type { AiMessage, AiProviderClient } from "./provider";

export interface ToolLoopLimits {
  maxRounds: number;
  maxCallsPerTool: number;
  maxTotalCalls: number;
  timeoutMs: number;
}

/** Result of executing a granted tool (mirrors the safe tool layer's shape). */
export interface ToolExecResult {
  ok: boolean;
  data?: unknown;
  status?: string;
  error?: string;
}

export interface ToolLoopInput {
  client: AiProviderClient;
  model: string;
  grantedTools: ToolName[];
  /** Executes a permitted tool. The module wires this to the safe `callTool`. */
  executeTool: (call: { name: ToolName; input: unknown }) => Promise<ToolExecResult>;
  systemPrompt: string;
  question: string;
  history?: { role: "user" | "assistant"; content: string }[];
  limits: ToolLoopLimits;
}

export interface ToolLoopResult {
  text: string;
  provider: AiProvider;
  model: string;
  usage: { tokensIn: number; tokensOut: number; costUsd: number };
  rounds: number;
  toolCalls: number;
}

function safeParseArgs(raw: string): unknown {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export async function runToolLoop(input: ToolLoopInput): Promise<ToolLoopResult> {
  const { client, model, limits } = input;
  const granted = new Set<ToolName>(input.grantedTools);
  const tools = toolDefinitionsFor(input.grantedTools);

  const messages: AiMessage[] = [
    { role: "system", content: input.systemPrompt },
    ...(input.history ?? []).map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: input.question },
  ];

  const usage = { tokensIn: 0, tokensOut: 0, costUsd: 0 };
  const perTool = new Map<string, number>();
  let totalCalls = 0;
  let provider: AiProvider = client.provider;
  let resolvedModel = model;

  for (let round = 0; round < limits.maxRounds; round++) {
    const completion = await client.complete({
      model,
      system: "",
      input: null,
      messages,
      tools,
      timeoutMs: limits.timeoutMs,
    });
    usage.tokensIn += completion.usage.tokensIn;
    usage.tokensOut += completion.usage.tokensOut;
    usage.costUsd += completion.usage.estimatedCostUsd;
    provider = completion.provider;
    resolvedModel = completion.model;

    const calls = completion.toolCalls ?? [];
    if (calls.length === 0) {
      return { text: completion.text.trim(), provider, model: resolvedModel, usage, rounds: round, toolCalls: totalCalls };
    }

    // Record the assistant turn that requested the tools, then answer each call.
    messages.push({ role: "assistant", content: completion.text ?? "", toolCalls: calls });
    for (const call of calls) {
      let content: string;
      if (totalCalls >= limits.maxTotalCalls) {
        content = JSON.stringify({ error: "tool_budget_exhausted" });
      } else if (!isToolName(call.name) || !granted.has(call.name)) {
        content = JSON.stringify({ error: "tool_not_allowed", tool: call.name });
      } else if ((perTool.get(call.name) ?? 0) >= limits.maxCallsPerTool) {
        content = JSON.stringify({ error: "tool_call_limit_reached", tool: call.name });
      } else {
        perTool.set(call.name, (perTool.get(call.name) ?? 0) + 1);
        totalCalls += 1;
        const result = await input.executeTool({ name: call.name, input: safeParseArgs(call.arguments) });
        content = JSON.stringify(
          result.ok ? result.data : { error: result.status ?? "error", message: result.error },
        );
      }
      messages.push({ role: "tool", toolCallId: call.id, name: call.name, content });
    }
  }

  // Rounds exhausted: force a final answer from the data already gathered.
  const final = await client.complete({
    model,
    system: "",
    input: null,
    messages: [
      ...messages,
      {
        role: "user",
        content: "Give your final answer now from the data already gathered. Do not request more tools.",
      },
    ],
    timeoutMs: limits.timeoutMs,
  });
  usage.tokensIn += final.usage.tokensIn;
  usage.tokensOut += final.usage.tokensOut;
  usage.costUsd += final.usage.estimatedCostUsd;
  return {
    text: final.text.trim(),
    provider: final.provider,
    model: final.model,
    usage,
    rounds: limits.maxRounds,
    toolCalls: totalCalls,
  };
}
