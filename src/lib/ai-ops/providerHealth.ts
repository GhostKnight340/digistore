/**
 * Provider health + a live "test provider" check for the admin panel (spec §6).
 *
 * Uses the provider + model configured in AI Operations settings (never a
 * hardcoded model). The test performs ONE tiny completion so an admin can
 * confirm the key/model work end to end. Only a normalized error CATEGORY is
 * ever returned — never the API key, the raw body, or the prompt.
 */

import "server-only";

import { getAiOpsSettings } from "./store";
import { AiProviderError, resolveProvider } from "./provider";
import { isProviderConfigured } from "./config";
import { isAiProvider } from "./types";

export interface ProviderTestResult {
  ok: boolean;
  /** The concrete provider that actually ran (e.g. "mock" when unconfigured). */
  provider: string;
  /** The configured provider setting. */
  configuredProvider: string;
  model: string;
  /** Whether the configured provider's secret is present. */
  configured: boolean;
  latencyMs: number;
  /** Normalized error category on failure (never the key/message body). */
  error?: string;
}

export async function testAiProvider(): Promise<ProviderTestResult> {
  const settings = await getAiOpsSettings();
  const configuredProvider = settings.defaultProvider;
  const model = settings.defaultModel;
  const configured = isAiProvider(configuredProvider)
    ? isProviderConfigured(configuredProvider)
    : false;

  const client = resolveProvider(configuredProvider);
  const started = Date.now();
  try {
    const result = await client.complete({
      model,
      system: "You are a health check. Reply with exactly: OK",
      input: "ping",
      timeoutMs: 15_000,
    });
    return {
      ok: true,
      provider: client.provider,
      configuredProvider,
      model: result.model,
      configured,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      provider: client.provider,
      configuredProvider,
      model,
      configured,
      latencyMs: Date.now() - started,
      error: error instanceof AiProviderError ? error.code : "unknown",
    };
  }
}
