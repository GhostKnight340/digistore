// Anthropic prompt caching — pure core: directive resolution, body building,
// response parsing, cost multipliers, deterministic tool order. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveCacheDirective,
  computeCacheCost,
  cacheWriteMultiplier,
  CACHE_READ_MULTIPLIER,
  noCacheActivity,
  hitFromUsage,
  createdFromUsage,
  minCacheableTokens,
  sortToolsCanonical,
  providerSupportsCaching,
  modelSupportsCaching,
  type CacheConfig,
} from "../../src/lib/ai-ops/caching";
import {
  buildAnthropicBody,
  parseAnthropicResponse,
  toAnthropicMessages,
} from "../../src/lib/ai-ops/providers/anthropicCore";
import { toolDefinitionsFor } from "../../src/lib/ai-ops/toolDefs";
import type { AiCompletionRequest, AiMessage } from "../../src/lib/ai-ops/provider";

const ON: CacheConfig = { enabled: true, strategy: "automatic", ttl: "5m" };
const EXPLICIT: CacheConfig = { enabled: true, strategy: "explicit_static_prefix", ttl: "5m" };
const anthropic = { provider: "anthropic", model: "claude-haiku-4-5", hasStablePrefix: true };

function req(over: Partial<AiCompletionRequest> = {}): AiCompletionRequest {
  return { model: "claude-haiku-4-5", system: "STABLE SYSTEM PROMPT", input: { note: "x" }, ...over };
}

// ── 5/6: provider + config gating ────────────────────────────────────────────

test("caching is omitted for unsupported providers (no cache_control to OpenRouter)", () => {
  const d = resolveCacheDirective(ON, { provider: "openrouter", model: "claude-haiku-4-5", hasStablePrefix: true });
  assert.equal(d.apply, false);
  assert.equal(d.apply === false && d.skipReason, "provider_unsupported");
  assert.equal(providerSupportsCaching("openrouter"), false);
  assert.equal(providerSupportsCaching("anthropic"), true);
});

test("caching is omitted when disabled", () => {
  const off = resolveCacheDirective({ enabled: false, strategy: "automatic", ttl: "5m" }, anthropic);
  assert.equal(off.apply === false && off.skipReason, "caching_disabled");
  const dis = resolveCacheDirective({ enabled: true, strategy: "disabled", ttl: "5m" }, anthropic);
  assert.equal(dis.apply === false && dis.skipReason, "caching_disabled");
});

test("a non-Claude model is treated as unsupported", () => {
  assert.equal(modelSupportsCaching("gpt-4o"), false);
  assert.equal(modelSupportsCaching("claude-haiku-4-5"), true);
  const d = resolveCacheDirective(ON, { provider: "anthropic", model: "gpt-4o", hasStablePrefix: true });
  assert.equal(d.apply === false && d.skipReason, "model_unsupported");
});

test("explicit_static_prefix needs a stable prefix (a system prompt)", () => {
  const d = resolveCacheDirective(EXPLICIT, { ...anthropic, hasStablePrefix: false });
  assert.equal(d.apply === false && d.skipReason, "no_eligible_block");
});

// ── 1/3/4: automatic top-level caching + default/1h TTL ──────────────────────

test("automatic caching sends a top-level cache_control; default TTL is 5m (no ttl field)", () => {
  const d = resolveCacheDirective(ON, anthropic);
  assert.ok(d.apply);
  const body = buildAnthropicBody(req(), d.apply ? { strategy: d.strategy, ttl: d.ttl } : null);
  assert.deepEqual(body.cache_control, { type: "ephemeral" }); // 5m default = no ttl key
  assert.equal(typeof body.system, "string"); // automatic leaves system as a plain string
});

test("the 1-hour TTL is only sent when explicitly configured", () => {
  const five = buildAnthropicBody(req(), { strategy: "automatic", ttl: "5m" });
  assert.equal((five.cache_control as { ttl?: string }).ttl, undefined);
  const hour = buildAnthropicBody(req(), { strategy: "automatic", ttl: "1h" });
  assert.deepEqual(hour.cache_control, { type: "ephemeral", ttl: "1h" });
});

// ── 2/8: explicit stable prefix + volatile suffix ────────────────────────────

test("explicit caching pins cache_control on the final stable system block", () => {
  const body = buildAnthropicBody(req({ system: "DEPARTMENT RULES" }), { strategy: "explicit_static_prefix", ttl: "5m" });
  assert.ok(Array.isArray(body.system));
  const blocks = body.system as { type: string; text: string; cache_control?: unknown }[];
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].cache_control, { type: "ephemeral" });
  assert.equal(body.cache_control, undefined); // no top-level breakpoint for explicit
});

test("a volatile timestamp/figures suffix never enters the cached prefix", () => {
  const volatile = { generatedAt: "2026-07-22T08:00:00Z", revenueMad: 1800 };
  const body = buildAnthropicBody(req({ system: "STABLE RULES", input: volatile }), {
    strategy: "explicit_static_prefix",
    ttl: "5m",
  });
  const blocks = body.system as { text: string }[];
  // The cached system block holds ONLY the stable rules — no timestamp/figures.
  assert.doesNotMatch(blocks[0].text, /2026-07-22|1800/);
  // The volatile content lives in the (uncached) user message.
  assert.match(String(body.messages[0].content), /2026-07-22/);
  assert.match(String(body.messages[0].content), /1800/);
});

test("no cache directive → a plain string system and no cache_control anywhere", () => {
  const body = buildAnthropicBody(req(), null);
  assert.equal(body.system, "STABLE SYSTEM PROMPT");
  assert.equal(body.cache_control, undefined);
});

// ── 7: deterministic tool order ──────────────────────────────────────────────

test("tool definitions are deterministically ordered regardless of grant order", () => {
  const a = toolDefinitionsFor(["getSalesSummary", "getPaymentSummary", "getOrderSummary"]);
  const b = toolDefinitionsFor(["getOrderSummary", "getSalesSummary", "getPaymentSummary"]);
  assert.deepEqual(a.map((t) => t.name), b.map((t) => t.name));
  assert.deepEqual(a.map((t) => t.name), ["getOrderSummary", "getPaymentSummary", "getSalesSummary"]);
  assert.deepEqual(sortToolsCanonical([{ name: "b" }, { name: "a" }]).map((t) => t.name), ["a", "b"]);
});

// ── 9/10/11: usage recording (cache_creation / cache_read / no activity) ─────

test("cache_creation_input_tokens is recorded correctly", () => {
  const parsed = parseAnthropicResponse(req(), {
    model: "claude-haiku-4-5",
    content: [{ type: "text", text: "hi" }],
    usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 4096, cache_read_input_tokens: 0 },
  });
  assert.equal(parsed.usage.cacheCreationTokens, 4096);
  assert.equal(parsed.usage.cacheReadTokens, 0);
  assert.equal(parsed.usage.tokensIn, 10); // input_tokens = uncached remainder
  assert.ok(createdFromUsage(parsed.usage.cacheCreationTokens));
});

test("cache_read_input_tokens is recorded correctly", () => {
  const parsed = parseAnthropicResponse(req(), {
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 4096 },
  });
  assert.equal(parsed.usage.cacheReadTokens, 4096);
  assert.ok(hitFromUsage(parsed.usage.cacheReadTokens));
});

test("both cache fields zero is 'no cache activity', not an error", () => {
  const parsed = parseAnthropicResponse(req(), { usage: { input_tokens: 50, output_tokens: 5 } });
  assert.equal(parsed.usage.cacheCreationTokens, 0);
  assert.equal(parsed.usage.cacheReadTokens, 0);
  assert.ok(noCacheActivity(parsed.usage.cacheCreationTokens, parsed.usage.cacheReadTokens));
});

// ── 12: cost multipliers ─────────────────────────────────────────────────────

test("cache cost uses the correct multipliers (5m write 1.25x, 1h write 2x, read 0.1x)", () => {
  assert.equal(cacheWriteMultiplier("5m"), 1.25);
  assert.equal(cacheWriteMultiplier("1h"), 2);
  assert.equal(CACHE_READ_MULTIPLIER, 0.1);

  // Haiku 4.5: $1 / 1M input. 1,000,000 read tokens at 0.1x = $0.10 actual,
  // vs $1.00 uncached → $0.90 saved.
  const readHeavy = computeCacheCost("claude-haiku-4-5", "5m", {
    uncachedInputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 1_000_000,
    tokensOut: 0,
  });
  assert.equal(readHeavy.actualCostUsd, 0.1);
  assert.equal(readHeavy.costWithoutCacheUsd, 1);
  assert.equal(readHeavy.savingsUsd, 0.9);

  // 1,000,000 write tokens at 1.25x = $1.25 actual vs $1.00 → NEGATIVE savings.
  const writeHeavy = computeCacheCost("claude-haiku-4-5", "5m", {
    uncachedInputTokens: 0,
    cacheCreationTokens: 1_000_000,
    cacheReadTokens: 0,
    tokensOut: 0,
  });
  assert.equal(writeHeavy.actualCostUsd, 1.25);
  assert.equal(writeHeavy.savingsUsd, -0.25);

  // 1h write premium is 2x.
  const hourWrite = computeCacheCost("claude-haiku-4-5", "1h", {
    uncachedInputTokens: 0,
    cacheCreationTokens: 1_000_000,
    cacheReadTokens: 0,
    tokensOut: 0,
  });
  assert.equal(hourWrite.actualCostUsd, 2);
});

test("Haiku 4.5's minimum cacheable prefix is 4096 tokens", () => {
  assert.equal(minCacheableTokens("claude-haiku-4-5"), 4096);
  assert.equal(minCacheableTokens("claude-sonnet-5"), 1024);
});

// ── 15: the multi-turn tool-calling path stays valid on Anthropic ────────────

test("tool-calling messages map to valid Anthropic structure (system out, tool_use/tool_result blocks)", () => {
  const history: AiMessage[] = [
    { role: "system", content: "You are the CEO assistant." },
    { role: "user", content: "How many orders yesterday?" },
    { role: "assistant", content: "Checking…", toolCalls: [{ id: "t1", name: "getSalesSummary", arguments: '{"range":{"preset":"yesterday"}}' }] },
    { role: "tool", toolCallId: "t1", name: "getSalesSummary", content: '{"ordersTotal":8}' },
  ];
  const { system, messages } = toAnthropicMessages(history);
  assert.equal(system, "You are the CEO assistant."); // system pulled OUT of messages
  assert.equal(messages.length, 3); // user, assistant(tool_use), user(tool_result)
  // Assistant turn carries a tool_use block with parsed input.
  const asst = messages[1].content as { type: string; id?: string; name?: string; input?: unknown }[];
  const toolUse = asst.find((b) => b.type === "tool_use");
  assert.ok(toolUse);
  assert.equal(toolUse!.name, "getSalesSummary");
  assert.deepEqual(toolUse!.input, { range: { preset: "yesterday" } });
  // Tool result is a tool_result block inside a USER message, paired by id.
  const res = messages[2].content as { type: string; tool_use_id?: string }[];
  assert.equal(messages[2].role, "user");
  assert.equal(res[0].type, "tool_result");
  assert.equal(res[0].tool_use_id, "t1");
});

test("automatic caching on a conversation: tools present + top-level cache_control", () => {
  const request: AiCompletionRequest = {
    model: "claude-haiku-4-5",
    system: "",
    input: null,
    messages: [
      { role: "system", content: "STABLE SYSTEM" },
      { role: "user", content: "hello" },
    ],
    tools: toolDefinitionsFor(["getSalesSummary"]),
  };
  const body = buildAnthropicBody(request, { strategy: "automatic", ttl: "5m" });
  assert.deepEqual(body.cache_control, { type: "ephemeral" }); // breakpoint moves forward as history grows
  assert.equal(body.system, "STABLE SYSTEM"); // extracted from messages
  assert.ok(body.tools && body.tools.length === 1);
  assert.equal(body.tools![0].name, "getSalesSummary");
  assert.ok("input_schema" in body.tools![0]); // Anthropic shape, not `parameters`
});

test("tool_use blocks in a response are parsed into toolCalls", () => {
  const parsed = parseAnthropicResponse(req(), {
    model: "claude-haiku-4-5",
    content: [
      { type: "text", text: "Let me check." },
      { type: "tool_use", id: "tu_1", name: "getSalesSummary", input: { range: { preset: "today" } } },
    ],
    usage: { input_tokens: 20, output_tokens: 10 },
  });
  assert.equal(parsed.text, "Let me check.");
  assert.ok(parsed.toolCalls && parsed.toolCalls.length === 1);
  assert.equal(parsed.toolCalls![0].id, "tu_1");
  assert.equal(parsed.toolCalls![0].name, "getSalesSummary");
  assert.deepEqual(JSON.parse(parsed.toolCalls![0].arguments), { range: { preset: "today" } });
});
