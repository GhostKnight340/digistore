/**
 * Central reader for FazerCards-related environment variables. No other module
 * should read `process.env.FAZERCARDS_*` directly — go through these accessors
 * so credential logic stays in one place.
 *
 * Required env vars:
 *   FAZERCARDS_API_KEY        - reseller API key (reseller hub → Profile)
 * Optional env vars:
 *   FAZERCARDS_ENABLED        - "false" hard-disables the supplier regardless
 *                               of credentials (kill switch that survives a
 *                               leaked key).
 *   FAZERCARDS_MODE           - "live" | "dry_run". Defaults to "dry_run"
 *                               everywhere except production; see below.
 *   FAZERCARDS_WEBHOOK_SECRET - HMAC secret for inbound order webhooks
 *                               (hub → Settings → Webhook).
 *   FAZERCARDS_BASE_URL       - API base override (defaults to production).
 *
 * ── Why the mode gate exists ────────────────────────────────────────────────
 * FazerCards has NO sandbox. Every issued key is a live key and every order
 * spends real USD from the shared prepaid wallet. There is therefore no
 * "test credentials" configuration that makes staging safe — the only safe
 * staging posture is to not send order requests at all.
 *
 * So the mode is fail-safe by construction: it resolves to "live" ONLY when
 * the runtime is production AND the operator has explicitly written
 * FAZERCARDS_MODE=live. Anything else — unset, misspelled, a preview deploy,
 * a key that leaked into staging — resolves to "dry_run", where order
 * placement is simulated and clearly labelled, and never reaches the network.
 */
import { isProductionRuntime, isPreviewDeployment } from "@/lib/env";

export function getFazerCardsApiKey(): string | undefined {
  return process.env.FAZERCARDS_API_KEY || undefined;
}

export function getFazerCardsWebhookSecret(): string | undefined {
  return process.env.FAZERCARDS_WEBHOOK_SECRET || undefined;
}

/** Explicit kill switch. Only the exact string "false" disables. */
export function isFazerCardsEnvEnabled(): boolean {
  return (process.env.FAZERCARDS_ENABLED || "").trim().toLowerCase() !== "false";
}

export function isFazerCardsConfigured(): boolean {
  return Boolean(getFazerCardsApiKey()) && isFazerCardsEnvEnabled();
}

export const FAZERCARDS_DEFAULT_BASE_URL = "https://api.fzr.cards/api/v2";

export function getFazerCardsBaseUrl(): string {
  return (process.env.FAZERCARDS_BASE_URL || FAZERCARDS_DEFAULT_BASE_URL).replace(/\/$/, "");
}

/**
 * "live"    — real orders, real wallet spend.
 * "dry_run" — read-only calls still hit the API (catalog, balance and health
 *             are harmless, and we want them accurate on staging), but ORDER
 *             placement is simulated locally and never dispatched.
 */
export type FazerCardsMode = "live" | "dry_run";

export function getFazerCardsMode(): FazerCardsMode {
  const raw = (process.env.FAZERCARDS_MODE || "").trim().toLowerCase();
  // Fail-safe: "live" requires BOTH an explicit opt-in and a production
  // runtime. A preview/staging deploy can never reach live, whatever the env
  // var says, because a stray copied value must not be able to spend money.
  if (raw === "live" && isProductionRuntime() && !isPreviewDeployment()) {
    return "live";
  }
  return "dry_run";
}

export function isFazerCardsDryRun(): boolean {
  return getFazerCardsMode() === "dry_run";
}

/**
 * Human-readable mode for admin surfaces. Deliberately explicit about WHY a
 * dry run is in force — "why is staging not ordering?" is otherwise a
 * confusing five-minute debug every single time.
 */
export function describeFazerCardsMode(): string {
  if (!isFazerCardsEnvEnabled()) return "Désactivé (FAZERCARDS_ENABLED=false)";
  if (!getFazerCardsApiKey()) return "Non configuré (FAZERCARDS_API_KEY manquant)";
  if (getFazerCardsMode() === "live") return "LIVE — les commandes dépensent du solde réel";
  if (!isProductionRuntime() || isPreviewDeployment()) {
    return "SIMULATION — environnement hors production (aucun sandbox FazerCards n’existe)";
  }
  return "SIMULATION — FAZERCARDS_MODE n’est pas défini sur « live »";
}

/**
 * Startup/enable-time validation. Returns the problems that would stop the
 * supplier working, so `src/instrumentation.ts` and the admin "activer" action
 * report the same list instead of drifting apart.
 */
export function validateFazerCardsConfig(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (!getFazerCardsApiKey()) problems.push("FAZERCARDS_API_KEY est manquant.");
  if (!isFazerCardsEnvEnabled()) problems.push("FAZERCARDS_ENABLED=false (kill switch actif).");
  const baseUrl = process.env.FAZERCARDS_BASE_URL;
  if (baseUrl && !/^https:\/\//i.test(baseUrl)) {
    problems.push("FAZERCARDS_BASE_URL doit utiliser HTTPS.");
  }
  if (getFazerCardsMode() === "live" && !getFazerCardsWebhookSecret()) {
    // Not fatal — reconciliation polling covers us — but worth surfacing.
    problems.push(
      "FAZERCARDS_WEBHOOK_SECRET est manquant : la réconciliation reposera uniquement sur le polling.",
    );
  }
  return { ok: problems.length === 0, problems };
}
