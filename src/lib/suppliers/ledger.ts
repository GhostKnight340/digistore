/**
 * Supplier fulfillment ledger — the money-path state machine.
 *
 * Owns every transition of `SupplierFulfillment`. Nothing else in the codebase
 * may write that table: keeping the transitions in one module is what makes
 * "at most one purchase, at most one delivery" auditable rather than hopeful.
 *
 * The central invariant:
 *
 *   A row is written BEFORE the supplier request leaves the process, and the
 *   row's `idempotencyKey` never changes for the lifetime of the slot.
 *
 * That ordering is what survives a crash. If the process dies mid-request we
 * still have a `submitted` row naming the exact key the supplier saw, so
 * reconciliation can ask "did this key produce an order?" instead of guessing.
 * Generating a fresh key on retry would silently buy the product twice — which
 * is why {@link claimSlot} returns the EXISTING key rather than minting one
 * whenever a row is already present.
 *
 * See prisma/schema.prisma › SupplierFulfillment for the state diagram.
 */
import "server-only";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { DeliveredFieldDTO } from "@/lib/dto";
import type { SupplierSlug } from "./registry";
import type { SupplierErrorCode } from "./errors";

export const FULFILLMENT_STATUS = {
  /** Slot claimed; nothing sent to the supplier yet. */
  PENDING: "pending",
  /** Request dispatched; no usable response yet. Money may be at risk. */
  SUBMITTED: "submitted",
  /** Supplier accepted and is working; not terminal. */
  PROCESSING: "processing",
  /** Supplier order terminal-success; payload captured, not yet delivered. */
  COMPLETED: "completed",
  /** Supplier refused before charging. Safe to retry / fail over. */
  FAILED_CLEAN: "failed_clean",
  /** Outcome unknown — may have been charged. Never auto-retried. */
  UNCERTAIN: "uncertain",
  /** Actively being resolved against the supplier's records. */
  RECONCILING: "reconciling",
  /** Terminal: the customer has the goods. */
  DELIVERED: "delivered",
  /** Terminal: an admin declared this attempt dead, with a reason. */
  ABANDONED: "abandoned",
} as const;

export type FulfillmentStatus =
  (typeof FULFILLMENT_STATUS)[keyof typeof FULFILLMENT_STATUS];

/** States from which a supplier request must NOT be dispatched again. */
const NON_DISPATCHABLE: FulfillmentStatus[] = [
  FULFILLMENT_STATUS.SUBMITTED,
  FULFILLMENT_STATUS.PROCESSING,
  FULFILLMENT_STATUS.COMPLETED,
  FULFILLMENT_STATUS.UNCERTAIN,
  FULFILLMENT_STATUS.RECONCILING,
  FULFILLMENT_STATUS.DELIVERED,
];

/**
 * States that need a reconciliation pass before anyone may act on the slot.
 * `submitted` is included deliberately: a row stuck in `submitted` means the
 * process died between dispatch and response, which is exactly the case where
 * money may have moved with no record of the outcome.
 */
export const RECONCILIABLE_STATUSES: FulfillmentStatus[] = [
  FULFILLMENT_STATUS.SUBMITTED,
  FULFILLMENT_STATUS.PROCESSING,
  FULFILLMENT_STATUS.UNCERTAIN,
  FULFILLMENT_STATUS.RECONCILING,
];

/** Terminal states — no further automated work. */
export const TERMINAL_STATUSES: FulfillmentStatus[] = [
  FULFILLMENT_STATUS.DELIVERED,
  FULFILLMENT_STATUS.FAILED_CLEAN,
  FULFILLMENT_STATUS.ABANDONED,
];

/**
 * Maximum automated reconciliation passes before we stop polling and escalate
 * to a human. Prevents an indefinitely "processing" supplier order from
 * burning API quota forever; the slot stays visible in the ops dashboard.
 */
export const MAX_RECONCILE_ATTEMPTS = 24;

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as string[]).includes(status);
}

export function needsReconciliation(status: string): boolean {
  return (RECONCILIABLE_STATUSES as string[]).includes(status);
}

/**
 * Builds the provider-facing idempotency key for a slot.
 *
 * Derived purely from our own identifiers so it is reproducible from the
 * database alone — never from a clock or a random source, which would break
 * the "same logical purchase ⇒ same key" guarantee after a restart. Bounded
 * well under the 255-char limit FazerCards documents.
 */
export function buildIdempotencyKey(input: {
  orderId: string;
  orderItemId: string;
  slotIndex: number;
}): string {
  return `ghost-${input.orderId}-${input.orderItemId}-${input.slotIndex}`;
}

export type LedgerRow = {
  id: string;
  orderId: string;
  orderItemId: string;
  slotIndex: number;
  supplier: string;
  serviceType: string | null;
  status: string;
  idempotencyKey: string;
  providerOrderId: string | null;
  providerStatus: string | null;
  deliveryPayload: unknown;
  attemptCount: number;
  reconcileCount: number;
  lastError: string | null;
  lastErrorCode: string | null;
  correlationId: string | null;
  deliveredAt: Date | null;
};

export type ClaimResult = {
  row: LedgerRow;
  /** True when this call created the row (i.e. we own the first attempt). */
  created: boolean;
  /**
   * Whether the caller may dispatch a supplier request. False when a previous
   * attempt is still in flight, already succeeded, or ended uncertain — the
   * caller must then reconcile or deliver from the existing row instead.
   */
  canDispatch: boolean;
};

/**
 * Claims the fulfillment slot, creating the ledger row if absent.
 *
 * Concurrency: the `(orderItemId, slotIndex)` unique index is the arbiter. Two
 * parallel callers both attempt the insert; the loser catches P2002 and re-reads
 * the winner's row. We rely on the database rather than an application lock
 * because the racing callers can be in different serverless invocations, where
 * an in-process lock is worthless.
 */
export async function claimSlot(input: {
  orderId: string;
  orderItemId: string;
  slotIndex: number;
  supplier: SupplierSlug;
  serviceType: string | null;
  costAmount?: string | null;
  costCurrency?: string | null;
}): Promise<ClaimResult> {
  const idempotencyKey = buildIdempotencyKey(input);
  const correlationId = randomUUID();

  try {
    const row = (await prisma.supplierFulfillment.create({
      data: {
        orderId: input.orderId,
        orderItemId: input.orderItemId,
        slotIndex: input.slotIndex,
        supplier: input.supplier,
        serviceType: input.serviceType,
        status: FULFILLMENT_STATUS.PENDING,
        idempotencyKey,
        correlationId,
        costAmount: input.costAmount != null ? new Prisma.Decimal(input.costAmount) : null,
        costCurrency: input.costCurrency ?? null,
      },
    })) as unknown as LedgerRow;
    return { row, created: true, canDispatch: true };
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
    // Lost the race, or this is a legitimate retry of an earlier attempt.
    const existing = (await prisma.supplierFulfillment.findUnique({
      where: {
        orderItemId_slotIndex: {
          orderItemId: input.orderItemId,
          slotIndex: input.slotIndex,
        },
      },
    })) as unknown as LedgerRow | null;
    if (!existing) {
      // The unique violation came from `idempotencyKey` instead — meaning the
      // same key exists under a different slot. That is a programming error
      // (keys are derived from the slot), not a race; fail loudly.
      throw new Error(
        `Ledger conflict: idempotency key ${idempotencyKey} already exists for a different slot.`,
      );
    }
    return {
      row: existing,
      created: false,
      canDispatch:
        !NON_DISPATCHABLE.includes(existing.status as FulfillmentStatus) &&
        !isTerminal(existing.status),
    };
  }
}

/**
 * Marks the slot as dispatched. MUST be awaited before the HTTP request is
 * made — this row is the only evidence that money may be in flight if the
 * process dies mid-call.
 */
export async function markSubmitted(id: string): Promise<void> {
  await prisma.supplierFulfillment.update({
    where: { id },
    data: {
      status: FULFILLMENT_STATUS.SUBMITTED,
      submittedAt: new Date(),
      attemptCount: { increment: 1 },
    },
  });
}

/** Records a non-terminal supplier order that we will poll for. */
export async function markProcessing(input: {
  id: string;
  providerOrderId: string | null;
  providerStatus: string | null;
  /** Backoff before the next reconciliation pass. */
  nextPollInSec?: number;
}): Promise<void> {
  await prisma.supplierFulfillment.update({
    where: { id: input.id },
    data: {
      status: FULFILLMENT_STATUS.PROCESSING,
      providerOrderId: input.providerOrderId ?? undefined,
      providerStatus: input.providerStatus,
      nextPollAt: new Date(Date.now() + (input.nextPollInSec ?? 60) * 1000),
    },
  });
}

/** Records a terminal-success supplier order and its normalized payload. */
export async function markCompleted(input: {
  id: string;
  providerOrderId: string | null;
  providerStatus: string | null;
  deliveryPayload: DeliveredFieldDTO[];
  responseSnapshot?: unknown;
  costAmount?: string | null;
  costCurrency?: string | null;
}): Promise<void> {
  await prisma.supplierFulfillment.update({
    where: { id: input.id },
    data: {
      status: FULFILLMENT_STATUS.COMPLETED,
      providerOrderId: input.providerOrderId ?? undefined,
      providerStatus: input.providerStatus,
      deliveryPayload: input.deliveryPayload as unknown as Prisma.InputJsonValue,
      responseSnapshot:
        input.responseSnapshot != null
          ? (input.responseSnapshot as Prisma.InputJsonValue)
          : undefined,
      costAmount:
        input.costAmount != null ? new Prisma.Decimal(input.costAmount) : undefined,
      costCurrency: input.costCurrency ?? undefined,
      completedAt: new Date(),
      nextPollAt: null,
    },
  });
}

/**
 * Records a CLEAN failure — the supplier refused before spending. This is the
 * only failure state from which the router may fail over to another supplier.
 */
export async function markFailedClean(input: {
  id: string;
  errorCode: SupplierErrorCode;
  message: string;
  providerStatus?: string | null;
}): Promise<void> {
  await prisma.supplierFulfillment.update({
    where: { id: input.id },
    data: {
      status: FULFILLMENT_STATUS.FAILED_CLEAN,
      lastError: input.message,
      lastErrorCode: input.errorCode,
      providerStatus: input.providerStatus ?? undefined,
      nextPollAt: null,
    },
  });
}

/**
 * Records an UNCERTAIN outcome. The supplier may hold a paid order we cannot
 * see. Schedules a reconciliation pass; never permits a fresh purchase.
 */
export async function markUncertain(input: {
  id: string;
  errorCode: SupplierErrorCode;
  message: string;
  providerOrderId?: string | null;
  nextPollInSec?: number;
}): Promise<void> {
  await prisma.supplierFulfillment.update({
    where: { id: input.id },
    data: {
      status: FULFILLMENT_STATUS.UNCERTAIN,
      lastError: input.message,
      lastErrorCode: input.errorCode,
      providerOrderId: input.providerOrderId ?? undefined,
      nextPollAt: new Date(Date.now() + (input.nextPollInSec ?? 120) * 1000),
    },
  });
}

/** Bumps the reconciliation counter and reschedules the next pass. */
export async function recordReconcileAttempt(input: {
  id: string;
  nextPollInSec: number;
  providerStatus?: string | null;
}): Promise<void> {
  await prisma.supplierFulfillment.update({
    where: { id: input.id },
    data: {
      status: FULFILLMENT_STATUS.RECONCILING,
      reconcileCount: { increment: 1 },
      providerStatus: input.providerStatus ?? undefined,
      nextPollAt: new Date(Date.now() + input.nextPollInSec * 1000),
    },
  });
}

/**
 * Terminal delivery marker, set inside the same transaction that writes the
 * DeliveredCode row. `updateMany` with a `deliveredAt: null` guard makes this
 * a compare-and-set: a second concurrent delivery updates 0 rows and the
 * caller aborts, so the customer cannot be delivered twice even if two
 * requests pass the earlier checks simultaneously.
 *
 * Returns true when THIS call performed the delivery.
 */
export async function markDelivered(
  id: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<boolean> {
  const result = await tx.supplierFulfillment.updateMany({
    where: { id, deliveredAt: null },
    data: { status: FULFILLMENT_STATUS.DELIVERED, deliveredAt: new Date() },
  });
  return result.count === 1;
}

/** Admin action: declare an unresolved attempt definitively dead. */
export async function markAbandoned(input: {
  id: string;
  reason: string;
}): Promise<void> {
  await prisma.supplierFulfillment.update({
    where: { id: input.id },
    data: {
      status: FULFILLMENT_STATUS.ABANDONED,
      lastError: input.reason,
      nextPollAt: null,
    },
  });
}

/** Admin action: attach a supplier order id discovered manually in their hub. */
export async function attachProviderOrderId(input: {
  id: string;
  providerOrderId: string;
}): Promise<void> {
  await prisma.supplierFulfillment.update({
    where: { id: input.id },
    data: {
      providerOrderId: input.providerOrderId,
      status: FULFILLMENT_STATUS.RECONCILING,
      nextPollAt: new Date(),
    },
  });
}

export function getFulfillment(id: string) {
  return prisma.supplierFulfillment.findUnique({ where: { id } });
}

export function listFulfillmentsForOrder(orderId: string) {
  return prisma.supplierFulfillment.findMany({
    where: { orderId },
    orderBy: [{ orderItemId: "asc" }, { slotIndex: "asc" }],
  });
}

/**
 * Slots the reconciliation job should pick up: non-terminal, due for a poll,
 * and still under the attempt ceiling. Ordered oldest-first so a backlog drains
 * fairly rather than starving the earliest customer.
 */
export function listDueForReconciliation(limit = 25) {
  return prisma.supplierFulfillment.findMany({
    where: {
      status: { in: RECONCILIABLE_STATUSES as string[] },
      reconcileCount: { lt: MAX_RECONCILE_ATTEMPTS },
      OR: [{ nextPollAt: null }, { nextPollAt: { lte: new Date() } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

/**
 * Slots that automated reconciliation has given up on, or that have been
 * unresolved for too long. These are what the ops dashboard escalates and what
 * the admin "Réconcilier" controls act on.
 */
export function listNeedingManualReview(input?: { olderThanMinutes?: number }) {
  const cutoff = new Date(Date.now() - (input?.olderThanMinutes ?? 30) * 60_000);
  return prisma.supplierFulfillment.findMany({
    where: {
      OR: [
        { status: FULFILLMENT_STATUS.UNCERTAIN, createdAt: { lte: cutoff } },
        { reconcileCount: { gte: MAX_RECONCILE_ATTEMPTS }, deliveredAt: null },
        {
          status: { in: RECONCILIABLE_STATUSES as string[] },
          createdAt: { lte: cutoff },
        },
      ],
      NOT: { status: { in: TERMINAL_STATUSES as string[] } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Exponential backoff for reconciliation polling, capped at 30 minutes.
 * Deliberately gentle — FazerCards rate-limits order-status reads at 120/min
 * across the whole account, and a stuck order is an admin problem, not
 * something to hammer the API over.
 */
export function reconcileBackoffSec(attempt: number): number {
  return Math.min(30 * 60, 30 * Math.pow(2, Math.min(attempt, 6)));
}
