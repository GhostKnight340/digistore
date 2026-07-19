/**
 * Normalized supplier error taxonomy.
 *
 * Every provider maps its own HTTP statuses and machine codes onto this small
 * closed set, so the fulfillment engine, the ops dashboard and the admin UI can
 * reason about failures without knowing which supplier produced them.
 *
 * Two properties matter more than the code itself:
 *
 *  - `certainty` — "clean" (the supplier refused BEFORE spending) vs
 *    "uncertain" (we do not know whether we were charged). This drives the
 *    single most important decision on the money path: whether a retry or a
 *    failover to another supplier is safe. See ./purchaseOutcome.ts.
 *  - `retryable` — whether an automated retry of the SAME idempotency key has
 *    any chance of a different outcome. An unavailable product is clean but
 *    not retryable; a rate limit is clean and retryable.
 *
 * Deliberately dependency-free (no server-only, no provider imports) so both
 * providers and tests can import it.
 */

import type { SupplierFailureCertainty } from "./purchaseOutcome";

export type SupplierErrorCode =
  /** Credentials rejected — key invalid, revoked or malformed. */
  | "auth_failed"
  /** Key is valid but the account's subscription/plan does not permit this. */
  | "subscription_inactive"
  /** The offer exists but cannot currently be purchased (stock, delisted). */
  | "product_unavailable"
  /** Supplier wallet cannot cover the order. */
  | "insufficient_balance"
  /** Our stored mapping does not match anything in the supplier catalog. */
  | "invalid_mapping"
  /** Request rejected as malformed/invalid by the supplier (our bug). */
  | "invalid_request"
  /** HTTP 429 — back off and retry per Retry-After. */
  | "rate_limited"
  /** Supplier reachable but failing (5xx) or unreachable entirely. */
  | "supplier_unavailable"
  /** Request timed out; the purchase may or may not have completed. */
  | "timeout_uncertain"
  /** Supplier definitively rejected/failed the order. No charge. */
  | "order_failed"
  /** Response arrived but did not match the shape we require. */
  | "malformed_response"
  /** We do not implement this supplier service family. */
  | "unsupported_service"
  /** Anything we could not classify — treated as uncertain by default. */
  | "unknown";

/** Admin-facing French copy per code. Never shown to customers. */
const MESSAGES: Record<SupplierErrorCode, string> = {
  auth_failed: "Authentification fournisseur refusée — vérifiez la clé API.",
  subscription_inactive:
    "L’abonnement fournisseur est inactif ou ne couvre pas ce service.",
  product_unavailable: "Ce produit est indisponible chez le fournisseur.",
  insufficient_balance: "Solde fournisseur insuffisant pour cette commande.",
  invalid_mapping: "Le mapping fournisseur ne correspond à aucune offre valide.",
  invalid_request: "Requête refusée par le fournisseur (données invalides).",
  rate_limited: "Fournisseur en limitation de débit — réessayez dans un instant.",
  supplier_unavailable: "Le fournisseur est momentanément indisponible.",
  timeout_uncertain:
    "Délai dépassé : le résultat de l’achat est INCERTAIN et doit être réconcilié.",
  order_failed: "La commande a été refusée par le fournisseur.",
  malformed_response: "Réponse fournisseur inexploitable.",
  unsupported_service: "Ce type de service fournisseur n’est pas pris en charge.",
  unknown: "Erreur fournisseur inattendue.",
};

/**
 * Certainty per code. Only codes where the supplier demonstrably answered
 * *before* doing any work are "clean" — everything ambiguous defaults to
 * "uncertain", because the cost of wrongly assuming "clean" is a second real
 * charge, while the cost of wrongly assuming "uncertain" is one admin click.
 */
const CERTAINTY: Record<SupplierErrorCode, SupplierFailureCertainty> = {
  auth_failed: "clean",
  subscription_inactive: "clean",
  product_unavailable: "clean",
  insufficient_balance: "clean",
  invalid_mapping: "clean",
  invalid_request: "clean",
  rate_limited: "clean",
  order_failed: "clean",
  unsupported_service: "clean",
  supplier_unavailable: "uncertain",
  timeout_uncertain: "uncertain",
  malformed_response: "uncertain",
  unknown: "uncertain",
};

/** Whether an automated retry of the same key could plausibly succeed. */
const RETRYABLE: Record<SupplierErrorCode, boolean> = {
  rate_limited: true,
  supplier_unavailable: true,
  timeout_uncertain: true,
  malformed_response: true,
  unknown: false,
  auth_failed: false,
  subscription_inactive: false,
  product_unavailable: false,
  insufficient_balance: false,
  invalid_mapping: false,
  invalid_request: false,
  order_failed: false,
  unsupported_service: false,
};

/**
 * A supplier failure classified onto the shared taxonomy. Carries the safe
 * admin message plus the provider's own machine code for diagnosis — never a
 * raw response body, never credentials.
 */
export class NormalizedSupplierError extends Error {
  readonly code: SupplierErrorCode;
  readonly certainty: SupplierFailureCertainty;
  readonly retryable: boolean;
  /** Provider machine code (e.g. FazerCards `code`), preserved verbatim. */
  readonly providerCode: string | null;
  readonly httpStatus: number | null;
  /** Seconds to wait, from Retry-After, when rate limited. */
  readonly retryAfterSec: number | null;
  /** Provider request id, when the API returns one. */
  readonly providerRequestId: string | null;

  constructor(
    code: SupplierErrorCode,
    options: {
      message?: string;
      providerCode?: string | null;
      httpStatus?: number | null;
      retryAfterSec?: number | null;
      providerRequestId?: string | null;
    } = {},
  ) {
    super(options.message || MESSAGES[code]);
    this.name = "NormalizedSupplierError";
    this.code = code;
    this.certainty = CERTAINTY[code];
    this.retryable = RETRYABLE[code];
    this.providerCode = options.providerCode ?? null;
    this.httpStatus = options.httpStatus ?? null;
    this.retryAfterSec = options.retryAfterSec ?? null;
    this.providerRequestId = options.providerRequestId ?? null;
  }

  /** True when this failure may already have spent supplier money. */
  get isUncertain(): boolean {
    return this.certainty === "uncertain";
  }
}

export function isNormalizedSupplierError(
  error: unknown,
): error is NormalizedSupplierError {
  return error instanceof NormalizedSupplierError;
}

export function supplierErrorMessage(code: SupplierErrorCode): string {
  return MESSAGES[code];
}

/**
 * Classifies an HTTP status + optional provider machine code onto the taxonomy.
 * Provider modules pass their own `code` string; recognised values win over the
 * status, because a supplier that returns 400 with `insufficient_balance` is
 * telling us something far more actionable than "bad request".
 *
 * Unknown 4xx stays "clean" (the supplier answered before working); unknown 5xx
 * and "no response at all" stay uncertain.
 */
export function classifySupplierHttpError(input: {
  status: number | null;
  providerCode?: string | null;
  isNetworkError?: boolean;
}): SupplierErrorCode {
  if (input.isNetworkError) return "timeout_uncertain";

  const code = input.providerCode?.toLowerCase().trim();
  if (code) {
    // Substring matching, not equality: providers namespace their codes
    // inconsistently ("balance_low", "ERR_INSUFFICIENT_BALANCE", …).
    if (/insufficient|balance/.test(code)) return "insufficient_balance";
    if (/subscription|plan|not_enabled|forbidden_service/.test(code)) {
      return "subscription_inactive";
    }
    if (/unauthor|invalid_key|api_key|auth/.test(code)) return "auth_failed";
    if (/out_of_stock|unavailable|sold_out|no_stock/.test(code)) {
      return "product_unavailable";
    }
    if (/not_found|unknown_offer|unknown_card|invalid_card|invalid_offer/.test(code)) {
      return "invalid_mapping";
    }
    if (/rate_limit|too_many/.test(code)) return "rate_limited";
    if (/validation|invalid/.test(code)) return "invalid_request";
  }

  const status = input.status;
  if (status == null) return "timeout_uncertain";
  if (status === 401) return "auth_failed";
  if (status === 403) return "subscription_inactive";
  if (status === 404) return "invalid_mapping";
  if (status === 409) return "invalid_request";
  if (status === 422 || status === 400) return "invalid_request";
  if (status === 429) return "rate_limited";
  // 408/425 are "we may have started work" — explicitly uncertain.
  if (status === 408 || status === 425) return "timeout_uncertain";
  if (status >= 400 && status < 500) return "invalid_request";
  if (status >= 500) return "supplier_unavailable";
  return "unknown";
}
