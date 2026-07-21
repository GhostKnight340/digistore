// AI Operations — bounded tool-calling loop (spec §7). Fake provider + fake
// tool executor, no DB. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { runToolLoop, type ToolLoopInput } from "../../src/lib/ai-ops/toolLoop";
import type { AiCompletionResult, AiProviderClient } from "../../src/lib/ai-ops/provider";
import type { ToolName } from "../../src/lib/ai-ops/types";

const GRANTS: ToolName[] = ["getSalesSummary", "getOrderSummary"];
const LIMITS = { maxRounds: 3, maxCallsPerTool: 2, maxTotalCalls: 4, timeoutMs: 1000 };

const usage = { tokensIn: 1, tokensOut: 1, estimatedCostUsd: 0 };
function textResult(text: string): AiCompletionResult {
  return { provider: "openrouter", model: "m", text, usage };
}
function callsResult(calls: { id: string; name: string; arguments?: string }[]): AiCompletionResult {
  return {
    provider: "openrouter",
    model: "m",
    text: "",
    toolCalls: calls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments ?? "{}" })),
    usage,
  };
}

/** A provider whose completions are scripted; the last entry repeats. */
function fakeClient(script: AiCompletionResult[]): AiProviderClient {
  let i = 0;
  return {
    provider: "openrouter",
    async complete() {
      const r = script[Math.min(i, script.length - 1)];
      i += 1;
      return r;
    },
  };
}

function baseInput(over: Partial<ToolLoopInput>): ToolLoopInput {
  return {
    client: fakeClient([textResult("done")]),
    model: "m",
    grantedTools: GRANTS,
    executeTool: async () => ({ ok: true, data: { value: 1 } }),
    systemPrompt: "sys",
    question: "q",
    limits: LIMITS,
    ...over,
  };
}

test("a final text answer with no tool calls ends the loop immediately", async () => {
  const r = await runToolLoop(baseInput({ client: fakeClient([textResult("42 MAD")]) }));
  assert.equal(r.text, "42 MAD");
  assert.equal(r.toolCalls, 0);
  assert.equal(r.rounds, 0);
});

test("the model can call multiple tools in a round (comparison)", async () => {
  const executed: { name: ToolName; input: unknown }[] = [];
  const r = await runToolLoop({
    ...baseInput({}),
    client: fakeClient([
      callsResult([
        { id: "1", name: "getSalesSummary", arguments: '{"range":{"preset":"today"}}' },
        { id: "2", name: "getSalesSummary", arguments: '{"range":{"preset":"yesterday"}}' },
      ]),
      textResult("today vs yesterday"),
    ]),
    executeTool: async (c) => {
      executed.push(c);
      return { ok: true, data: { revenueMad: 10 } };
    },
  });
  assert.equal(executed.length, 2, "both tool calls executed");
  assert.equal(r.toolCalls, 2);
  assert.equal(r.text, "today vs yesterday");
});

test("unknown tools are rejected — never executed", async () => {
  const executed: string[] = [];
  await runToolLoop({
    ...baseInput({}),
    client: fakeClient([
      callsResult([{ id: "1", name: "dropAllTables" }]),
      textResult("ok"),
    ]),
    executeTool: async (c) => {
      executed.push(c.name);
      return { ok: true, data: {} };
    },
  });
  assert.deepEqual(executed, [], "unknown tool must not reach the executor");
});

test("non-granted (but real) tools are rejected", async () => {
  const executed: string[] = [];
  await runToolLoop({
    ...baseInput({}),
    grantedTools: ["getSalesSummary"], // getPaymentSummary NOT granted
    client: fakeClient([
      callsResult([{ id: "1", name: "getPaymentSummary" }]),
      textResult("ok"),
    ]),
    executeTool: async (c) => {
      executed.push(c.name);
      return { ok: true, data: {} };
    },
  });
  assert.deepEqual(executed, [], "non-granted tool must not be executed");
});

test("per-tool call cap is enforced within a round", async () => {
  let count = 0;
  await runToolLoop({
    ...baseInput({}),
    client: fakeClient([
      callsResult([
        { id: "1", name: "getSalesSummary" },
        { id: "2", name: "getSalesSummary" },
        { id: "3", name: "getSalesSummary" }, // exceeds maxCallsPerTool=2
      ]),
      textResult("ok"),
    ]),
    executeTool: async () => {
      count += 1;
      return { ok: true, data: {} };
    },
  });
  assert.equal(count, LIMITS.maxCallsPerTool, "no more than maxCallsPerTool executions");
});

test("the loop is bounded: endless tool requests hit maxRounds then force a final answer", async () => {
  let completeCalls = 0;
  const client: AiProviderClient = {
    provider: "openrouter",
    async complete() {
      completeCalls += 1;
      // Always request a tool → never a natural final answer.
      if (completeCalls <= LIMITS.maxRounds) {
        return callsResult([{ id: String(completeCalls), name: "getSalesSummary" }]);
      }
      return textResult("forced final");
    },
  };
  const r = await runToolLoop({ ...baseInput({}), client });
  assert.equal(r.rounds, LIMITS.maxRounds);
  assert.equal(r.text, "forced final");
  // maxRounds loop iterations + 1 forced-final call.
  assert.equal(completeCalls, LIMITS.maxRounds + 1);
});
