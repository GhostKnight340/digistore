/**
 * FazerCards implementation of the {@link SupplierProvider} contract.
 * Thin orchestration over src/lib/fazercards/* — HTTP/auth stays in the
 * FazerCards client module. No sandbox exists: every purchase is real.
 */
import "server-only";
import { isFazerCardsConfigured } from "@/lib/fazercards/config";
import { isPreviewDeployment } from "@/lib/env";
import { describeFazerCardsError } from "@/lib/fazercards/client";
import {
  getBalance,
  getGiftCardOffers,
  getOrder,
  getProfile,
  getTopupOffers,
  placeGiftCardOrder,
  placeTopupOrder,
  type FazerCardsOrder,
} from "@/lib/fazercards/operations";
import type { DeliveredFieldDTO } from "@/lib/dto";
import type {
  SupplierProvider,
  SupplierPurchaseRequest,
  SupplierPurchaseResult,
} from "../registry";
import { looksLikeUrl, primaryDeliveryValue } from "../deliveryFields";

// FazerCards orders regularly come back "processing" and complete async —
// poll longer than Reloadly. Retrying after a timeout is safe: the
// Idempotency-Key replays the SAME provider order instead of buying again.
const STATUS_POLL_ATTEMPTS = 10;
const STATUS_POLL_DELAY_MS = 3000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Availability gate for FazerCards — deliberately STRICTER than "is a key set".
 *
 * FazerCards has no sandbox: any configured key is a live key and any order
 * spends real USD from the shared wallet. A warning at boot is not a guard, so
 * staging/preview deployments report the supplier as unconfigured and can
 * therefore never reach a purchase, whatever env vars leaked into them.
 *
 * Reporting "unconfigured" (rather than throwing) is what makes this degrade
 * gracefully: eligibility resolves to `supplier_unconfigured`, the variant
 * falls back to manual fulfilment, and the admin UI shows the usual
 * credentials-missing state instead of an error.
 */
function isFazerCardsAvailable(): boolean {
  if (isPreviewDeployment()) return false;
  return isFazerCardsConfigured();
}

/** Why FazerCards is unavailable, in admin-facing French. */
function unavailableMessage(): string {
  if (isPreviewDeployment()) {
    return "FazerCards est désactivé hors production : aucun sandbox n’existe, chaque commande dépense de l’argent réel. Livrez manuellement sur cet environnement.";
  }
  return "FazerCards n’est pas configuré (FAZERCARDS_API_KEY manquant).";
}

type FazerCardsEntryParams = {
  kind: string; // "gift_card" | "topup" | "game_key"
  categoryId: string;
  offerId: string;
};

function parseEntryParams(raw: Record<string, unknown>): FazerCardsEntryParams {
  const mapping = raw.fazercards;
  if (!mapping || typeof mapping !== "object") {
    throw new Error("Configuration FazerCards invalide pour cet article.");
  }
  const { kind, categoryId, offerId } = mapping as Record<string, unknown>;
  if (
    typeof kind !== "string" ||
    typeof categoryId !== "string" ||
    !categoryId.trim() ||
    typeof offerId !== "string" ||
    !offerId.trim()
  ) {
    throw new Error("Configuration FazerCards incomplète pour cette variante.");
  }
  return { kind, categoryId, offerId };
}

/**
 * Extracts delivered codes from a completed FazerCards order. The public spec
 * leaves the order object untyped and shows no completed example, so this
 * scans the common shapes tolerantly (arrays named codes/cards/keys/items of
 * strings or of objects with code/pin/serial/key/url members, at the root or
 * under payload/data/result). Unrecognized shapes make the purchase fail
 * loudly rather than delivering an empty payload — revisit once a live order
 * has been captured (docs/fazercards-integration.md § Open questions).
 */
function normalizeFazerCardsOrderPayload(order: FazerCardsOrder): DeliveredFieldDTO[] {
  const fields: DeliveredFieldDTO[] = [];

  const pushValue = (raw: unknown) => {
    if (typeof raw === "string" && raw.trim()) {
      const value = raw.trim();
      fields.push(looksLikeUrl(value) ? { url: value } : { code: value });
      return;
    }
    if (raw && typeof raw === "object") {
      const item = raw as Record<string, unknown>;
      const field: DeliveredFieldDTO = {};
      const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
      const code =
        str(item.code) ?? str(item.key) ?? str(item.serial) ?? str(item.redeem_code) ?? str(item.card_number) ?? str(item.value);
      const pin = str(item.pin) ?? str(item.pin_code);
      const url = str(item.url) ?? str(item.redeem_url) ?? str(item.link);
      if (code) {
        if (!url && looksLikeUrl(code)) field.url = code;
        else field.code = code;
      }
      if (pin) field.pin = pin;
      if (url) field.url = url;
      if (field.code || field.pin || field.url) fields.push(field);
    }
  };

  const containers: Record<string, unknown>[] = [order];
  for (const key of ["payload", "data", "result"] as const) {
    const nested = order[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      containers.push(nested as Record<string, unknown>);
    }
  }
  for (const container of containers) {
    for (const key of ["codes", "cards", "keys", "items", "gift_cards"]) {
      const list = container[key];
      if (Array.isArray(list)) list.forEach(pushValue);
    }
    // Single-code shapes: { code: "…" } directly on the container.
    if (fields.length === 0) pushValue(container);
  }

  return fields;
}

export const fazercardsProvider: SupplierProvider = {
  slug: "fazercards",
  name: "FazerCards",
  description:
    "Cartes cadeaux, recharges de jeux et clés (API reseller). Portefeuille prépayé en USD — aucun environnement de test.",
  accentColor: "#26A17B",
  initials: "FZ",
  credentialEnvVars: ["FAZERCARDS_API_KEY", "FAZERCARDS_WEBHOOK_SECRET"],
  supportsBalance: true,

  environment() {
    // FazerCards has no sandbox — an available key is always live.
    return isFazerCardsAvailable() ? "live" : null;
  },

  isConfigured() {
    return isFazerCardsAvailable();
  },

  /** Read-only: profile (auth + plan/permissions) + balance. Never orders. */
  async testConnection() {
    const startedAt = Date.now();
    const details: { label: string; value: string }[] = [];
    if (!isFazerCardsAvailable()) {
      return {
        ok: false,
        message: unavailableMessage(),
        responseTimeMs: 0,
        details,
      };
    }
    try {
      const profile = await getProfile();
      details.push({ label: "Plan", value: profile.plan || "—" });
      details.push({
        label: "Abonnement",
        value: profile.subscriptionActive ? "actif" : "inactif (403 sur le catalogue/commandes)",
      });
      try {
        const balance = await getBalance();
        details.push({ label: "Solde", value: `${balance.balance} ${balance.currency}` });
      } catch {
        details.push({ label: "Solde", value: "indisponible" });
      }
      return {
        ok: true,
        message: profile.subscriptionActive
          ? "Connexion FazerCards opérationnelle."
          : "Clé valide, mais l’abonnement FazerCards est inactif.",
        responseTimeMs: Date.now() - startedAt,
        details,
      };
    } catch (error) {
      return {
        ok: false,
        message: describeFazerCardsError("health", error),
        responseTimeMs: Date.now() - startedAt,
        details,
      };
    }
  },

  async getBalance() {
    const balance = await getBalance();
    return { amount: balance.balance, currency: balance.currency };
  },

  /**
   * Read-only mapping check against the FazerCards catalog: lists the mapped
   * category's offers and confirms the offer/card id exists (with stock for
   * gift cards). Never places an order. Limitation: `game_key` mappings are
   * not yet checkable (no gamekeys catalog operation wired) — reported as a
   * failure with an explicit message rather than a false "ok".
   */
  async validateMapping(input) {
    if (!isFazerCardsAvailable()) {
      return { ok: false, message: unavailableMessage() };
    }
    if (!input.supplierCategoryId?.trim()) {
      return { ok: false, message: "Category/Game ID FazerCards manquant sur le mapping." };
    }
    try {
      if (input.supplierKind === "gift_card") {
        const catalog = await getGiftCardOffers(input.supplierCategoryId);
        const offer = catalog.offers.find((o) => o.card_id === input.supplierProductId);
        if (!offer) {
          return {
            ok: false,
            message: `Carte « ${input.supplierProductId} » introuvable dans la catégorie ${catalog.name}.`,
          };
        }
        const refresh = {
          supplierProductName: offer.name,
          costAmount: Number(offer.price_usd),
          costCurrency: "USD",
        };
        if (offer.stock <= 0) {
          return { ok: false, message: `« ${offer.name} » est en rupture de stock chez FazerCards.`, refresh };
        }
        return {
          ok: true,
          message: `« ${offer.name} » disponible (stock : ${offer.stock}, coût ${offer.price_usd} USD).`,
          refresh,
        };
      }
      if (input.supplierKind === "topup") {
        const catalog = await getTopupOffers(input.supplierCategoryId);
        const offer = catalog.offers.find((o) => o.offer_id === input.supplierProductId);
        if (!offer) {
          return {
            ok: false,
            message: `Offre « ${input.supplierProductId} » introuvable dans ${catalog.name}.`,
          };
        }
        const requiredFields = catalog.fields.map((field) => field.key).join(", ");
        return {
          ok: true,
          message:
            `« ${offer.name} » disponible (coût ${offer.price_usd} USD).` +
            (requiredFields
              ? ` Attention : champs acheteur requis (${requiredFields}) — non collectés au checkout pour l’instant.`
              : ""),
          refresh: {
            supplierProductName: offer.name,
            costAmount: Number(offer.price_usd),
            costCurrency: "USD",
          },
        };
      }
      return {
        ok: false,
        message:
          "Vérification non prise en charge pour ce type FazerCards (game_key) — validez manuellement dans le tableau de bord fournisseur.",
      };
    } catch (error) {
      return { ok: false, message: describeFazerCardsError("validate-mapping", error) };
    }
  },

  /**
   * Places one FazerCards order (real wallet spend) and waits briefly for
   * completion. A "processing" timeout throws — retrying is safe because the
   * Idempotency-Key replays the same provider order.
   */
  async purchase(request: SupplierPurchaseRequest): Promise<SupplierPurchaseResult> {
    // Last line of defence: never spend real money from a preview/staging
    // deploy, even if something bypassed the eligibility checks.
    if (!isFazerCardsAvailable()) throw new Error(unavailableMessage());

    const params = parseEntryParams(request.entryParams);
    const idempotencyKey = `ghost-${request.idempotencyScope}`;

    const placed =
      params.kind === "topup"
        ? await placeTopupOrder({
            categoryId: params.categoryId,
            offerId: params.offerId,
            // Buyer fields (player_id…) are a later phase — checkout does not
            // collect them yet.
            fields: {},
            idempotencyKey,
          })
        : await placeGiftCardOrder({
            categoryId: params.categoryId,
            cardId: params.offerId,
            quantity: 1,
            idempotencyKey,
          });

    let order = placed.order;
    for (
      let attempt = 0;
      order.status !== "completed" && order.status !== "failed" && attempt < STATUS_POLL_ATTEMPTS;
      attempt += 1
    ) {
      await sleep(STATUS_POLL_DELAY_MS);
      order = (await getOrder(order.id)).order;
    }

    if (order.status === "failed") {
      throw new Error(`Commande FazerCards échouée (${order.id}).`);
    }
    if (order.status !== "completed") {
      throw new Error(
        `Commande FazerCards toujours en traitement (${order.id}, statut: ${order.status}). ` +
          "Relancez la livraison dans quelques minutes — la même commande fournisseur sera reprise, sans double achat.",
      );
    }

    if (params.kind === "topup") {
      const fields: DeliveredFieldDTO[] = [
        { instructions: `Recharge livrée par le fournisseur (commande ${order.id}).` },
      ];
      return {
        fields,
        primary: order.id,
        providerRefs: { fazercardsOrderId: order.id },
        providerRef: order.id,
      };
    }

    const fields = normalizeFazerCardsOrderPayload(order);
    const primary = primaryDeliveryValue(fields);
    if (fields.length === 0 || !primary) {
      // Codes ARE the payload — error-level log for one-off diagnosis only.
      console.error("[fazercards:unrecognized-order-payload]", JSON.stringify(order).slice(0, 2000));
      throw new Error(
        `Commande FazerCards ${order.id} terminée mais aucun code reconnu dans la réponse. ` +
          "Récupérez le code dans le tableau de bord FazerCards et livrez-le manuellement.",
      );
    }

    return {
      fields,
      primary,
      providerRefs: { fazercardsOrderId: order.id },
      providerRef: order.id,
    };
  },
};
