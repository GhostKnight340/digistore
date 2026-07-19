/**
 * Reloadly implementation of the {@link SupplierProvider} contract.
 * Thin orchestration over src/lib/reloadly/* — all HTTP/auth stays in the
 * Reloadly client module; all Ghost-side persistence stays in fulfillment.
 */
import "server-only";
import {
  getReloadlyEnvironment,
  isReloadlyConfigured,
} from "@/lib/reloadly/config";
import {
  describeReloadlyError,
  isReloadlyNetworkError,
  ReloadlyApiError,
} from "@/lib/reloadly/client";
import {
  buildReloadlyCostInputs,
  findGiftCardOrderByCustomIdentifier,
  getAccountBalance,
  getGiftCardOrderCards,
  getGiftCardOrderStatus,
  getGiftCardProduct,
  getGiftCardProducts,
  placeGiftCardOrder,
  validateReloadlyDenomination,
  type ReloadlyGiftCardOrderCard,
} from "@/lib/reloadly/operations";
import { getPricingSettings } from "@/lib/db/pricing-settings";
import { recordReloadlyCostReconciliation } from "@/lib/db/pricing";
import type { DeliveredFieldDTO } from "@/lib/dto";
import type {
  SupplierProvider,
  SupplierPurchaseRequest,
  SupplierPurchaseResult,
} from "../registry";
import { looksLikeUrl, primaryDeliveryValue } from "../deliveryFields";
import {
  classifyPurchaseFailure,
  SupplierPurchaseUncertainError,
  uncertainPurchaseMessage,
} from "../purchaseOutcome";

const RELOADLY_SENDER_NAME = "ghost.ma";
const STATUS_POLL_ATTEMPTS = 3;
const STATUS_POLL_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalizes Reloadly cards into labelled fields by meaning rather than
 * concatenating unrelated values into a malformed string. A URL-shaped
 * cardNumber becomes a redemption link (`url`); otherwise it is the redeem
 * `code`. `pinCode`, when present, is a separate PIN.
 */
function normalizeReloadlyCards(cards: ReloadlyGiftCardOrderCard[]): DeliveredFieldDTO[] {
  return cards
    .map((card) => {
      const field: DeliveredFieldDTO = {};
      const cardNumber = card.cardNumber?.trim();
      const pinCode = card.pinCode?.trim();
      if (cardNumber) {
        if (looksLikeUrl(cardNumber)) field.url = cardNumber;
        else field.code = cardNumber;
      }
      if (pinCode) field.pin = pinCode;
      return field;
    })
    .filter((field) => field.code || field.pin || field.url);
}

type ReloadlyEntryParams = {
  reloadlyProductId: number;
  reloadlyCountryCode: string;
};

function parseEntryParams(raw: Record<string, unknown>): ReloadlyEntryParams {
  const productId = raw.reloadlyProductId;
  const countryCode = raw.reloadlyCountryCode;
  if (typeof productId !== "number" || !Number.isFinite(productId)) {
    throw new Error("Configuration Reloadly invalide pour cet article.");
  }
  if (typeof countryCode !== "string" || !countryCode.trim()) {
    throw new Error("Code pays Reloadly manquant pour cette variante.");
  }
  return { reloadlyProductId: productId, reloadlyCountryCode: countryCode };
}

export const reloadlyProvider: SupplierProvider = {
  slug: "reloadly",
  name: "Reloadly",
  description:
    "Cartes cadeaux internationales (API Gift Cards). Achat au moment de la livraison, débité du portefeuille Reloadly.",
  accentColor: "#E8443A",
  initials: "RL",
  credentialEnvVars: ["RELOADLY_CLIENT_ID", "RELOADLY_CLIENT_SECRET", "RELOADLY_ENV"],
  supportsBalance: true,

  environment() {
    return getReloadlyEnvironment();
  },

  isConfigured() {
    return isReloadlyConfigured();
  },

  /** Read-only: one cheap catalog read (auth proof) + a balance read. */
  async testConnection() {
    const startedAt = Date.now();
    const details: { label: string; value: string }[] = [
      { label: "Environnement", value: getReloadlyEnvironment() },
    ];
    if (!isReloadlyConfigured()) {
      return {
        ok: false,
        message: "Reloadly n’est pas configuré (identifiants manquants).",
        responseTimeMs: 0,
        details,
      };
    }
    try {
      await getGiftCardProducts({ size: 1 });
      details.push({ label: "Catalogue", value: "accessible" });
      try {
        const balance = await getAccountBalance();
        details.push({ label: "Solde", value: `${balance.balance} ${balance.currencyCode}` });
      } catch {
        details.push({ label: "Solde", value: "indisponible (permission)" });
      }
      return {
        ok: true,
        message: "Connexion Reloadly opérationnelle.",
        responseTimeMs: Date.now() - startedAt,
        details,
      };
    } catch (error) {
      return {
        ok: false,
        message: describeReloadlyError("health", error),
        responseTimeMs: Date.now() - startedAt,
        details,
      };
    }
  },

  async getBalance() {
    const balance = await getAccountBalance();
    return { amount: String(balance.balance), currency: balance.currencyCode };
  },

  /**
   * Read-only mapping check against the Reloadly catalog: the product id must
   * exist, be ACTIVE, match the configured country, and offer the mapped
   * denomination. Returns authoritative name/region/cost for prefill. Never
   * places an order.
   */
  async validateMapping(input) {
    const productId = Number(input.supplierProductId);
    if (!Number.isInteger(productId) || productId <= 0) {
      return { ok: false, message: "Identifiant produit Reloadly invalide (nombre attendu)." };
    }
    let product;
    try {
      product = await getGiftCardProduct(productId);
    } catch (error) {
      return { ok: false, message: describeReloadlyError("validate-mapping", error) };
    }
    if (product.status !== "ACTIVE") {
      return {
        ok: false,
        message: `Produit Reloadly « ${product.productName} » indisponible (statut ${product.status}).`,
      };
    }
    const { fxRatesToMad } = await getPricingSettings();
    const { ok, issues, infos } = validateReloadlyDenomination(
      product,
      {
        faceValue: input.faceValue,
        currency: input.faceCurrency,
        countryCode: input.supplierRegion,
      },
      fxRatesToMad,
    );
    // Authoritative cost estimate for the mapped denomination (sender currency).
    const costInputs =
      input.faceValue != null ? buildReloadlyCostInputs(product, input.faceValue) : null;
    const refresh = {
      supplierProductName: product.productName,
      supplierRegion: product.country?.isoName,
      ...(costInputs
        ? {
            costAmount: Math.round(costInputs.senderBase * 100) / 100,
            costCurrency: costInputs.senderCurrency,
          }
        : {}),
    };
    if (!ok) return { ok: false, message: issues.join(" "), refresh };
    return {
      ok: true,
      message:
        `Produit « ${product.productName} » (${product.country?.isoName ?? "?"}) disponible.` +
        (infos.length ? ` ${infos.join(" ")}` : ""),
      refresh,
    };
  },

  /**
   * Places one Reloadly gift-card order and retrieves its redeem code.
   * Pre-flights the denomination BEFORE spending from the wallet, looks up
   * any order already placed for this scope (Reloadly has no idempotency
   * header — see findGiftCardOrderByCustomIdentifier), then briefly retries
   * the status check if the order isn't immediately SUCCESSFUL (a normal
   * order returns SUCCESSFUL synchronously).
   *
   * Failure modes are NOT equal: a purchase call that timed out or 5xx'd may
   * still have been processed, and is surfaced as
   * {@link SupplierPurchaseUncertainError} so the admin reconciles instead of
   * blindly re-clicking "Livrer". Everything after a successful placement is
   * safe to retry — the lookup above will find the transaction.
   */
  async purchase(request: SupplierPurchaseRequest): Promise<SupplierPurchaseResult> {
    const params = parseEntryParams(request.entryParams);
    if (request.context.faceValue == null) {
      throw new Error("Valeur faciale manquante pour la variante Reloadly.");
    }

    // Pre-flight: confirm the face value is an actually-offered denomination.
    // Turns Reloadly's opaque "400 Invalid price" into an actionable message
    // and avoids a wasted order attempt.
    const product = await getGiftCardProduct(params.reloadlyProductId);
    const { fxRatesToMad } = await getPricingSettings();
    const { ok, issues } = validateReloadlyDenomination(
      product,
      {
        faceValue: request.context.faceValue,
        currency: request.context.faceCurrency,
        countryCode: params.reloadlyCountryCode,
      },
      fxRatesToMad,
    );
    if (!ok) throw new Error(issues.join(" "));

    // Poor-man's idempotency. Reloadly has no Idempotency-Key header and its
    // `customIdentifier` is only a reference field, so the ONLY way to avoid
    // buying twice for the same slot is to ask first whether this scope
    // already produced a transaction. If the lookup itself fails we abort
    // WITHOUT ordering: nothing has been spent yet, so this is a clean,
    // safely-retryable failure.
    let order: Awaited<ReturnType<typeof placeGiftCardOrder>>;
    let existing: Awaited<ReturnType<typeof findGiftCardOrderByCustomIdentifier>>;
    try {
      existing = await findGiftCardOrderByCustomIdentifier(request.idempotencyScope);
    } catch (error) {
      throw new Error(
        "Impossible de vérifier auprès de Reloadly si cette commande a déjà été passée " +
          `(${describeReloadlyError("order-lookup", error)}) — aucune commande n’a été envoyée, réessayez.`,
      );
    }

    if (existing) {
      // Same slot, already bought: reuse it instead of spending again.
      order = existing;
    } else {
      try {
        order = await placeGiftCardOrder({
          productId: params.reloadlyProductId,
          countryCode: params.reloadlyCountryCode,
          quantity: 1,
          unitPrice: request.context.faceValue,
          customIdentifier: request.idempotencyScope,
          senderName: RELOADLY_SENDER_NAME,
          recipientEmail: request.context.customerEmail,
        });
      } catch (error) {
        const certainty = classifyPurchaseFailure({
          isNetworkError: isReloadlyNetworkError(error),
          status: error instanceof ReloadlyApiError ? error.status : null,
        });
        if (certainty === "uncertain") {
          throw new SupplierPurchaseUncertainError(
            uncertainPurchaseMessage({
              supplierName: "Reloadly",
              reconciliationRef: request.idempotencyScope,
              detail: describeReloadlyError("purchase", error),
            }),
            request.idempotencyScope,
          );
        }
        // Definitively rejected before any spend — normal retryable failure.
        throw new Error(describeReloadlyError("purchase", error));
      }
    }

    let status = order.status;
    for (
      let attempt = 0;
      status !== "SUCCESSFUL" && status !== "FAILED" && attempt < STATUS_POLL_ATTEMPTS;
      attempt += 1
    ) {
      await sleep(STATUS_POLL_DELAY_MS);
      status = (await getGiftCardOrderStatus(order.transactionId)).status;
    }
    if (status !== "SUCCESSFUL") {
      throw new Error(`Commande Reloadly non aboutie (statut: ${status}).`);
    }

    const cards = await getGiftCardOrderCards(order.transactionId);
    const fields = normalizeReloadlyCards(cards);
    const primary = primaryDeliveryValue(fields);
    if (fields.length === 0 || !primary) {
      throw new Error("Reloadly n’a retourné aucun code pour cette commande.");
    }

    const orderId = request.context.orderId;
    return {
      fields,
      primary,
      providerRefs: { reloadlyTransactionId: order.transactionId },
      providerRef: String(order.transactionId),
      // §10 cost reconciliation — estimated (synced catalog) vs actual
      // (balanceInfo.cost). Append-only audit; never affects the delivered
      // order or what the customer sees.
      afterDelivered: () => {
        void recordReloadlyCostReconciliation({
          orderId,
          reloadlyTransactionId: order.transactionId,
          reloadlyProductId: params.reloadlyProductId,
          recipientFaceValue: request.context.faceValue,
          actualProviderCost: order.balanceInfo?.cost ?? order.amount ?? 0,
          currency: order.balanceInfo?.currencyCode ?? order.currencyCode,
        });
      },
    };
  },
};
