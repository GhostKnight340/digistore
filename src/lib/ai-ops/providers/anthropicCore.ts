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

import type { AiCompletionRequest, AiErrorCode } from "../provider";
import { estimateCostUsd } from "../usage";

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

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
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

/** Builds the Anthropic Messages request body from a provider-agnostic request. Pure. */
export function buildAnthropicBody(request: AiCompletionRequest): AnthropicRequestBody {
  const maxTokens =
    typeof request.maxTokens === "number" && request.maxTokens > 0
      ? Math.trunc(request.maxTokens)
      : DEFAULT_MAX_TOKENS;
  const body: AnthropicRequestBody = {
    model: resolveAnthropicModel(request.model),
    max_tokens: maxTokens,
    messages: [{ role: "user", content: userContent(request.input) }],
  };
  if (request.system) body.system = request.system;
  return body;
}

export interface ParsedCompletion {
  model: string;
  text: string;
  structured?: unknown;
  usage: { tokensIn: number; tokensOut: number; estimatedCostUsd: number };
}

/** Shape of the fields we read from an Anthropic response. */
interface AnthropicResponse {
  model?: string;
  content?: { type?: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Parses an Anthropic response into the provider-agnostic result. Pure. The
 * Messages API returns no cost, so cost is always the local estimate. Text is
 * the concatenation of every `text` content block.
 */
export function parseAnthropicResponse(request: AiCompletionRequest, json: unknown): ParsedCompletion {
  const res = (json ?? {}) as AnthropicResponse;
  const model = res.model ?? resolveAnthropicModel(request.model);
  const text = Array.isArray(res.content)
    ? res.content
        .filter((b) => b?.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("")
    : "";
  const tokensIn = Math.max(0, res.usage?.input_tokens ?? 0);
  const tokensOut = Math.max(0, res.usage?.output_tokens ?? 0);
  return {
    model,
    text,
    structured: undefined,
    usage: { tokensIn, tokensOut, estimatedCostUsd: estimateCostUsd(model, tokensIn, tokensOut) },
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
