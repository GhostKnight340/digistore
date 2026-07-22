/**
 * Approval queue persistence (spec §7).
 *
 * Server-only CRUD over AiApproval, enforcing the pure transition table in
 * src/lib/ai-ops/approvals.ts. Designed so approval can eventually happen from
 * both the admin panel and Discord buttons — the state machine lives in one
 * place and both surfaces call these helpers. No customer email/message is sent
 * from here in this foundation.
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { log } from "@/lib/ops/log";
import { assertTransition, isExpired } from "./approvals";
import type { ApprovalStatus, RiskLevel } from "./types";

export interface CreateApprovalInput {
  module: string;
  actionType: string;
  summary: string;
  proposedContent: string;
  entityType?: string | null;
  entityId?: string | null;
  riskLevel?: RiskLevel;
  expiresAt?: Date | null;
  /** The coverage session that authorized this AI action (audit link). */
  coverageSessionId?: string | null;
}

export async function createApproval(input: CreateApprovalInput): Promise<string> {
  const row = await prisma.aiApproval.create({
    data: {
      module: input.module,
      actionType: input.actionType,
      summary: input.summary.slice(0, 300),
      proposedContent: input.proposedContent,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      riskLevel: input.riskLevel ?? "low",
      status: "PENDING",
      expiresAt: input.expiresAt ?? null,
      coverageSessionId: input.coverageSessionId ?? null,
    },
    select: { id: true },
  });
  log.info("ai approval created", {
    operation: `ai.${input.module}.approval`,
    result: "PENDING",
    actionType: input.actionType,
    riskLevel: input.riskLevel ?? "low",
  });
  return row.id;
}

/** One approval's fields needed to execute an approved action. */
export async function getApproval(id: string) {
  return prisma.aiApproval.findUnique({
    where: { id },
    select: {
      id: true,
      module: true,
      actionType: true,
      entityType: true,
      entityId: true,
      proposedContent: true,
      editedContent: true,
      status: true,
    },
  });
}

/**
 * Records an AI reply that was AUTO-SENT under an authorizing coverage session,
 * as a terminal COMPLETED approval — so the queue/audit shows exactly what the
 * assistant sent on its own and under which session (there was no human step).
 */
export async function recordAutoSend(input: {
  module: string;
  summary: string;
  content: string;
  entityId: string;
  coverageSessionId: string;
}): Promise<string> {
  const row = await prisma.aiApproval.create({
    data: {
      module: input.module,
      actionType: "support_reply",
      summary: input.summary.slice(0, 300),
      proposedContent: input.content,
      entityType: "support_ticket",
      entityId: input.entityId,
      riskLevel: "low",
      status: "COMPLETED",
      approvedBy: "AI (couverture)",
      approvedAt: new Date(),
      executionResult: "Envoyé automatiquement au client.",
      coverageSessionId: input.coverageSessionId,
    },
    select: { id: true },
  });
  return row.id;
}

export async function listApprovals(status?: ApprovalStatus) {
  return prisma.aiApproval.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function countPendingApprovals(): Promise<number> {
  try {
    return await prisma.aiApproval.count({ where: { status: "PENDING" } });
  } catch {
    return 0;
  }
}

/**
 * Has an approval already been created for this entity at or after `since`?
 * The support sweep uses this for idempotency: a ticket whose latest approval is
 * newer than its last update has already been drafted for its current state, so
 * it must not be re-drafted (avoids duplicate drafts and an endless re-draft loop
 * after a human rejects one). A new customer message bumps the ticket's
 * updatedAt past the old approval, which re-opens it for drafting.
 */
export async function hasApprovalForEntitySince(
  entityType: string,
  entityId: string,
  since: Date,
): Promise<boolean> {
  const row = await prisma.aiApproval.findFirst({
    where: { entityType, entityId, createdAt: { gte: since } },
    select: { id: true },
  });
  return row !== null;
}

/** How many approvals (any status) exist for an entity — used to detect whether
 *  the assistant has already engaged this ticket (e.g. already asked for info). */
export async function countApprovalsForEntity(entityType: string, entityId: string): Promise<number> {
  return prisma.aiApproval.count({ where: { entityType, entityId } });
}

async function currentStatus(id: string): Promise<ApprovalStatus | null> {
  const row = await prisma.aiApproval.findUnique({ where: { id }, select: { status: true } });
  return (row?.status as ApprovalStatus | undefined) ?? null;
}

/**
 * Moves an approval to a new status, enforcing the transition table. Throws on
 * an illegal transition (callers surface a friendly error). Extra fields
 * (approver, reason, edited content, result) are written alongside.
 */
export async function transitionApproval(
  id: string,
  to: ApprovalStatus,
  extra: {
    approvedBy?: string;
    rejectedBy?: string;
    rejectionReason?: string;
    editedContent?: string;
    executionResult?: string;
  } = {},
): Promise<void> {
  const from = await currentStatus(id);
  if (!from) throw new Error("Approval not found.");
  assertTransition(from, to); // throws on illegal transition

  const data: Record<string, unknown> = { status: to };
  if (to === "APPROVED") {
    data.approvedBy = extra.approvedBy ?? null;
    data.approvedAt = new Date();
    if (extra.editedContent !== undefined) data.editedContent = extra.editedContent;
  }
  if (to === "REJECTED") {
    data.rejectedBy = extra.rejectedBy ?? null;
    data.rejectionReason = extra.rejectionReason ?? null;
  }
  if (to === "COMPLETED" || to === "FAILED") {
    data.executionResult = extra.executionResult?.slice(0, 500) ?? null;
  }

  await prisma.aiApproval.update({ where: { id }, data });
  log.info("ai approval transition", {
    operation: "ai.approval.transition",
    result: to,
    code: from,
  });
}

/**
 * Sweeps PENDING approvals whose expiry has passed and marks them EXPIRED.
 * Returns the number expired. Idempotent — only PENDING rows are touched.
 */
export async function expireStaleApprovals(now = new Date()): Promise<number> {
  const pending = await prisma.aiApproval.findMany({
    where: { status: "PENDING", expiresAt: { not: null, lte: now } },
    select: { id: true, status: true, expiresAt: true },
  });
  let expired = 0;
  for (const row of pending) {
    if (isExpired(row.status as ApprovalStatus, row.expiresAt, now)) {
      try {
        await transitionApproval(row.id, "EXPIRED");
        expired += 1;
      } catch {
        // Race: someone else moved it; skip.
      }
    }
  }
  return expired;
}
