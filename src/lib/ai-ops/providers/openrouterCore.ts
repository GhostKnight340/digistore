/**
 * OpenRouter adapter — the PURE core (no network, no server-only).
 *
 * OpenRouter (https://openrouter.ai) exposes an OpenAI-compatible chat
 * completions API in front of many models, so one adapter gives the whole AI
 * Operations system real completions. This module holds the request builder,
 * the response parser, the error normalizer, and the model-id resolver — all
 * pure, so they are unit-testable without a key or a socket. The network edge
 * (fetch, timeout, retry) lives in src/lib/ai-ops/provider.ts.
 */

import type { AiCompletionRequest, AiErrorCode, AiMessage, AiToolCall } from "../provider";
import { estimateCostUsd } from "../usage";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** A sensible cheap default when the admin picks OpenRouter but no model. */
export const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-haiku-4.5";

/**
 * Best-effort aliases from this system's short model ids to OpenRouter's
 * namespaced ids. A model id that already looks namespaced ("vendor/model")
 * passes through untouched, so an admin can always type a fully-qualified id.
 */
const MODEL_ALIASES: Record<string, string> = {
  "claude-haiku-4-5": "anthropic/claude-haiku-4.5",
  "claude-sonnet-5": "anthropic/claude-sonnet-4.5",
  "claude-opus-4-8": "anthropic/claude-opus-4.1",
};

/** Resolves an incoming model id to an OpenRouter model id. */
export function resolveOpenRouterModel(model: string | undefined | null): string {
  const m = (model ?? "").trim();
  if (!m) return DEFAULT_OPENROUTER_MODEL;
  if (m.includes("/")) return m; // already an OpenRouter-style id
  return MODEL_ALIASES[m] ?? m;
}

export interface OpenRouterToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OpenRouterToolCall[];
  tool_call_id?: string;
  name?: string;
}

/** Map provider-agnostic messages to OpenAI-compatible OpenRouter messages. */
export function toOpenRouterMessages(messages: AiMessage[]): OpenRouterMessage[] {
  return messages.map((m) => {
    const out: OpenRouterMessage = { role: m.role, content: m.content ?? "" };
    if (m.toolCalls && m.toolCalls.length > 0) {
      out.tool_calls = m.toolCalls.map((t) => ({
        id: t.id,
        type: "function",
        function: { name: t.name, arguments: t.arguments },
      }));
    }
    if (m.toolCallId) out.tool_call_id = m.toolCallId;
    if (m.name) out.name = m.name;
    return out;
  });
}

export interface OpenRouterRequestBody {
  model: string;
  messages: OpenRouterMessage[];
  response_format?: {
    type: "json_schema";
    json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
  };
  tools?: { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }[];
  /** Optional ceiling on generated tokens. */
  max_tokens?: number;
  /** Ask OpenRouter to include real cost/usage accounting in the response. */
  usage: { include: true };
}

/** Serializes structured input into a single user message string. */
function userContent(input: unknown): string {
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input ?? {});
  } catch {
    return "";
  }
}

/** Builds the OpenAI-compatible request body from a provider-agnostic request. Pure. */
export function buildOpenRouterBody(request: AiCompletionRequest): OpenRouterRequestBody {
  // A multi-turn tool-calling loop supplies the full message history; otherwise
  // build the simple system + user pair from system/input.
  const messages =
    request.messages && request.messages.length > 0
      ? toOpenRouterMessages(request.messages)
      : [
          { role: "system" as const, content: request.system },
          { role: "user" as const, content: userContent(request.input) },
        ];
  const body: OpenRouterRequestBody = {
    model: resolveOpenRouterModel(request.model),
    messages,
    usage: { include: true },
  };
  if (typeof request.maxTokens === "number" && request.maxTokens > 0) {
    body.max_tokens = Math.trunc(request.maxTokens);
  }
  if (request.responseSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "result", strict: true, schema: request.responseSchema },
    };
  }
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }
  return body;
}

export interface ParsedCompletion {
  model: string;
  text: string;
  structured?: unknown;
  toolCalls?: AiToolCall[];
  usage: { tokensIn: number; tokensOut: number; estimatedCostUsd: number };
}

/** Shape of the fields we read from an OpenRouter response. */
interface OpenRouterResponse {
  model?: string;
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
}

/** Extract validated tool calls from a response message (skips malformed ones). */
function parseToolCalls(raw: unknown): AiToolCall[] {
  if (!Array.isArray(raw)) return [];
  const calls: AiToolCall[] = [];
  for (const tc of raw as { id?: unknown; function?: { name?: unknown; arguments?: unknown } }[]) {
    const id = typeof tc?.id === "string" ? tc.id : "";
    const name = typeof tc?.function?.name === "string" ? tc.function.name : "";
    const args = typeof tc?.function?.arguments === "string" ? tc.function.arguments : "{}";
    if (id && name) calls.push({ id, name, arguments: args });
  }
  return calls;
}

/**
 * Parses an OpenRouter JSON response into the provider-agnostic result. Pure.
 * Prefers OpenRouter's own reported `usage.cost`; falls back to the local
 * estimate. When a structured schema was requested, parses the JSON content.
 */
export function parseOpenRouterResponse(
  request: AiCompletionRequest,
  json: unknown,
): ParsedCompletion {
  const res = (json ?? {}) as OpenRouterResponse;
  const model = res.model ?? resolveOpenRouterModel(request.model);
  const message = res.choices?.[0]?.message;
  const text = message?.content ?? "";
  const toolCalls = parseToolCalls(message?.tool_calls);
  const tokensIn = Math.max(0, res.usage?.prompt_tokens ?? 0);
  const tokensOut = Math.max(0, res.usage?.completion_tokens ?? 0);
  const reportedCost = typeof res.usage?.cost === "number" ? res.usage.cost : null;
  const estimatedCostUsd = reportedCost != null ? reportedCost : estimateCostUsd(model, tokensIn, tokensOut);

  let structured: unknown;
  if (request.responseSchema && text) {
    try {
      structured = JSON.parse(text);
    } catch {
      structured = undefined;
    }
  }
  return {
    model,
    text: request.responseSchema ? "" : text,
    structured,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: { tokensIn, tokensOut, estimatedCostUsd },
  };
}

/** Maps an HTTP status to a stable, non-identifying AiErrorCode. Pure. */
export function mapOpenRouterStatus(status: number): AiErrorCode {
  if (status === 401 || status === 403) return "not_configured";
  if (status === 402) return "insufficient_credit";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unknown";
  if (status === 400 || status === 422) return "invalid_response";
  return "unknown";
}

/**
 * Whether an HTTP status is worth retrying (transient) — 429 and 5xx (bar 501).
 * Auth (401/403), invalid request (400/422), and insufficient credit (402) are
 * NEVER retried: retrying can't fix them and just wastes calls/cost.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status !== 501);
}

/**
 * Parse a `Retry-After` header (delta-seconds OR an HTTP date) to a wait in ms.
 * Returns null when absent/unparseable. Pure — `now` injected for tests.
 */
export function parseRetryAfterMs(headerValue: string | null, now = Date.now()): number | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (/^\d+$/.test(trimmed)) {
    const secs = Number(trimmed);
    return Number.isFinite(secs) ? Math.max(0, secs * 1000) : null;
  }
  const dateMs = Date.parse(trimmed);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - now) : null;
}

/** Bounded exponential backoff: base·2^attempt, capped. Pure, no jitter. */
export function backoffDelayMs(attempt: number, baseMs = 500, capMs = 8000): number {
  const delay = baseMs * 2 ** Math.max(0, attempt);
  return Math.min(capMs, Math.max(0, delay));
}
