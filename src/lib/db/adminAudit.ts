import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Append-only admin audit trail for customer-management actions. Every
 * account-changing operation writes one row here with the acting admin's
 * identity, the affected customer, the action, a reason, and safe changed-field
 * metadata. Never records secrets/tokens/hashes.
 *
 * `writeAuditLog` accepts an optional transaction client so an audit row can be
 * written atomically inside the same $transaction as the change it records.
 */

export type AuditAction =
  | "customer.viewed"
  | "customer.status_changed"
  | "customer.disabled"
  | "customer.enabled"
  | "customer.anonymized"
  | "customer.sessions_revoked"
  | "customer.verification_resent"
  | "customer.password_reset_sent"
  | "customer.profile_edited"
  | "customer.email_change_started"
  | "customer.consent_changed"
  | "customer.note_added"
  | "customer.note_archived"
  | "customer.support_reply"
  | "customer.exported"
  | "wallet.adjusted"
  | "wallet.frozen"
  | "wallet.unfrozen"
  | "wallet.reconciled"
  | "email.draft_saved"
  | "email.test_sent"
  | "email.sent"
  | "email.credit_granted"
  | "email.retried";

export interface WriteAuditInput {
  adminId: string;
  adminName: string;
  customerId?: string | null;
  action: AuditAction;
  reason?: string | null;
  /** Safe, non-sensitive changed-field context only. */
  metadata?: Record<string, unknown> | null;
}

type Db = PrismaClient | Prisma.TransactionClient;

export async function writeAuditLog(input: WriteAuditInput, db: Db = prisma): Promise<void> {
  await db.adminAuditLog.create({
    data: {
      adminId: input.adminId,
      adminName: input.adminName,
      customerId: input.customerId ?? null,
      action: input.action,
      reason: input.reason?.trim() || null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export interface AuditLogEntryDTO {
  id: string;
  adminName: string;
  action: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** Bounded per-customer audit history for the Activity tab, newest-first. */
export async function getCustomerAuditLog(
  customerId: string,
  take = 100,
): Promise<AuditLogEntryDTO[]> {
  const rows = await prisma.adminAuditLog.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, take)),
  });
  return rows.map((row) => ({
    id: row.id,
    adminName: row.adminName,
    action: row.action,
    reason: row.reason,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}
