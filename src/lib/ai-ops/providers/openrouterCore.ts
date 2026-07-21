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

import type { AiCompletionRequest, AiErrorCode } from "../provider";
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

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterRequestBody {
  model: string;
  messages: OpenRouterMessage[];
  response_format?: {
    type: "json_schema";
    json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
  };
  tools?: { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }[];
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
  const body: OpenRouterRequestBody = {
    model: resolveOpenRouterModel(request.model),
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: userContent(request.input) },
    ],
    usage: { include: true },
  };
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
  usage: { tokensIn: number; tokensOut: number; estimatedCostUsd: number };
}

/** Shape of the fields we read from an OpenRouter response. */
interface OpenRouterResponse {
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
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
  const text = res.choices?.[0]?.message?.content ?? "";
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
    usage: { tokensIn, tokensOut, estimatedCostUsd },
  };
}

/** Maps an HTTP status to a stable, non-identifying AiErrorCode. Pure. */
export function mapOpenRouterStatus(status: number): AiErrorCode {
  if (status === 401 || status === 403) return "not_configured";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unknown";
  if (status === 400 || status === 422) return "invalid_response";
  return "unknown";
}

/** Whether an HTTP status is worth retrying (transient). Pure. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status !== 501);
}
