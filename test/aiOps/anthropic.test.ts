// AI Operations — Anthropic adapter pure core: request building, response
// parsing, model-id resolution, error mapping. No network. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildAnthropicBody,
  parseAnthropicResponse,
  resolveAnthropicModel,
  mapAnthropicStatus,
  isRetryableStatus,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_MAX_TOKENS,
} from "../../src/lib/ai-ops/providers/anthropicCore";
import type { AiCompletionRequest } from "../../src/lib/ai-ops/provider";

const req = (over: Partial<AiCompletionRequest> = {}): AiCompletionRequest => ({
  model: "claude-haiku-4-5",
  system: "You are a helper.",
  input: { question: "how many orders?" },
  ...over,
});

test("model resolution accepts short, OpenRouter-style, and dotted ids", () => {
  assert.equal(resolveAnthropicModel("claude-haiku-4-5"), "claude-haiku-4-5");
  assert.equal(resolveAnthropicModel("anthropic/claude-haiku-4.5"), "claude-haiku-4-5");
  assert.equal(resolveAnthropicModel("claude-sonnet-4.5"), "claude-sonnet-4-5");
  assert.equal(resolveAnthropicModel(""), DEFAULT_ANTHROPIC_MODEL);
  assert.equal(resolveAnthropicModel(null), DEFAULT_ANTHROPIC_MODEL);
});

test("body carries system + a single user message and a required max_tokens", () => {
  const body = buildAnthropicBody(req());
  assert.equal(body.model, "claude-haiku-4-5");
  assert.equal(body.system, "You are a helper.");
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].role, "user");
  assert.ok(body.messages[0].content.includes("how many orders"));
  assert.equal(body.max_tokens, DEFAULT_MAX_TOKENS);
});

test("maxTokens is honored and truncated to an int; string input passes through", () => {
  const body = buildAnthropicBody(req({ maxTokens: 512.9, input: "plain string" }));
  assert.equal(body.max_tokens, 512);
  assert.equal(body.messages[0].content, "plain string");
});

test("response parsing concatenates text blocks and reads token usage", () => {
  const parsed = parseAnthropicResponse(req(), {
    model: "claude-haiku-4-5",
    content: [
      { type: "text", text: "Hello " },
      { type: "text", text: "world" },
      { type: "tool_use", text: "ignored" },
    ],
    usage: { input_tokens: 120, output_tokens: 30 },
  });
  assert.equal(parsed.text, "Hello world");
  assert.equal(parsed.usage.tokensIn, 120);
  assert.equal(parsed.usage.tokensOut, 30);
  // Haiku 4.5 pricing ($1/$5 per 1M): 120*1e-6 + 30*5e-6 = 0.00027
  assert.ok(parsed.usage.estimatedCostUsd > 0);
});

test("a malformed/empty response never throws and yields empty text", () => {
  const parsed = parseAnthropicResponse(req(), {});
  assert.equal(parsed.text, "");
  assert.equal(parsed.usage.tokensIn, 0);
  assert.equal(parsed.usage.tokensOut, 0);
});

test("status mapping is stable and non-identifying", () => {
  assert.equal(mapAnthropicStatus(401), "not_configured");
  assert.equal(mapAnthropicStatus(403), "not_configured");
  assert.equal(mapAnthropicStatus(429), "rate_limited");
  assert.equal(mapAnthropicStatus(504), "timeout");
  assert.equal(mapAnthropicStatus(400), "invalid_response");
  assert.equal(mapAnthropicStatus(529), "unknown");
});

test("only transient statuses are retryable", () => {
  assert.equal(isRetryableStatus(429), true);
  assert.equal(isRetryableStatus(529), true);
  assert.equal(isRetryableStatus(500), true);
  assert.equal(isRetryableStatus(501), false);
  assert.equal(isRetryableStatus(400), false);
  assert.equal(isRetryableStatus(401), false);
});
