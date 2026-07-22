/**
 * Anthropic adapter — the PURE core (no network, no server-only).
 *
 * Calls the Anthropic Messages API (https://api.anthropic.com/v1/messages)
 * directly, so an admin can use their own Anthropic Console API key
 * (`ANTHROPIC_API_KEY`) instead of routing through OpenRouter. This module holds
 * the request builder, response parser, error normalizer, and model-id resolver
 * — all pure, so they are unit-testable without a key or a socket. The network
 * edge (fetch, timeout, retry) lives in src/lib/ai-ops/provider.ts.
 *
 * Deliberately minimal: system + a single user message, an explicit `max_tokens`
 * (required by the API), and nothing else. No `thinking`/`effort` — Haiku 4.5
 * rejects those — and no structured `response_format`; callers that need JSON
 * ask for it in the prompt and parse the text leniently (same as the assistant).
 */

import type { AiCompletionRequest, AiErrorCode, AiMessage, AiToolCall } from "../provider";
import { estimateCostUsd } from "../usage";
import type { CacheTtl } from "../caching";

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

/** Cheap, capable default when the admin selects Anthropic but no model. */
export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5";

/** The API requires max_tokens; this bounds output (and cost) when unset. */
export const DEFAULT_MAX_TOKENS = 2048;

/**
 * Resolves an incoming model id to a bare Anthropic model id. Accepts the short
 * ids this system stores (`claude-haiku-4-5`), OpenRouter-style ids
 * (`anthropic/claude-haiku-4.5`), and dotted versions (`claude-haiku-4.5`) — the
 * vendor prefix is stripped and dots in the version become dashes.
 */
export function resolveAnthropicModel(model: string | undefined | null): string {
  const m = (model ?? "").trim();
  if (!m) return DEFAULT_ANTHROPIC_MODEL;
  const bare = m.includes("/") ? m.slice(m.lastIndexOf("/") + 1) : m;
  return bare.replace(/\./g, "-");
}

/** Anthropic's cache-control marker. `ttl` omitted = the default 5-minute TTL. */
export interface AnthropicCacheControl {
  type: "ephemeral";
  ttl?: "1h";
}

/** A system prompt content block (used only when a cache breakpoint is placed). */
export interface AnthropicSystemBlock {
  type: "text";
  text: string;
  cache_control?: AnthropicCacheControl;
}

/** Message content blocks used on the multi-turn tool-calling path. */
export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

export interface AnthropicMessage {
  role: "user" | "assistant";
  /** A plain string for simple turns; blocks for tool_use / tool_result turns. */
  content: string | AnthropicContentBlock[];
}

/** A tool definition in Anthropic's shape (input_schema, not `parameters`). */
export interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  /** A plain string when uncached; a block array when a cache breakpoint is set. */
  system?: string | AnthropicSystemBlock[];
  messages: AnthropicMessage[];
  /** Tool definitions for the tool-calling loop (deterministically ordered upstream). */
  tools?: AnthropicToolDef[];
  /** Top-level automatic caching — auto-places the breakpoint on the last block. */
  cache_control?: AnthropicCacheControl;
}

/**
 * The applied cache decision handed to the body builder. `null` = do not touch
 * the body (no `cache_control` anywhere). This is Anthropic-only by construction
 * — the builder is only ever called from the Anthropic adapter.
 */
export type AppliedCache = { strategy: "automatic" | "explicit_static_prefix"; ttl: CacheTtl } | null;

/** Serializes structured input into a single user message string. */
function userContent(input: unknown): string {
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input ?? {});
  } catch {
    return "";
  }
}

function cacheControl(ttl: CacheTtl): AnthropicCacheControl {
  return ttl === "1h" ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" };
}

function safeJsonObject(raw: string): unknown {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/**
 * Maps the provider-agnostic message history (system/user/assistant/tool) to the
 * Anthropic Messages shape. Anthropic takes `system` OUT of the messages array,
 * carries assistant tool requests as `tool_use` content blocks, and requires
 * every tool result to be a `tool_result` block inside a USER message that
 * follows the assistant turn — so consecutive `tool` results are merged into a
 * single user message. Kept pure and structure-preserving so the tool-calling
 * contract (paired tool_use ↔ tool_result) stays valid.
 */
export function toAnthropicMessages(msgs: AiMessage[]): { system: string; messages: AnthropicMessage[] } {
  const systemParts: string[] = [];
  const out: AnthropicMessage[] = [];
  let pendingToolResults: AnthropicContentBlock[] | null = null;
  const flush = () => {
    if (pendingToolResults && pendingToolResults.length) out.push({ role: "user", content: pendingToolResults });
    pendingToolResults = null;
  };

  for (const m of msgs) {
    if (m.role === "system") {
      if (m.content) systemParts.push(m.content);
      continue;
    }
    if (m.role === "tool") {
      (pendingToolResults ??= []).push({ type: "tool_result", tool_use_id: m.toolCallId ?? "", content: m.content ?? "" });
      continue;
    }
    flush(); // a non-tool turn closes any open tool-result group
    if (m.role === "assistant") {
      const blocks: AnthropicContentBlock[] = [];
      if (m.content && m.content.trim()) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls ?? []) {
        blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: safeJsonObject(tc.arguments) });
      }
      out.push({ role: "assistant", content: blocks.length ? blocks : m.content ?? "" });
    } else {
      out.push({ role: "user", content: m.content ?? "" });
    }
  }
  flush();
  return { system: systemParts.join("\n\n"), messages: out };
}

/**
 * Builds the Anthropic Messages request body from a provider-agnostic request.
 * Pure. Two shapes:
 *   - single-shot (system + input) for the report modules;
 *   - multi-turn (messages + tools) for the tool-calling assistant.
 * When `cache` is set the `cache_control` breakpoint is placed per strategy:
 *   - automatic → a top-level `cache_control` (auto-places on the last block; the
 *     breakpoint moves forward as an append-only conversation grows);
 *   - explicit_static_prefix → a breakpoint on the LAST system block (the stable
 *     reusable prefix), leaving the volatile suffix after it uncached.
 * A timestamp/figures-bearing suffix is NEVER inside the cached prefix.
 */
export function buildAnthropicBody(request: AiCompletionRequest, cache: AppliedCache = null): AnthropicRequestBody {
  const maxTokens =
    typeof request.maxTokens === "number" && request.maxTokens > 0
      ? Math.trunc(request.maxTokens)
      : DEFAULT_MAX_TOKENS;

  let system: string;
  let messages: AnthropicMessage[];
  if (request.messages && request.messages.length > 0) {
    const mapped = toAnthropicMessages(request.messages);
    system = mapped.system || request.system || "";
    messages = mapped.messages;
  } else {
    system = request.system || "";
    messages = [{ role: "user", content: userContent(request.input) }];
  }

  const body: AnthropicRequestBody = {
    model: resolveAnthropicModel(request.model),
    max_tokens: maxTokens,
    messages,
  };
  if (system) {
    body.system =
      cache?.strategy === "explicit_static_prefix"
        ? [{ type: "text", text: system, cache_control: cacheControl(cache.ttl) }]
        : system;
  }
  if (cache?.strategy === "automatic") body.cache_control = cacheControl(cache.ttl);
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  }
  return body;
}

export interface ParsedCompletion {
  model: string;
  text: string;
  structured?: unknown;
  /** Tool calls the model requested this turn (from `tool_use` blocks). */
  toolCalls?: AiToolCall[];
  usage: {
    /** Uncached input tokens (Anthropic's `input_tokens` — the full-price remainder). */
    tokensIn: number;
    tokensOut: number;
    estimatedCostUsd: number;
    /** Tokens written to cache this request (0 when no cache activity). */
    cacheCreationTokens: number;
    /** Tokens served from cache this request (0 when no hit). */
    cacheReadTokens: number;
  };
}

/**
 * Shape of the fields we read from an Anthropic response. Per Anthropic
 * semantics, `input_tokens` is the UNCACHED remainder — the full prompt size is
 * `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`.
 */
interface AnthropicResponse {
  model?: string;
  content?: { type?: string; text?: string; id?: string; name?: string; input?: unknown }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/**
 * Parses an Anthropic response into the provider-agnostic result. Pure. The
 * Messages API returns no cost, so cost is always the local estimate. Text is
 * the concatenation of every `text` content block. Cache token counts are read
 * verbatim from `usage` — both zero means "no cache activity", not an error.
 * The estimate here is the simple per-token cost over the uncached remainder;
 * when caching applied, the adapter recomputes it cache-aware (it knows the TTL).
 */
export function parseAnthropicResponse(request: AiCompletionRequest, json: unknown): ParsedCompletion {
  const res = (json ?? {}) as AnthropicResponse;
  const model = res.model ?? resolveAnthropicModel(request.model);
  const blocks = Array.isArray(res.content) ? res.content : [];
  const text = blocks
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
  // Tool requests arrive as `tool_use` blocks; serialize input back to a JSON
  // string so the tool loop's provider-agnostic contract is unchanged.
  const toolCalls: AiToolCall[] = [];
  for (const b of blocks) {
    if (b?.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string") {
      toolCalls.push({ id: b.id, name: b.name, arguments: JSON.stringify(b.input ?? {}) });
    }
  }
  const tokensIn = Math.max(0, res.usage?.input_tokens ?? 0);
  const tokensOut = Math.max(0, res.usage?.output_tokens ?? 0);
  const cacheCreationTokens = Math.max(0, res.usage?.cache_creation_input_tokens ?? 0);
  const cacheReadTokens = Math.max(0, res.usage?.cache_read_input_tokens ?? 0);
  return {
    model,
    text,
    structured: undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: {
      tokensIn,
      tokensOut,
      estimatedCostUsd: estimateCostUsd(model, tokensIn, tokensOut),
      cacheCreationTokens,
      cacheReadTokens,
    },
  };
}

/** Maps an HTTP status to a stable, non-identifying AiErrorCode. Pure. */
export function mapAnthropicStatus(status: number): AiErrorCode {
  if (status === 401 || status === 403) return "not_configured";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unknown";
  if (status === 400 || status === 422 || status === 413) return "invalid_response";
  return "unknown";
}

/** Whether an HTTP status is worth retrying (transient). Pure. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status !== 501);
}
