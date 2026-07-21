// AI Operations — usage/cost estimates and failure-safe logging (spec §9).
// Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { estimateCostUsd, estimateTokens, priceFor } from "../../src/lib/ai-ops/usage";
import { redactForAiContext, findLeakedSensitiveKeys } from "../../src/lib/ai-ops/redaction";

test("token estimate is ~chars/4 and never negative", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.ok(estimateTokens("a".repeat(400)) === 100);
});

test("cost estimate uses the model price table", () => {
  const cost = estimateCostUsd("claude-haiku-4-5", 1_000_000, 1_000_000);
  const p = priceFor("claude-haiku-4-5");
  assert.equal(cost, p.inPerMTok + p.outPerMTok);
});

test("mock/disabled providers cost nothing", () => {
  assert.equal(estimateCostUsd("mock", 1_000_000, 1_000_000), 0);
  assert.equal(estimateCostUsd("disabled", 5_000, 5_000), 0);
});

test("unknown model falls back to a conservative non-zero price", () => {
  assert.ok(estimateCostUsd("some-future-model", 1_000_000, 0) > 0);
});

test("cost is never negative even with bad inputs", () => {
  assert.equal(estimateCostUsd("claude-sonnet-5", -5, -5), 0);
});

test("a failure log context with secrets is fully redacted before it could be written", () => {
  // Simulates the shape a careless caller might try to log on failure.
  const failureContext = {
    operation: "ai.support_assistant.execute",
    error: "provider rejected",
    request: { authorization: "Bearer sk-123", customerEmail: "x@y.com", note: "keep" },
  };
  const safe = redactForAiContext(failureContext);
  assert.deepEqual(findLeakedSensitiveKeys(safe), []);
  // Non-sensitive fields survive so the log is still useful.
  assert.equal((safe as { operation: string }).operation, "ai.support_assistant.execute");
});
