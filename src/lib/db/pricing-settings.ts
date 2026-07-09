import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import {
  PRICING_SETTINGS_KEY,
  type PricingSettings,
  type RoundingIncrement,
  type RoundingMode,
} from "@/lib/pricing/types";

/**
 * Admin-controlled commercial pricing settings, persisted as a dedicated
 * StoreSetting row (id="pricing") — same keyed-JSON convention as the main
 * store config, but a separate row so it never entangles with it.
 *
 * These are ghost.ma's INTERNAL exchange rates and margin/rounding policy. This
 * phase never auto-fetches FX rates; an admin sets them by hand.
 */

export const defaultPricingSettings: PricingSettings = {
  // Internal commercial rates (MAD per 1 unit). Admin-editable; not a live feed.
  fxRatesToMad: { EUR: 10.9, USD: 10.2 },
  defaultMarginPct: 15,
  roundingIncrement: 5,
  roundingMode: "up",
  costStaleDays: 7,
};

const ROUNDING_INCREMENTS: RoundingIncrement[] = [1, 5, 10];
const ROUNDING_MODES: RoundingMode[] = ["nearest", "up"];

/** Coerces arbitrary stored JSON into a valid, complete PricingSettings. */
export function mergePricingSettings(value: unknown): PricingSettings {
  const raw = (value ?? {}) as Partial<PricingSettings>;
  const fx: Record<string, number> = {};
  if (raw.fxRatesToMad && typeof raw.fxRatesToMad === "object") {
    for (const [code, rate] of Object.entries(raw.fxRatesToMad)) {
      const num = Number(rate);
      if (code && Number.isFinite(num) && num > 0) fx[code.toUpperCase()] = num;
    }
  }
  const increment = ROUNDING_INCREMENTS.includes(raw.roundingIncrement as RoundingIncrement)
    ? (raw.roundingIncrement as RoundingIncrement)
    : defaultPricingSettings.roundingIncrement;
  const mode = ROUNDING_MODES.includes(raw.roundingMode as RoundingMode)
    ? (raw.roundingMode as RoundingMode)
    : defaultPricingSettings.roundingMode;
  const margin = Number(raw.defaultMarginPct);
  const staleDays = Number(raw.costStaleDays);

  return {
    fxRatesToMad: Object.keys(fx).length > 0 ? fx : { ...defaultPricingSettings.fxRatesToMad },
    defaultMarginPct: Number.isFinite(margin) ? margin : defaultPricingSettings.defaultMarginPct,
    roundingIncrement: increment,
    roundingMode: mode,
    // Clamp to a sane range; a non-positive/NaN value falls back to the default.
    costStaleDays:
      Number.isFinite(staleDays) && staleDays > 0
        ? Math.min(Math.round(staleDays), 3650)
        : defaultPricingSettings.costStaleDays,
  };
}

export async function getPricingSettings(): Promise<PricingSettings> {
  await ensureDatabaseReady();
  const record = await prisma.storeSetting.findUnique({
    where: { id: PRICING_SETTINGS_KEY },
  });
  return record ? mergePricingSettings(record.value) : { ...defaultPricingSettings };
}

export async function savePricingSettings(settings: PricingSettings): Promise<PricingSettings> {
  await ensureDatabaseReady();
  const merged = mergePricingSettings(settings);
  await prisma.storeSetting.upsert({
    where: { id: PRICING_SETTINGS_KEY },
    update: { value: merged },
    create: { id: PRICING_SETTINGS_KEY, value: merged },
  });
  return merged;
}
