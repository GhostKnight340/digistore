/**
 * Domain-level Reloadly Gift Cards operations. This is the surface other
 * code should import from. `placeGiftCardOrder` IS on the live money path:
 * deliverOrder() → SupplierProvider.purchase() → here. Reloadly is an optional
 * supplier source per product variant, not a replacement for local
 * `DigitalCode` inventory.
 */
import "server-only";
import { getGiftCardsBaseUrl, type ReloadlyEnvironment } from "./config";
import { reloadlyRequest, RELOADLY_ORDER_TIMEOUT_MS } from "./client";

export type ReloadlyDenominationType = "FIXED" | "RANGE";

/**
 * Faithful representation of a Reloadly Gift Cards `/products` item. Every
 * field here is ALREADY returned by the API — this type previously dropped the
 * pricing fields (senderFee, discountPercentage, the sender-denomination map,
 * the FX rate), so cost data the API sends was silently discarded. Widening the
 * type changes no API behavior; it just stops throwing that data away. Verified
 * against live sandbox responses (see docs/pricing-architecture.md § inspection).
 *
 * Currency model: `recipient*` is the card's face currency (what the buyer
 * redeems); `sender*` is YOUR wallet currency (what you actually pay, EUR on
 * the ghost.ma account). Provider cost is always computed in sender currency.
 */
export type ReloadlyGiftCardProduct = {
  productId: number;
  productName: string;
  global: boolean;
  status: "ACTIVE" | "INACTIVE" | string;
  supportsPreOrder: boolean;
  denominationType: ReloadlyDenominationType | string;

  // ── Pricing inputs (all returned by the API; used by the cost calculator) ──
  /** Flat fee added per order, in sender currency. */
  senderFee: number;
  /** Percentage fee on the sender base amount. e.g. 3 = 3%. */
  senderFeePercentage: number;
  /** Wholesale discount off the sender base amount. e.g. 8 = 8%. */
  discountPercentage: number;
  /** FIXED sender-currency cost for each recipient denomination. */
  fixedSenderDenominations: number[] | null;
  /** Recipient→sender cost map, e.g. { "10.0": 9.15 }. Authoritative for FIXED. */
  fixedRecipientToSenderDenominationsMap: Record<string, number> | null;
  /** Recipient→sender FX rate. Used for RANGE cost, and as a FIXED fallback. */
  recipientCurrencyToSenderCurrencyExchangeRate: number | null;

  // ── Denomination bounds ────────────────────────────────────────────────
  recipientCurrencyCode: string;
  senderCurrencyCode: string;
  minRecipientDenomination: number | null;
  maxRecipientDenomination: number | null;
  minSenderDenomination: number | null;
  maxSenderDenomination: number | null;
  fixedRecipientDenominations: number[];

  // ── Reference / display ────────────────────────────────────────────────
  logoUrls: string[];
  country: { isoName: string; name: string; flagUrl: string };
  brand: { brandId: number; brandName: string; logoUrl: string };
  category?: { id: number; name: string } | null;
  redeemInstruction: { concise: string; verbose: string };
};

/**
 * The minimal pricing inputs the cost calculator needs, lifted out of a full
 * product for one recipient face value. Kept as a plain data shape (no Decimal,
 * no server-only) so it can cross the pure-calculator boundary and be built in
 * tests from fixtures. `senderBase` is resolved here (map for FIXED, FX for
 * RANGE) — the calculator itself does not touch the Reloadly product shape.
 */
export type ReloadlyCostInputs = {
  reloadlyProductId: number;
  productName: string;
  denominationType: ReloadlyDenominationType;
  recipientFaceValue: number;
  recipientCurrency: string;
  senderCurrency: string;
  senderBase: number;
  discountPercentage: number;
  senderFee: number;
  senderFeePercentage: number;
  recipientToSenderExchangeRate: number | null;
};

/**
 * Resolves the sender-currency base cost for a specific recipient face value.
 *  - FIXED: read the exact figure from fixedRecipientToSenderDenominationsMap
 *    (fall back to faceValue × FX rate only if the map lacks the key).
 *  - RANGE: faceValue × recipientCurrencyToSenderCurrencyExchangeRate.
 * Returns null when the value is not offered / cannot be resolved, so the sync
 * skips it rather than storing a guessed cost.
 */
export function buildReloadlyCostInputs(
  product: ReloadlyGiftCardProduct,
  recipientFaceValue: number,
): ReloadlyCostInputs | null {
  const denominationType: ReloadlyDenominationType =
    product.denominationType === "RANGE" ? "RANGE" : "FIXED";
  const rate = product.recipientCurrencyToSenderCurrencyExchangeRate;

  let senderBase: number | null = null;
  if (denominationType === "FIXED") {
    const map = product.fixedRecipientToSenderDenominationsMap ?? {};
    // Reloadly keys the map with a trailing ".0" (e.g. "10.0"); tolerate both.
    const key =
      Object.prototype.hasOwnProperty.call(map, String(recipientFaceValue))
        ? String(recipientFaceValue)
        : Object.prototype.hasOwnProperty.call(map, `${recipientFaceValue}.0`)
          ? `${recipientFaceValue}.0`
          : Object.keys(map).find((k) => Number(k) === recipientFaceValue);
    if (key != null && map[key] != null) {
      senderBase = map[key];
    } else if (rate != null && product.fixedRecipientDenominations.includes(recipientFaceValue)) {
      senderBase = recipientFaceValue * rate;
    }
  } else {
    const min = product.minRecipientDenomination;
    const max = product.maxRecipientDenomination;
    const inRange =
      (min == null || recipientFaceValue >= min) && (max == null || recipientFaceValue <= max);
    if (rate != null && inRange) senderBase = recipientFaceValue * rate;
  }

  if (senderBase == null || !Number.isFinite(senderBase)) return null;

  return {
    reloadlyProductId: product.productId,
    productName: product.productName,
    denominationType,
    recipientFaceValue,
    recipientCurrency: product.recipientCurrencyCode,
    senderCurrency: product.senderCurrencyCode,
    senderBase,
    discountPercentage: product.discountPercentage ?? 0,
    senderFee: product.senderFee ?? 0,
    senderFeePercentage: product.senderFeePercentage ?? 0,
    recipientToSenderExchangeRate: rate,
  };
}

// Reloadly returns a Spring-style page object — note `totalElements`, not
// `totalContent`.
type ReloadlyGiftCardProductsResponse = {
  content: ReloadlyGiftCardProduct[];
  totalPages: number;
  totalElements: number;
  number: number;
  size: number;
};

/**
 * Lists gift card products available from Reloadly, paginated.
 * Safe to call from an admin-only context to browse the catalog; not part
 * of any customer-facing or fulfillment path.
 */
export async function getGiftCardProducts(
  options?: {
    page?: number;
    size?: number;
    countryCode?: string;
  },
  environment: ReloadlyEnvironment = "live",
): Promise<ReloadlyGiftCardProductsResponse> {
  return reloadlyRequest<ReloadlyGiftCardProductsResponse>(
    getGiftCardsBaseUrl(environment),
    "/products",
    {
      query: {
        page: options?.page,
        size: options?.size,
        countryCode: options?.countryCode,
      },
    },
    environment,
  );
}

export async function getGiftCardProduct(
  productId: number,
  environment: ReloadlyEnvironment = "live",
): Promise<ReloadlyGiftCardProduct> {
  return reloadlyRequest<ReloadlyGiftCardProduct>(
    getGiftCardsBaseUrl(environment),
    `/products/${productId}`,
    {},
    environment,
  );
}

/** MAD (displayed "DH") is the storefront/reporting currency — a variant whose
 *  faceCurrency is MAD is priced for customers in MAD while the provider cost
 *  legitimately stays in the Reloadly recipient currency (USD, EUR, …). */
function isStorefrontCurrency(code: string): boolean {
  const c = code.trim().toUpperCase();
  return c === "MAD" || c === "DH";
}

/**
 * Pure, French-message validation that a Ghost variant fits a Reloadly product:
 * currency, country, and (crucially) that the face value is an actually-offered
 * denomination. Shared by the delivery pre-flight check, the admin availability
 * test, and the order-page mismatch warning so they all speak the same language.
 *
 * Currency rule: the provider (recipient) currency is the SOURCE COST currency
 * and does not have to equal the Ghost currency. A variant in MAD (storefront
 * currency) mapped to a USD/EUR/… product is a valid cross-currency mapping as
 * long as an internal FX rate exists to convert the cost into MAD — pass
 * `fxRatesToMad` (from pricing settings) to enforce that. A mismatch is only an
 * error when the variant claims a specific NON-storefront currency that differs
 * from the product's, or when no conversion rate is configured.
 */
export function validateReloadlyDenomination(
  product: ReloadlyGiftCardProduct,
  expected: { faceValue: number | null; currency?: string | null; countryCode?: string | null },
  fxRatesToMad?: Record<string, number>,
): { ok: boolean; issues: string[]; infos: string[] } {
  const issues: string[] = [];
  const infos: string[] = [];
  const cur = product.recipientCurrencyCode;

  if (expected.currency && cur !== expected.currency) {
    if (!isStorefrontCurrency(expected.currency)) {
      // The variant claims an explicit provider currency that doesn't match —
      // a genuine mapping error (wrong product / wrong regional edition).
      issues.push(`Devise attendue ${expected.currency}, produit Reloadly en ${cur}.`);
    } else if (isStorefrontCurrency(cur)) {
      // Provider is already in MAD — nothing to convert.
    } else if (fxRatesToMad) {
      const rate = fxRatesToMad[cur.trim().toUpperCase()];
      if (rate == null || !Number.isFinite(rate) || rate <= 0) {
        issues.push(
          `Aucun taux de change ${cur} → MAD configuré. Ajoutez-le dans Tarification pour convertir le coût fournisseur.`,
        );
      } else {
        infos.push(`Coût fournisseur converti de ${cur} vers MAD.`);
      }
    } else {
      // No FX table supplied (caller can't check) — informational only.
      infos.push(`Coût fournisseur en ${cur}, converti en MAD via le taux interne.`);
    }
  }
  if (expected.countryCode && product.country?.isoName !== expected.countryCode) {
    issues.push(`Pays attendu ${expected.countryCode}, produit Reloadly ${product.country?.isoName ?? "?"}.`);
  }
  if (expected.faceValue != null) {
    if (product.denominationType === "FIXED") {
      const denoms = product.fixedRecipientDenominations ?? [];
      if (!denoms.includes(expected.faceValue)) {
        issues.push(
          `${expected.faceValue} ${cur} non proposé par Reloadly pour ce produit — disponibles : ${
            denoms.length ? `${denoms.join(", ")} ${cur}` : "aucune"
          }.`,
        );
      }
    } else {
      const min = product.minRecipientDenomination;
      const max = product.maxRecipientDenomination;
      if ((min != null && expected.faceValue < min) || (max != null && expected.faceValue > max)) {
        issues.push(
          `${expected.faceValue} ${cur} hors de la plage proposée par Reloadly (${min ?? "?"}–${max ?? "?"} ${cur}).`,
        );
      }
    }
  }
  return { ok: issues.length === 0, issues, infos };
}

export type ReloadlyAccountBalance = {
  balance: number;
  currencyCode: string;
  currencyName: string;
  updatedAt: string;
};

/**
 * Reads the Reloadly wallet balance for the configured account. Read-only and
 * safe for an admin health/overview view — spends nothing, places no order.
 */
export async function getAccountBalance(
  environment: ReloadlyEnvironment = "live",
): Promise<ReloadlyAccountBalance> {
  return reloadlyRequest<ReloadlyAccountBalance>(
    getGiftCardsBaseUrl(environment),
    "/accounts/balance",
    {},
    environment,
  );
}

export type PlaceGiftCardOrderInput = {
  productId: number;
  countryCode: string;
  quantity: number;
  unitPrice: number;
  customIdentifier: string;
  senderName: string;
  recipientEmail: string;
};

// Verified 2026-07-07 against a real sandbox order (transactionId 72423):
// POST /orders returns the full transaction immediately, including status
// ("SUCCESSFUL" for an instantly-fulfilled order — no polling needed in the
// common case) and wallet balanceInfo. The redeem code itself is NOT in this
// response; it must be fetched separately via getGiftCardOrderCards().
export type ReloadlyGiftCardOrderResult = {
  transactionId: number;
  amount: number;
  discount: number;
  currencyCode: string;
  fee: number;
  status: "SUCCESSFUL" | "PROCESSING" | "PENDING" | "FAILED" | string;
  customIdentifier: string;
  transactionCreatedTime: string;
  product: {
    productId: number;
    productName: string;
    countryCode: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    currencyCode: string;
  };
  balanceInfo: {
    oldBalance: number;
    newBalance: number;
    cost: number;
    currencyCode: string;
  };
};

/**
 * Places a live/sandbox Reloadly order and spends from the Reloadly wallet.
 * Called from deliverOrder() via the Reloadly SupplierProvider — this is real
 * money on the live environment.
 *
 * IMPORTANT: `customIdentifier` is a free-form reference field, NOT a
 * server-enforced idempotency key (unlike FazerCards' `Idempotency-Key`
 * header, which Reloadly's Gift Cards API does not offer). Reloadly will
 * happily place a SECOND order for the same customIdentifier. Callers must
 * therefore check {@link findGiftCardOrderByCustomIdentifier} first and must
 * never blindly retry a call whose outcome is unknown.
 */
export async function placeGiftCardOrder(
  input: PlaceGiftCardOrderInput,
  environment: ReloadlyEnvironment = "live",
): Promise<ReloadlyGiftCardOrderResult> {
  return reloadlyRequest<ReloadlyGiftCardOrderResult>(
    getGiftCardsBaseUrl(environment),
    "/orders",
    {
      method: "POST",
      body: input,
      timeoutMs: RELOADLY_ORDER_TIMEOUT_MS,
    },
    environment,
  );
}

/**
 * Looks up an already-placed transaction by the `customIdentifier` we sent,
 * via the transaction report endpoint. This is the (only) way to make a
 * Reloadly purchase effectively idempotent: before placing an order for a
 * given scope, ask whether that scope already bought something.
 *
 * Tolerates both response shapes the report endpoint is known to return: a
 * bare array, and a Spring-style page object with `content`. Returns null when
 * nothing matches. Read-only — spends nothing.
 */
export async function findGiftCardOrderByCustomIdentifier(
  customIdentifier: string,
  environment: ReloadlyEnvironment = "live",
): Promise<ReloadlyGiftCardOrderResult | null> {
  const response = await reloadlyRequest<
    ReloadlyGiftCardOrderResult[] | { content?: ReloadlyGiftCardOrderResult[] }
  >(
    getGiftCardsBaseUrl(environment),
    "/reports/transactions",
    { query: { customIdentifier, size: 5 } },
    environment,
  );
  const list = Array.isArray(response) ? response : (response?.content ?? []);
  // Defensive: the endpoint filters server-side, but never reuse a
  // transaction whose identifier does not match ours exactly.
  return list.find((tx) => tx?.customIdentifier === customIdentifier) ?? null;
}

/**
 * Status/report lookup for a previously placed order. Verified endpoint:
 * `/reports/transactions/{id}` — NOT `/orders/transactions/{id}`, which
 * 404s despite appearing in some third-party writeups.
 */
export async function getGiftCardOrderStatus(
  transactionId: number,
  environment: ReloadlyEnvironment = "live",
): Promise<ReloadlyGiftCardOrderResult> {
  return reloadlyRequest<ReloadlyGiftCardOrderResult>(
    getGiftCardsBaseUrl(environment),
    `/reports/transactions/${transactionId}`,
    {},
    environment,
  );
}

export type ReloadlyGiftCardOrderCard = {
  cardNumber: string | null;
  pinCode: string | null;
};

/**
 * Fetches the actual redeem code(s) for a completed order. Verified
 * endpoint: `GET /orders/transactions/{transactionId}/cards`. Only
 * meaningful once the order's status is "SUCCESSFUL" — call
 * getGiftCardOrderStatus() first if placeGiftCardOrder() didn't already
 * return that status synchronously.
 */
export async function getGiftCardOrderCards(
  transactionId: number,
  environment: ReloadlyEnvironment = "live",
): Promise<ReloadlyGiftCardOrderCard[]> {
  return reloadlyRequest<ReloadlyGiftCardOrderCard[]>(
    getGiftCardsBaseUrl(environment),
    `/orders/transactions/${transactionId}/cards`,
    {},
    environment,
  );
}
