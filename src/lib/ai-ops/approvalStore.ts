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
