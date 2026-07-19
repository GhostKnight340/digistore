/**
 * FazerCards order reconciliation.
 *
 * Answers the one question that matters after an ambiguous purchase: *did the
 * supplier actually create and charge an order for our idempotency key?*
 *
 * Two lookup routes, in order of reliability:
 *
 *  1. By provider order id, when a response reached us before things went
 *     wrong. Authoritative — `GET /orders/{id}`.
 *  2. By replaying the ORIGINAL idempotency key against the order endpoint.
 *     FazerCards documents that a repeated key returns the original order
 *     instead of creating a new one, so this is a *read* disguised as a write
 *     — it is the only way to discover an order whose id we never received.
 *
 * Route 2 is the delicate one and is why {@link reconcileSlot} refuses to run
 * with anything other than the key already stored on the ledger row. Replaying
 * the stored key is safe; sending a fresh key is a second purchase. That
 * distinction is enforced here rather than trusted to callers.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  FULFILLMENT_STATUS,
  MAX_RECONCILE_ATTEMPTS,
  recordReconcileAttempt,
  markCompleted,
  markFailedClean,
  markUncertain,
  reconcileBackoffSec,
  type LedgerRow,
} from "@/lib/suppliers/ledger";
import { getOrder, replayOrderByIdempotencyKey } from "./operations";
import {
  extractDeliveryFields,
  failureCodeForStatus,
  isTerminalFailureStatus,
  isTerminalSuccessStatus,
  sanitizeProviderSnapshot,
  toNormalizedError,
} from "./normalize";
import { isFazerCardsDryRun } from "./config";

export type ReconcileOutcome =
  /** Provider order confirmed complete; payload captured and ready to deliver. */
  | { kind: "completed"; fulfillmentId: string }
  /** Provider definitively failed/cancelled it; no charge stands. */
  | { kind: "failed"; fulfillmentId: string; message: string }
  /** Still in progress; rescheduled. */
  | { kind: "pending"; fulfillmentId: string; providerStatus: string | null }
  /** Automated resolution exhausted or impossible; a human must act. */
  | { kind: "manual_review"; fulfillmentId: string; message: string };

/**
 * Runs one reconciliation pass over a single ledger slot.
 *
 * Never places a new order and never mints a new idempotency key. The worst
 * case is that it learns nothing and reschedules; it cannot make the money
 * situation worse.
 */
export async function reconcileSlot(row: LedgerRow): Promise<ReconcileOutcome> {
  if (row.supplier !== "fazercards") {
    return {
      kind: "manual_review",
      fulfillmentId: row.id,
      message: `Réconciliation FazerCards appelée pour le fournisseur « ${row.supplier} ».`,
    };
  }

  // A dry-run slot never reached the network, so there is nothing at the
  // supplier to reconcile against. Resolving it as a clean failure is correct
  // and keeps simulated orders from lingering in the ops dashboard forever.
  if (isFazerCardsDryRun()) {
    await markFailedClean({
      id: row.id,
      errorCode: "order_failed",
      message: "Simulation (dry-run) — aucune commande fournisseur réelle à réconcilier.",
    });
    return {
      kind: "failed",
      fulfillmentId: row.id,
      message: "Simulation : rien à réconcilier.",
    };
  }

  if (row.reconcileCount >= MAX_RECONCILE_ATTEMPTS) {
    return {
      kind: "manual_review",
      fulfillmentId: row.id,
      message:
        `Réconciliation automatique épuisée après ${row.reconcileCount} tentatives. ` +
        `Vérifiez la commande « ${row.idempotencyKey} » dans le tableau de bord FazerCards.`,
    };
  }

  try {
    const order = row.providerOrderId
      ? (await getOrder(row.providerOrderId)).order
      : await replayOrderByIdempotencyKey({
          // The stored key — never a fresh one. This is the safety property
          // the whole module exists to protect.
          idempotencyKey: row.idempotencyKey,
          serviceType: row.serviceType,
        });

    if (!order) {
      // No order exists for our key. The supplier never created one, so no
      // charge stands and the slot is safe to fail cleanly — which in turn
      // makes it eligible for a backup supplier or manual fulfilment.
      await markFailedClean({
        id: row.id,
        errorCode: "order_failed",
        message:
          "Aucune commande FazerCards ne correspond à cette clé d’idempotence : aucun débit n’a eu lieu.",
      });
      return {
        kind: "failed",
        fulfillmentId: row.id,
        message: "Aucune commande fournisseur trouvée — aucun débit.",
      };
    }

    const providerStatus = typeof order.status === "string" ? order.status : null;
    const providerOrderId = typeof order.id === "string" ? order.id : row.providerOrderId;

    if (isTerminalSuccessStatus(providerStatus)) {
      const fields = extractDeliveryFields(order as Record<string, unknown>);
      if (fields.length === 0) {
        // Completed but unparseable — the UNVERIFIED CONTRACT case. Escalate
        // with the sanitised shape recorded, rather than delivering nothing.
        await markUncertain({
          id: row.id,
          errorCode: "malformed_response",
          message:
            `Commande ${providerOrderId} terminée mais aucun code reconnu dans la réponse. ` +
            "Récupérez le code dans le tableau de bord FazerCards et livrez-le manuellement.",
          providerOrderId,
          nextPollInSec: reconcileBackoffSec(row.reconcileCount + 1),
        });
        await prisma.supplierFulfillment.update({
          where: { id: row.id },
          data: {
            responseSnapshot: sanitizeProviderSnapshot(order) as object,
            providerStatus,
          },
        });
        return {
          kind: "manual_review",
          fulfillmentId: row.id,
          message: `Commande ${providerOrderId} terminée, payload non reconnu — livraison manuelle requise.`,
        };
      }

      await markCompleted({
        id: row.id,
        providerOrderId,
        providerStatus,
        deliveryPayload: fields,
        responseSnapshot: sanitizeProviderSnapshot(order),
      });
      return { kind: "completed", fulfillmentId: row.id };
    }

    if (isTerminalFailureStatus(providerStatus)) {
      await markFailedClean({
        id: row.id,
        errorCode: failureCodeForStatus(providerStatus),
        message: `Commande FazerCards ${providerOrderId} terminée en échec (${providerStatus}).`,
        providerStatus,
      });
      return {
        kind: "failed",
        fulfillmentId: row.id,
        message: `Commande fournisseur en échec (${providerStatus}).`,
      };
    }

    // Non-terminal, or a status we do not recognise. Both reschedule — an
    // unknown status must never be optimistically treated as success.
    await recordReconcileAttempt({
      id: row.id,
      nextPollInSec: reconcileBackoffSec(row.reconcileCount + 1),
      providerStatus,
    });
    if (providerOrderId && providerOrderId !== row.providerOrderId) {
      await prisma.supplierFulfillment.update({
        where: { id: row.id },
        data: { providerOrderId },
      });
    }
    return { kind: "pending", fulfillmentId: row.id, providerStatus };
  } catch (error) {
    const normalized = toNormalizedError(error);
    // Reconciliation failing does NOT resolve the ambiguity — the slot stays
    // uncertain and we simply try again later.
    await markUncertain({
      id: row.id,
      errorCode: normalized.code,
      message: `Réconciliation impossible pour l’instant : ${normalized.message}`,
      nextPollInSec: reconcileBackoffSec(row.reconcileCount + 1),
    });
    return {
      kind: "pending",
      fulfillmentId: row.id,
      providerStatus: row.providerStatus,
    };
  }
}

/** Batch pass used by the reconciliation cron. */
export async function reconcileDueSlots(limit = 25): Promise<{
  processed: number;
  completed: number;
  failed: number;
  pending: number;
  manualReview: number;
}> {
  const { listDueForReconciliation } = await import("@/lib/suppliers/ledger");
  const rows = (await listDueForReconciliation(limit)) as unknown as LedgerRow[];
  const counts = { processed: 0, completed: 0, failed: 0, pending: 0, manualReview: 0 };

  for (const row of rows) {
    if (row.supplier !== "fazercards") continue;
    counts.processed += 1;
    try {
      const outcome = await reconcileSlot(row);
      if (outcome.kind === "completed") counts.completed += 1;
      else if (outcome.kind === "failed") counts.failed += 1;
      else if (outcome.kind === "manual_review") counts.manualReview += 1;
      else counts.pending += 1;
    } catch (error) {
      // One bad row must not abort the batch.
      console.error("[fazercards:reconcile]", row.id, error);
      counts.pending += 1;
    }
  }

  return counts;
}

export { FULFILLMENT_STATUS };
