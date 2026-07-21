/**
 * Provider-agnostic AI interface.
 *
 * The rest of the system talks to *this* shape, never to Anthropic/OpenAI/
 * Composio directly, so the provider can be swapped without touching module
 * logic. For this foundation task only a `mock` (deterministic, no key) and a
 * `disabled` (hard-refuse) implementation exist — real SDK adapters are wired in
 * a later task. There are deliberately NO automatic fallback chains: an
 * unconfigured provider degrades to `mock`, it does not silently try an
 * expensive model.
 *
 * Spec §10: the interface supports model id, system instructions, structured
 * input, tool definitions, structured output, token usage, estimated cost,
 * timeout, retry policy, and normalized errors.
 */

import "server-only";

import {
  fallbackProvider,
  getAnthropicApiKey,
  getOpenRouterApiKey,
  getOpenRouterReferer,
  getOpenRouterTitle,
  isProviderConfigured,
} from "./config";
import { estimateCostUsd, estimateTokens } from "./usage";
import { isAiProvider, type AiProvider } from "./types";
import {
  OPENROUTER_URL,
  backoffDelayMs,
  buildOpenRouterBody,
  isRetryableStatus,
  mapOpenRouterStatus,
  parseOpenRouterResponse,
  parseRetryAfterMs,
} from "./providers/openrouterCore";
import {
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  buildAnthropicBody,
  isRetryableStatus as isRetryableAnthropicStatus,
  mapAnthropicStatus,
  parseAnthropicResponse,
} from "./providers/anthropicCore";

export interface AiToolDefinition {
  name: string;
  description: string;
  /** JSON-schema-ish parameter description. Kept loose; validated at the tool layer. */
  parameters: Record<string, unknown>;
}

/** A tool call the model requested. `arguments` is a raw JSON string (unparsed). */
export interface AiToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * A conversation message for the multi-turn tool-calling loop. When a request
 * carries `messages`, the adapter uses them verbatim instead of building from
 * `system` + `input` — enabling the assistant→tool→assistant round trips.
 */
export interface AiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Assistant messages that requested tools. */
  toolCalls?: AiToolCall[];
  /** Tool-result messages: the id of the call being answered + the tool name. */
  toolCallId?: string;
  name?: string;
}

export interface AiRetryPolicy {
  maxRetries: number;
  backoffMs: number;
}

export interface AiCompletionRequest {
  model: string;
  system: string;
  /** Structured input; serialized by the adapter. Ignored when `messages` is set. */
  input: unknown;
  /** Full message history for the tool-calling loop; overrides system+input. */
  messages?: AiMessage[];
  tools?: AiToolDefinition[];
  /** Ask the provider for structured JSON output matching this schema. */
  responseSchema?: Record<string, unknown>;
  /** Optional ceiling on generated tokens (maps to the provider's max_tokens). */
  maxTokens?: number;
  timeoutMs?: number;
  retry?: AiRetryPolicy;
}

export interface AiUsage {
  tokensIn: number;
  tokensOut: number;
  estimatedCostUsd: number;
}

export interface AiCompletionResult {
  provider: AiProvider;
  model: string;
  /** Text output (empty when structured output was requested). */
  text: string;
  /** Parsed structured output, when a responseSchema was supplied. */
  structured?: unknown;
  /** Tool calls the model requested this turn (empty/undefined when none). */
  toolCalls?: AiToolCall[];
  usage: AiUsage;
}

/** Stable, non-identifying error categories so callers can branch/normalize. */
export type AiErrorCode =
  | "provider_disabled"
  | "not_configured"
  | "insufficient_credit"
  | "timeout"
  | "rate_limited"
  | "invalid_response"
  | "unknown";

export class AiProviderError extends Error {
  code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
  }
}

export interface AiProviderClient {
  readonly provider: AiProvider;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}

/** Hard-refusing provider — every call throws `provider_disabled`. */
class DisabledProvider implements AiProviderClient {
  readonly provider: AiProvider = "disabled";
  async complete(): Promise<AiCompletionResult> {
    throw new AiProviderError(
      "provider_disabled",
      "AI provider is disabled. Configure a provider in AI Operations settings.",
    );
  }
}

/**
 * Deterministic mock provider. Produces a stable placeholder response and a
 * real (estimated) usage figure so the budget/usage plumbing can be exercised
 * end to end with no API key and no cost. Never performs network I/O.
 */
class MockProvider implements AiProviderClient {
  readonly provider: AiProvider = "mock";
  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const inputText = request.messages
      ? request.messages.map((m) => m.content).join("\n")
      : `${request.system}\n${safeStringify(request.input)}`;
    const tokensIn = estimateTokens(inputText);
    const text = request.responseSchema
      ? ""
      : `[mock:${request.model}] This is a placeholder AI response generated without a provider. ` +
        `Configure a real provider to enable live completions.`;
    const structured = request.responseSchema ? { mock: true, note: "placeholder structured output" } : undefined;
    const tokensOut = estimateTokens(text || safeStringify(structured));
    return {
      provider: this.provider,
      model: request.model,
      text,
      structured,
      usage: {
        tokensIn,
        tokensOut,
        estimatedCostUsd: estimateCostUsd(request.model, tokensIn, tokensOut),
      },
    };
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "";
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Real OpenRouter adapter (OpenAI-compatible chat completions). The pure
 * request/response/error logic lives in providers/openrouterCore.ts; this class
 * is only the network edge: auth header, timeout via AbortController, and a
 * BOUNDED retry (opt-in through the request's retry policy — there is no
 * automatic fallback to a different, more expensive model by default).
 *
 * Never leaks the key: the Authorization header is built here and never logged.
 */
class OpenRouterProvider implements AiProviderClient {
  readonly provider: AiProvider = "openrouter";
  constructor(private readonly apiKey: string) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    // Validate a model is configured — never silently pick a (paid) default here.
    if (!request.model || !request.model.trim()) {
      throw new AiProviderError("not_configured", "No AI model is configured.");
    }
    const body = buildOpenRouterBody(request);
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = Math.max(0, request.retry?.maxRetries ?? 0);
    const backoffMs = request.retry?.backoffMs ?? 500;

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": getOpenRouterReferer(),
            "X-Title": getOpenRouterTitle(),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          // Retry only transient statuses (429/5xx), never auth/invalid/credit.
          if (isRetryableStatus(response.status) && attempt < maxRetries) {
            // Honor the server's Retry-After when present; else exponential backoff.
            const retryAfter = parseRetryAfterMs(response.headers.get("retry-after"));
            await sleep(retryAfter ?? backoffDelayMs(attempt, backoffMs));
            continue;
          }
          // Body is drained but never surfaced — an OpenRouter error body can
          // echo the request/system prompt; only the status maps to a code.
          throw new AiProviderError(
            mapOpenRouterStatus(response.status),
            `OpenRouter request failed (${response.status}).`,
          );
        }

        const json = await response.json();
        const parsed = parseOpenRouterResponse(request, json);
        return {
          provider: this.provider,
          model: parsed.model,
          text: parsed.text,
          structured: parsed.structured,
          toolCalls: parsed.toolCalls,
          usage: parsed.usage,
        };
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        const aborted = error instanceof Error && error.name === "AbortError";
        // A timeout (abort) is not retried here — the caller's timeout already
        // bounds the wait; only transient network errors get a bounded retry.
        if (!aborted && attempt < maxRetries) {
          await sleep(backoffDelayMs(attempt, backoffMs));
          continue;
        }
        throw new AiProviderError(
          aborted ? "timeout" : "unknown",
          aborted ? "OpenRouter request timed out." : "OpenRouter request error.",
        );
      } finally {
        clearTimeout(timer);
      }
    }
  }
}

/**
 * Real Anthropic adapter (Messages API, `x-api-key` auth). The pure request/
 * response/error logic lives in providers/anthropicCore.ts; this class is only
 * the network edge: auth header, timeout via AbortController, and a BOUNDED
 * retry (opt-in through the request's retry policy — no automatic fallback to a
 * different, more expensive model).
 *
 * Never leaks the key: the `x-api-key` header is built here and never logged.
 */
class AnthropicProvider implements AiProviderClient {
  readonly provider: AiProvider = "anthropic";
  constructor(private readonly apiKey: string) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const body = buildAnthropicBody(request);
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = Math.max(0, request.retry?.maxRetries ?? 0);
    const backoffMs = request.retry?.backoffMs ?? 500;

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(ANTHROPIC_URL, {
          method: "POST",
          headers: {
            "x-api-key": this.apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          if (isRetryableAnthropicStatus(response.status) && attempt < maxRetries) {
            await sleep(backoffMs * (attempt + 1));
            continue;
          }
          // Body is drained but never surfaced — an error body can echo the
          // request/system prompt; only the status maps to a code.
          throw new AiProviderError(
            mapAnthropicStatus(response.status),
            `Anthropic request failed (${response.status}).`,
          );
        }

        const json = await response.json();
        const parsed = parseAnthropicResponse(request, json);
        return {
          provider: this.provider,
          model: parsed.model,
          text: parsed.text,
          structured: parsed.structured,
          usage: parsed.usage,
        };
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        const aborted = error instanceof Error && error.name === "AbortError";
        if (!aborted && attempt < maxRetries) {
          await sleep(backoffMs * (attempt + 1));
          continue;
        }
        throw new AiProviderError(
          aborted ? "timeout" : "unknown",
          aborted ? "Anthropic request timed out." : "Anthropic request error.",
        );
      } finally {
        clearTimeout(timer);
      }
    }
  }
}

/**
 * Resolves the concrete client for a requested provider. Unknown or
 * unconfigured providers degrade to the mock (never to an expensive real
 * model). "disabled" is honored as an explicit hard stop.
 */
export function resolveProvider(requested: string): AiProviderClient {
  const provider: AiProvider = isAiProvider(requested) ? requested : fallbackProvider();
  if (provider === "disabled") return new DisabledProvider();
  if (provider === "mock") return new MockProvider();

  // OpenRouter is a wired real provider. If its key is present, use it;
  // otherwise degrade to mock (never to another, more expensive provider).
  if (provider === "openrouter") {
    const key = getOpenRouterApiKey();
    return key ? new OpenRouterProvider(key) : new MockProvider();
  }

  // Anthropic direct (own Console API key). Key present → use it; else mock.
  if (provider === "anthropic") {
    const key = getAnthropicApiKey();
    return key ? new AnthropicProvider(key) : new MockProvider();
  }

  // OpenAI direct SDK adapter is not wired yet — degrade to mock rather than
  // silently failing over to an expensive path.
  if (!isProviderConfigured(provider)) return new MockProvider();
  return new MockProvider();
}
