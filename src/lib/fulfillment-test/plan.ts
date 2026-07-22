/**
 * Pure, dependency-free pieces of the Fulfillment Test Center: the per-mode
 * stage plan and the sandbox-product picker. Kept out of runner.ts (which pulls
 * in Prisma / email / Discord) so this logic is unit-testable in isolation.
 */
import type { ReloadlyGiftCardProduct } from "@/lib/reloadly/operations";
import type { HealthCheck, TestMode } from "./types";

/** Non-deliverable synthetic recipient — never a real customer address. */
export const TEST_RECIPIENT_EMAIL = "fulfillment-test@ghost.ma";
export const PLACEHOLDER_CODE = "TEST-PLACEHOLDER-NOT-REDEEMABLE";

export const STAGE = {
  context: "Contexte de commande simulé",
  auth: "Authentification fournisseur",
  select: "Sélection produit sandbox",
  validate: "Validation du produit",
  purchase: "Achat fournisseur",
  store: "Chiffrement et stockage du code",
  email: "Rendu de l’e-mail de livraison",
  timeline: "Chronologie commande et admin",
  discord: "Notification Discord",
} as const;

/** Ordered stage plan per mode — drives both execution and the skipped-tail UI. */
export const STAGE_PLAN: Record<TestMode, string[]> = {
  full: [
    STAGE.context,
    STAGE.auth,
    STAGE.select,
    STAGE.validate,
    STAGE.purchase,
    STAGE.store,
    STAGE.email,
    STAGE.timeline,
    STAGE.discord,
  ],
  authenticate: [STAGE.context, STAGE.auth],
  purchase: [STAGE.context, STAGE.auth, STAGE.select, STAGE.validate, STAGE.purchase, STAGE.store],
  encryption: [STAGE.store],
  email: [STAGE.email],
  delivery: [STAGE.email],
  timeline: [STAGE.timeline],
  discord: [STAGE.discord],
  health: [],
};

export type SandboxProductPick = {
  product: ReloadlyGiftCardProduct;
  faceValue: number;
  currency: string;
  countryCode: string;
};

/**
 * Picks the cheapest usable sandbox product so a real purchase spends as little
 * fake wallet balance as possible. Prefers a FIXED product's smallest
 * denomination; falls back to a RANGE product's minimum. Ignores anything that
 * is not ACTIVE or lacks a country code / usable denomination.
 */
export function pickSandboxProduct(products: ReloadlyGiftCardProduct[]): SandboxProductPick | null {
  const active = products.filter((p) => p.status === "ACTIVE" && p.country?.isoName);
  let best: SandboxProductPick | null = null;

  for (const p of active) {
    if (p.denominationType !== "FIXED") continue;
    const denoms = (p.fixedRecipientDenominations ?? []).filter((d) => d > 0);
    if (!denoms.length) continue;
    const min = Math.min(...denoms);
    if (!best || min < best.faceValue) {
      best = { product: p, faceValue: min, currency: p.recipientCurrencyCode, countryCode: p.country.isoName };
    }
  }
  if (best) return best;

  for (const p of active) {
    const v = p.minRecipientDenomination;
    if (v && v > 0 && (!best || v < best.faceValue)) {
      best = { product: p, faceValue: v, currency: p.recipientCurrencyCode, countryCode: p.country.isoName };
    }
  }
  return best;
}

/** Health checks that would block a real fulfillment (fail status only). */
export function blockingHealthChecks(checks: HealthCheck[]): HealthCheck[] {
  return checks.filter((c) => c.status === "fail");
}
