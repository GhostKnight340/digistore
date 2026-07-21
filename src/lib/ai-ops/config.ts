/**
 * Central reader for AI-provider environment variables.
 *
 * Mirrors src/lib/discord/config.ts: no other module reads `process.env.AI_*`
 * or provider API keys directly — enablement and secret access are centralized
 * here so they can be audited in one place and so secrets never reach the
 * client. Provider secrets live ONLY in env, never in a database column (spec
 * §2, §12).
 *
 * Everything fails closed: a provider only counts as usable when both the
 * master flag is on and the required secret is present.
 */

import type { AiProvider } from "./types";

/** Master flag for the whole AI Operations subsystem at the process level. */
export function isAiOpsEnvEnabled(): boolean {
  return process.env.AI_OPS_ENABLED === "true";
}

/** Anthropic API key — SECRET, server-only, never NEXT_PUBLIC. */
export function getAnthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || undefined;
}

/** OpenAI API key — SECRET, server-only. */
export function getOpenAiApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY || undefined;
}

/**
 * Is the given provider actually usable right now? "mock" is always usable (no
 * key). "disabled" is never usable. Real providers require their secret.
 * Fails closed.
 */
export function isProviderConfigured(provider: AiProvider): boolean {
  switch (provider) {
    case "mock":
      return true;
    case "disabled":
      return false;
    case "anthropic":
      return Boolean(getAnthropicApiKey());
    case "openai":
      return Boolean(getOpenAiApiKey());
    default:
      return false;
  }
}

/**
 * The provider to fall back to when a configured provider has no secret. The
 * foundation ships with no real key, so this keeps the system operating in a
 * safe, no-cost mock mode rather than throwing.
 */
export function fallbackProvider(): AiProvider {
  return "mock";
}
