/**
 * AI usage & cost estimation — pure helpers.
 *
 * Estimates only (no billing authority): a rough token count from text length
 * and a per-model price table give the "estimated AI usage / cost" figures the
 * dashboard shows and the budget guardrails compare against. Kept pure and
 * table-driven so prices are easy to update and the math is unit-testable.
 *
 * Prices are USD per 1,000,000 tokens. Update as needed; unknown models fall
 * back to a conservative default.
 */

export interface ModelPrice {
  /** USD per 1M input tokens. */
  inPerMTok: number;
  /** USD per 1M output tokens. */
  outPerMTok: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // Cheap default the system is designed to lean on for most tasks.
  "claude-haiku-4-5": { inPerMTok: 1, outPerMTok: 5 },
  "claude-sonnet-5": { inPerMTok: 3, outPerMTok: 15 },
  "claude-opus-4-8": { inPerMTok: 15, outPerMTok: 75 },
  // OpenRouter-namespaced ids (fallback estimate only — OpenRouter returns the
  // real cost in usage.cost when available).
  "anthropic/claude-haiku-4.5": { inPerMTok: 1, outPerMTok: 5 },
  "anthropic/claude-sonnet-4.5": { inPerMTok: 3, outPerMTok: 15 },
  "anthropic/claude-opus-4.1": { inPerMTok: 15, outPerMTok: 75 },
  "openai/gpt-4o-mini": { inPerMTok: 0.15, outPerMTok: 0.6 },
  "google/gemini-flash-1.5": { inPerMTok: 0.075, outPerMTok: 0.3 },
  // Mock/disabled providers cost nothing.
  mock: { inPerMTok: 0, outPerMTok: 0 },
  disabled: { inPerMTok: 0, outPerMTok: 0 },
};

/** Conservative fallback for an unknown model id. */
const DEFAULT_PRICE: ModelPrice = { inPerMTok: 3, outPerMTok: 15 };

export function priceFor(model: string): ModelPrice {
  return MODEL_PRICES[model] ?? DEFAULT_PRICE;
}

/**
 * Very rough token estimate from character length (~4 chars/token). Deliberately
 * simple; real usage comes from the provider response when available.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Estimated USD cost for a given model + token counts. Never negative. */
export function estimateCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const price = priceFor(model);
  const inTok = Math.max(0, tokensIn || 0);
  const outTok = Math.max(0, tokensOut || 0);
  const cost = (inTok / 1_000_000) * price.inPerMTok + (outTok / 1_000_000) * price.outPerMTok;
  // Round to 6 decimals to match the DECIMAL(12,6) column.
  return Math.round(cost * 1_000_000) / 1_000_000;
}
