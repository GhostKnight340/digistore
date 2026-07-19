/**
 * Supplier fulfillment engine — the single path by which Ghost.ma spends
 * supplier money.
 *
 * Wraps every provider purchase in the ledger protocol so that the ordering of
 * side effects is correct by construction:
 *
 *     claim slot (DB insert, unique)      ← concurrency guard
 *        └─ mark submitted (DB write)     ← evidence, BEFORE any network I/O
 *              └─ provider.purchase()     ← the only money-spending call
 *                    └─ record outcome    ← completed | failed_clean | uncertain
 *
 * The two rules that everything else depends on:
 *
 *  1. **Never dispatch without a claimed, dispatchable slot.** If a row already
 *     exists in a non-dispatchable state, a purchase already happened (or may
 *     have happened) and we must reconcile instead of buying again.
 *  2. **Never invent a new idempotency key.** The key is derived from the slot
 *     and read back from the ledger on every retry. A fresh key after a timeout
 *     is a second real charge.
 *
 * Delivery itself is deliberately NOT done here — see `deliverSlot` in
 * src/lib/db/fulfillment.ts, which writes DeliveredCode and flips the ledger to
 * `delivered` inside one transaction.
 */
import "server-only";
import { getSupplierProvider, type SupplierSlug } from "./registry";
import { isSupplierEnabled, recordSupplierLog } from "@/lib/db/supplierManagement";
import {
  FULFILLMENT_STATUS,
  claimSlot,
  markCompleted,
  markFailedClean,
  markSubmitted,
  markUncertain,
  type LedgerRow,
} from "./ledger";
import {
  NormalizedSupplierError,
  isNormalizedSupplierError,
  type SupplierErrorCode,
} from "./errors";
import { isSupplierPurchaseUncertain } from "./purchaseOutcome";

export type FulfillSlotInput = {
  orderId: string;
  orderItemId: string;
  slotIndex: number;
  supplier: SupplierSlug;
  serviceType: string | null;
  entryParams: Record<string, unknown>;
  context: {
    customerEmail: string;
    faceValue: number | null;
    faceCurrency: string;
    productName: string | null;
  };
};

export type FulfillSlotResult =
  /** Goods in hand; caller should now deliver from the ledger row. */
  | { kind: "ready"; fulfillmentId: string }
  /** Already delivered earlier — caller must NOT deliver again. */
  | { kind: "already_delivered"; fulfillmentId: string }
  /** Supplier working on it; reconciliation will finish the job. */
  | { kind: "processing"; fulfillmentId: string; message: string }
  /**
   * Definitively refused before charging. This is the ONLY failure kind from
   * which the caller may fail over to a backup supplier.
   */
  | {
      kind: "failed_clean";
      fulfillmentId: string;
      code: SupplierErrorCode;
      message: string;
    }
  /**
   * Outcome unknown — may already be charged. The caller must NOT retry, must
   * NOT fail over, and must surface the reconciliation instruction.
   */
  | { kind: "uncertain"; fulfillmentId: string; message: string }
  /** Could not even start (supplier disabled/misconfigured). No money at risk. */
  | { kind: "blocked"; message: string };

/**
 * Fulfils exactly one deliverable unit.
 *
 * Safe to call repeatedly for the same slot: the second call observes the
 * ledger and returns the existing state rather than purchasing again. That
 * property is what makes webhook retries, admin double-clicks and cron
 * overlaps harmless.
 */
export async function fulfillSlot(input: FulfillSlotInput): Promise<FulfillSlotResult> {
  const provider = getSupplierProvider(input.supplier);

  // ── Pre-flight gates. All of these must run BEFORE claiming a slot, so a
  // blocked supplier does not litter the ledger with dead rows.
  if (!(await isSupplierEnabled(input.supplier))) {
    return {
      kind: "blocked",
      message: `${provider.name} est désactivé dans Fournisseurs — réactivez-le ou livrez ce code manuellement.`,
    };
  }
  if (!provider.isConfigured()) {
    return {
      kind: "blocked",
      message: `${provider.name} n’est pas disponible sur cet environnement — livrez ce code manuellement.`,
    };
  }

  // ── Claim. The DB unique index on (orderItemId, slotIndex) is what makes
  // two concurrent callers resolve to one purchase.
  const claim = await claimSlot({
    orderId: input.orderId,
    orderItemId: input.orderItemId,
    slotIndex: input.slotIndex,
    supplier: input.supplier,
    serviceType: input.serviceType,
  });

  if (!claim.canDispatch) {
    return describeExistingSlot(claim.row);
  }

  const startedAt = Date.now();
  // Written BEFORE the request leaves. If the process dies on the next line we
  // still know a purchase may be in flight, and against which key.
  await markSubmitted(claim.row.id);

  try {
    const result = await provider.purchase({
      // Read back from the ledger — never recomputed, never regenerated.
      idempotencyScope: claim.row.idempotencyKey,
      entryParams: input.entryParams,
      context: {
        orderId: input.orderId,
        customerEmail: input.context.customerEmail,
        faceValue: input.context.faceValue,
        faceCurrency: input.context.faceCurrency,
      },
    });

    if (result.fields.length === 0) {
      // Provider reported success with nothing to deliver. Treat as uncertain,
      // not as failure: the order may well exist and be paid for.
      await markUncertain({
        id: claim.row.id,
        errorCode: "malformed_response",
        message:
          `${provider.name} a renvoyé une commande sans code exploitable (${result.providerRef}). ` +
          "Vérifiez le tableau de bord fournisseur avant toute nouvelle tentative.",
        providerOrderId: result.providerRef || null,
      });
      void logPurchase(input, provider.name, false, startedAt, "malformed_response");
      return {
        kind: "uncertain",
        fulfillmentId: claim.row.id,
        message: `${provider.name} : commande créée mais payload non reconnu — réconciliation requise.`,
      };
    }

    await markCompleted({
      id: claim.row.id,
      providerOrderId: result.providerRef || null,
      providerStatus: "completed",
      deliveryPayload: result.fields,
    });
    void logPurchase(input, provider.name, true, startedAt, null, result.providerRef);
    return { kind: "ready", fulfillmentId: claim.row.id };
  } catch (error) {
    return handlePurchaseError({
      error,
      row: claim.row,
      providerName: provider.name,
      input,
      startedAt,
    });
  }
}

/** Maps an existing, non-dispatchable ledger row onto a result. */
function describeExistingSlot(row: LedgerRow): FulfillSlotResult {
  switch (row.status) {
    case FULFILLMENT_STATUS.DELIVERED:
      return { kind: "already_delivered", fulfillmentId: row.id };
    case FULFILLMENT_STATUS.COMPLETED:
      // Purchased but not yet handed over — the caller should deliver.
      return { kind: "ready", fulfillmentId: row.id };
    case FULFILLMENT_STATUS.UNCERTAIN:
    case FULFILLMENT_STATUS.SUBMITTED:
      return {
        kind: "uncertain",
        fulfillmentId: row.id,
        message:
          row.lastError ??
          "Une tentative précédente est au statut INCERTAIN : réconciliez-la avant toute nouvelle commande.",
      };
    case FULFILLMENT_STATUS.PROCESSING:
    case FULFILLMENT_STATUS.RECONCILING:
      return {
        kind: "processing",
        fulfillmentId: row.id,
        message:
          "La commande fournisseur est en cours de traitement — la réconciliation finalisera la livraison.",
      };
    case FULFILLMENT_STATUS.ABANDONED:
      return {
        kind: "failed_clean",
        fulfillmentId: row.id,
        code: "order_failed",
        message: row.lastError ?? "Tentative abandonnée par un administrateur.",
      };
    default:
      return {
        kind: "uncertain",
        fulfillmentId: row.id,
        message: `État de livraison inattendu (${row.status}) — vérification manuelle requise.`,
      };
  }
}

/**
 * Classifies a thrown purchase error and records it on the ledger.
 *
 * The default is UNCERTAIN. Only an error that positively identifies itself as
 * clean is recorded as clean, because "we could not tell" and "the supplier
 * refused" have to be handled differently and the expensive mistake is to
 * conflate them in the optimistic direction.
 */
async function handlePurchaseError(args: {
  error: unknown;
  row: LedgerRow;
  providerName: string;
  input: FulfillSlotInput;
  startedAt: number;
}): Promise<FulfillSlotResult> {
  const { error, row, providerName, input, startedAt } = args;

  const normalized: NormalizedSupplierError = isNormalizedSupplierError(error)
    ? error
    : new NormalizedSupplierError(
        isSupplierPurchaseUncertain(error) ? "timeout_uncertain" : "unknown",
        { message: error instanceof Error ? error.message : undefined },
      );

  void logPurchase(
    input,
    providerName,
    false,
    startedAt,
    normalized.code,
    undefined,
    normalized.isUncertain,
  );

  if (normalized.isUncertain) {
    await markUncertain({
      id: row.id,
      errorCode: normalized.code,
      message: normalized.message,
    });
    return {
      kind: "uncertain",
      fulfillmentId: row.id,
      message:
        `Commande ${providerName} au statut INCERTAIN : ${normalized.message} ` +
        `La commande a peut-être été passée et débitée. NE RELANCEZ PAS la livraison : ` +
        `ouvrez le tableau de bord ${providerName}, recherchez « ${row.idempotencyKey} », ` +
        `puis livrez le code manuellement s’il existe.`,
    };
  }

  await markFailedClean({
    id: row.id,
    errorCode: normalized.code,
    message: normalized.message,
  });
  return {
    kind: "failed_clean",
    fulfillmentId: row.id,
    code: normalized.code,
    message: normalized.message,
  };
}

/** Fire-and-forget structured log. Never carries codes or credentials. */
function logPurchase(
  input: FulfillSlotInput,
  _providerName: string,
  ok: boolean,
  startedAt: number,
  errorCode: SupplierErrorCode | null,
  providerRef?: string,
  uncertain = false,
) {
  return recordSupplierLog({
    slug: input.supplier,
    requestType: "purchase",
    ok,
    responseTimeMs: Date.now() - startedAt,
    orderId: input.orderId,
    productName: input.context.productName,
    providerRef,
    errorMessage: errorCode
      ? `${uncertain ? "[INCERTAIN] " : ""}${errorCode}`
      : undefined,
  });
}

/**
 * Whether the router may try a BACKUP supplier after this outcome.
 *
 * Only `failed_clean` qualifies. An uncertain outcome must never trigger
 * failover: buying the same product from a second supplier while the first may
 * already have charged us is exactly the double-spend the ledger exists to
 * prevent. `blocked` also qualifies, since nothing was ever dispatched.
 */
export function mayFailOver(result: FulfillSlotResult): boolean {
  return result.kind === "failed_clean" || result.kind === "blocked";
}
