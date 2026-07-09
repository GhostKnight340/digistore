/**
 * Shared pricing types. Pure data shapes — deliberately no `server-only`, no
 * Prisma, no React — so both the server layer and the (Node test-runner) unit
 * tests can import them. Monetary values that must be exact are carried as
 * strings or Prisma.Decimal at the edges and as Decimal inside the calculators;
 * see src/lib/pricing/cost.ts and suggested-price.ts.
 */

export type PricingEnvironment = "sandbox" | "live";

export type RoundingIncrement = 1 | 5 | 10;
export type RoundingMode = "nearest" | "up";

/**
 * Admin-controlled commercial settings. These are ghost.ma's *internal*
 * exchange rates (not a live FX feed) and margin/rounding policy. Stored as a
 * keyed StoreSetting row ("pricing"); see src/lib/db/pricing-settings.ts.
 *
 * `fxRatesToMad` maps a supplier/sender currency code → MAD per 1 unit, e.g.
 * { EUR: 10.9, USD: 10.1 }. Extensible: adding a currency is just another key.
 */
export type PricingSettings = {
  fxRatesToMad: Record<string, number>;
  defaultMarginPct: number;
  roundingIncrement: RoundingIncrement;
  roundingMode: RoundingMode;
};

/** Where the applied margin came from — surfaced in the admin breakdown. */
export type MarginSource =
  | "variant_fixed_price"
  | "variant"
  | "product"
  | "category"
  | "global_default";

/** The optional overrides that feed the margin-resolution ladder. */
export type MarginPolicyInputs = {
  variantFixedPriceMad: number | null;
  variantMarginPct: number | null;
  productMarginPct: number | null;
  categoryMarginPct: number | null;
  defaultMarginPct: number;
};

/** Result of resolving the margin ladder (most specific wins). */
export type ResolvedMargin =
  | { source: "variant_fixed_price"; fixedPriceMad: number }
  | { source: Exclude<MarginSource, "variant_fixed_price">; marginPct: number };

/**
 * Full, explainable breakdown of a suggested price. Everything the admin UI
 * needs to justify the number, plus the delta against the currently published
 * price. All monetary fields are plain numbers *for display*; the authoritative
 * computation happens in Decimal and only the final rounded MAD price is an
 * integer (matching ProductVariant.priceMad).
 */
export type SuggestedPriceBreakdown = {
  providerCost: number;
  supplierCurrency: string;
  fxRateToMad: number;
  costInMad: number;
  marginSource: MarginSource;
  marginPct: number | null;
  rawPriceMad: number;
  roundingIncrement: RoundingIncrement;
  roundingMode: RoundingMode;
  suggestedPriceMad: number;
  publishedPriceMad: number | null;
  differenceMad: number | null;
  differencePct: number | null;
};

export const PRICING_SETTINGS_KEY = "pricing";
