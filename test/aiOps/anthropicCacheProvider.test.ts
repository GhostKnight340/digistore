// Anthropic adapter — prompt-cache application + safe uncached fallback.
// Integration test with a mocked fetch (no network, no key). Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveProvider, type AiCompletionRequest } from "../../src/lib/ai-ops/provider";

// resolveProvider reads the key from env at call time; a dummy key selects the
// real AnthropicProvider (fetch is mocked, so the key is never used on a socket).
process.env.ANTHROPIC_API_KEY = "sk-test-not-real";

const baseReq: AiCompletionRequest = {
  model: "claude-haiku-4-5",
  system: "STABLE SYSTEM PROMPT",
  input: { generatedAt: "2026-07-22T08:00:00Z", revenueMad: 1800 },
  cache: { enabled: true, strategy: "explicit_static_prefix", ttl: "5m" },
};

function mockFetch(handler: (url: string, body: Record<string, unknown>) => { status: number; json: unknown }) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}");
    calls.push({ url: String(url), body });
    const { status, json } = handler(String(url), body);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => json,
      headers: { get: () => null },
    } as unknown as Response;
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("applies explicit cache_control and records the cache hit", async () => {
  const { calls, restore } = mockFetch(() => ({
    status: 200,
    json: {
      model: "claude-haiku-4-5",
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 12, output_tokens: 8, cache_read_input_tokens: 4096 },
    },
  }));
  try {
    const client = resolveProvider("anthropic");
    const result = await client.complete(baseReq);
    // The request carried a cached system block; the volatile figures stayed out.
    assert.ok(Array.isArray(calls[0].body.system));
    assert.equal((calls[0].body.system as { cache_control?: unknown }[])[0].cache_control !== undefined, true);
    // The outcome reflects a genuine hit, not merely "enabled".
    assert.equal(result.cache?.applied, true);
    assert.equal(result.cache?.hit, true);
    assert.equal(result.cache?.created, false);
    assert.equal(result.cache?.cacheReadTokens, 4096);
    assert.equal(result.usage.cacheReadTokens, 4096);
  } finally {
    restore();
  }
});

test("a cache-config rejection (400) retries ONCE without cache_control — no duplicated side effects", async () => {
  let n = 0;
  const { calls, restore } = mockFetch((_url, body) => {
    n += 1;
    // First (cached) attempt 400s; the uncached retry succeeds.
    const cached = Array.isArray(body.system) || body.cache_control !== undefined;
    if (cached) return { status: 400, json: { error: "bad cache" } };
    return {
      status: 200,
      json: {
        model: "claude-haiku-4-5",
        content: [{ type: "text", text: "ok uncached" }],
        usage: { input_tokens: 60, output_tokens: 8 },
      },
    };
  });
  try {
    const client = resolveProvider("anthropic");
    const result = await client.complete(baseReq);
    // Exactly two calls: one cached (rejected) + one uncached retry. Both are
    // completion calls to the Messages API — the provider never executes tools,
    // so a fallback cannot replay a side-effecting tool.
    assert.equal(n, 2);
    assert.equal(calls.length, 2);
    assert.ok(Array.isArray(calls[0].body.system)); // first: cached
    assert.equal(typeof calls[1].body.system, "string"); // second: uncached
    assert.equal(calls[1].body.cache_control, undefined);
    assert.match(calls[0].url, /api\.anthropic\.com/);
    assert.match(calls[1].url, /api\.anthropic\.com/);
    // Outcome records the uncached fallback clearly.
    assert.equal(result.text, "ok uncached");
    assert.equal(result.cache?.applied, false);
    assert.ok(result.cache?.fallbackReason);
    assert.equal(result.cache?.skipReason, "retried_uncached");
  } finally {
    restore();
  }
});

test("caching is never applied for a non-Anthropic model on the Anthropic adapter", async () => {
  const { calls, restore } = mockFetch(() => ({
    status: 200,
    json: { model: "gpt-4o", content: [{ type: "text", text: "x" }], usage: { input_tokens: 5, output_tokens: 2 } },
  }));
  try {
    const client = resolveProvider("anthropic");
    const result = await client.complete({ ...baseReq, model: "gpt-4o" });
    assert.equal(calls[0].body.cache_control, undefined);
    assert.equal(typeof calls[0].body.system, "string"); // no cache block
    assert.equal(result.cache?.applied, false);
    assert.equal(result.cache?.skipReason, "model_unsupported");
  } finally {
    restore();
  }
});
