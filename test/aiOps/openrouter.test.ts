// AI Operations — OpenRouter adapter pure core: request building, response
// parsing, model-id resolution, and error mapping. No network. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildOpenRouterBody,
  parseOpenRouterResponse,
  resolveOpenRouterModel,
  mapOpenRouterStatus,
  isRetryableStatus,
  DEFAULT_OPENROUTER_MODEL,
} from "../../src/lib/ai-ops/providers/openrouterCore";
import type { AiCompletionRequest } from "../../src/lib/ai-ops/provider";

const req = (over: Partial<AiCompletionRequest> = {}): AiCompletionRequest => ({
  model: "claude-haiku-4-5",
  system: "You are a helper.",
  input: { question: "how many orders?" },
  ...over,
});

test("short model ids are mapped to OpenRouter ids; namespaced ids pass through", () => {
  assert.equal(resolveOpenRouterModel("claude-haiku-4-5"), "anthropic/claude-haiku-4.5");
  assert.equal(resolveOpenRouterModel("openai/gpt-4o-mini"), "openai/gpt-4o-mini");
  assert.equal(resolveOpenRouterModel(""), DEFAULT_OPENROUTER_MODEL);
  assert.equal(resolveOpenRouterModel(null), DEFAULT_OPENROUTER_MODEL);
});

test("body has system+user messages and requests cost accounting", () => {
  const body = buildOpenRouterBody(req());
  assert.equal(body.model, "anthropic/claude-haiku-4.5");
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[1].role, "user");
  assert.ok(body.messages[1].content.includes("how many orders"));
  assert.deepEqual(body.usage, { include: true });
  assert.equal(body.response_format, undefined);
});

test("a responseSchema request adds a json_schema response_format", () => {
  const body = buildOpenRouterBody(req({ responseSchema: { type: "object" } }));
  assert.equal(body.response_format?.type, "json_schema");
  assert.equal(body.response_format?.json_schema.strict, true);
});

test("tool definitions are mapped to OpenAI-style function tools", () => {
  const body = buildOpenRouterBody(
    req({ tools: [{ name: "getSalesSummary", description: "sales", parameters: { type: "object" } }] }),
  );
  assert.equal(body.tools?.[0].type, "function");
  assert.equal(body.tools?.[0].function.name, "getSalesSummary");
});

test("parses text + token usage, preferring OpenRouter's reported cost", () => {
  const parsed = parseOpenRouterResponse(req(), {
    model: "anthropic/claude-haiku-4.5",
    choices: [{ message: { content: "42 orders" } }],
    usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.00042 },
  });
  assert.equal(parsed.text, "42 orders");
  assert.equal(parsed.usage.tokensIn, 100);
  assert.equal(parsed.usage.tokensOut, 20);
  assert.equal(parsed.usage.estimatedCostUsd, 0.00042);
});

test("falls back to the local cost estimate when OpenRouter omits cost", () => {
  const parsed = parseOpenRouterResponse(req(), {
    model: "anthropic/claude-haiku-4.5",
    choices: [{ message: { content: "hi" } }],
    usage: { prompt_tokens: 1_000_000, completion_tokens: 0 },
  });
  // 1M input tokens at $1/Mtok for haiku = $1.
  assert.equal(parsed.usage.estimatedCostUsd, 1);
});

test("structured requests parse JSON content into `structured` and blank the text", () => {
  const parsed = parseOpenRouterResponse(req({ responseSchema: { type: "object" } }), {
    choices: [{ message: { content: '{"orders":42}' } }],
    usage: { prompt_tokens: 5, completion_tokens: 5 },
  });
  assert.equal(parsed.text, "");
  assert.deepEqual(parsed.structured, { orders: 42 });
});

test("a malformed structured response does not throw", () => {
  const parsed = parseOpenRouterResponse(req({ responseSchema: { type: "object" } }), {
    choices: [{ message: { content: "not json" } }],
  });
  assert.equal(parsed.structured, undefined);
  assert.equal(parsed.usage.tokensIn, 0);
});

test("HTTP statuses map to stable error codes", () => {
  assert.equal(mapOpenRouterStatus(401), "not_configured");
  assert.equal(mapOpenRouterStatus(403), "not_configured");
  assert.equal(mapOpenRouterStatus(429), "rate_limited");
  assert.equal(mapOpenRouterStatus(504), "timeout");
  assert.equal(mapOpenRouterStatus(400), "invalid_response");
  assert.equal(mapOpenRouterStatus(500), "unknown");
});

test("only transient statuses are retryable", () => {
  assert.equal(isRetryableStatus(429), true);
  assert.equal(isRetryableStatus(500), true);
  assert.equal(isRetryableStatus(401), false);
  assert.equal(isRetryableStatus(400), false);
});
