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

import { fallbackProvider, isProviderConfigured } from "./config";
import { estimateCostUsd, estimateTokens } from "./usage";
import { isAiProvider, type AiProvider } from "./types";

export interface AiToolDefinition {
  name: string;
  description: string;
  /** JSON-schema-ish parameter description. Kept loose; validated at the tool layer. */
  parameters: Record<string, unknown>;
}

export interface AiRetryPolicy {
  maxRetries: number;
  backoffMs: number;
}

export interface AiCompletionRequest {
  model: string;
  system: string;
  /** Structured input; serialized by the adapter. */
  input: unknown;
  tools?: AiToolDefinition[];
  /** Ask the provider for structured JSON output matching this schema. */
  responseSchema?: Record<string, unknown>;
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
  usage: AiUsage;
}

/** Stable, non-identifying error categories so callers can branch/normalize. */
export type AiErrorCode =
  | "provider_disabled"
  | "not_configured"
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
    const inputText = `${request.system}\n${safeStringify(request.input)}`;
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

/**
 * Resolves the concrete client for a requested provider. Unknown or
 * unconfigured providers degrade to the mock (never to an expensive real
 * model). "disabled" is honored as an explicit hard stop.
 */
export function resolveProvider(requested: string): AiProviderClient {
  const provider: AiProvider = isAiProvider(requested) ? requested : fallbackProvider();
  if (provider === "disabled") return new DisabledProvider();
  if (provider === "mock") return new MockProvider();
  // Real providers are not wired in this foundation task: if a key is present
  // we still fall back to mock (no SDK adapter yet), and if not, mock as well.
  if (!isProviderConfigured(provider)) return new MockProvider();
  return new MockProvider();
}
