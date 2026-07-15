"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireAdminCustomer } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import {
  listAdminCustomers,
  getCustomerOverview,
  getCustomerOrdersTab,
  getCustomerPaymentsTab,
  getCustomerGhostCreditTab,
  getCustomerPromotionsTab,
  getCustomerSecurityTab,
  getCustomerSupportTab,
  setCustomerStatus,
  revokeCustomerSessions,
  updateCustomerProfile,
  startCustomerEmailChange,
  adminResendVerification,
  adminSendPasswordReset,
} from "@/lib/db/customerAdmin";
import {
  addCustomerNote,
  archiveCustomerNote,
  listCustomerNotes,
} from "@/lib/db/customerNotes";
import { getCustomerAuditLog, writeAuditLog } from "@/lib/db/adminAudit";
import { adminAdjustGhostCredit, adminSetWalletFrozen } from "@/lib/db/ghostCreditAdmin";
import { repairWalletCache } from "@/lib/db/walletReconcile";
import { replySupportTicketAction } from "@/app/actions/supportAdmin";
import type {
  AdminCustomerListResult,
  CustomerListFilters,
  CustomerOverviewDTO,
  CustomerOrderRowDTO,
  CustomerPaymentRowDTO,
  CustomerPromotionsDTO,
  CustomerSecurityDTO,
} from "@/lib/customerAdminDto";

type Actor = { id: string; name: string };
type ActionResult = { ok: boolean; error?: string };

async function admin(): Promise<Actor> {
  const a = await requireAdminCustomer();
  return { id: a.id, name: a.name };
}

function revalidateCustomer(customerId?: string) {
  revalidatePath("/admin/clients");
  if (customerId) revalidatePath(`/admin/clients/${customerId}`);
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function getCustomerListAction(
  filters: CustomerListFilters,
): Promise<AdminCustomerListResult> {
  await requireAdminCustomer();
  return listAdminCustomers(filters);
}

export async function getCustomerOverviewAction(
  customerId: string,
): Promise<CustomerOverviewDTO | null> {
  await requireAdminCustomer();
  return getCustomerOverview(customerId);
}

export async function getCustomerOrdersAction(
  customerId: string,
  filters: { status?: string; paymentMethod?: string } = {},
): Promise<CustomerOrderRowDTO[]> {
  await requireAdminCustomer();
  return getCustomerOrdersTab(customerId, filters);
}

export async function getCustomerPaymentsAction(
  customerId: string,
): Promise<CustomerPaymentRowDTO[]> {
  await requireAdminCustomer();
  return getCustomerPaymentsTab(customerId);
}

export async function getCustomerGhostCreditAction(customerId: string) {
  await requireAdminCustomer();
  return getCustomerGhostCreditTab(customerId);
}

export async function getCustomerPromotionsAction(
  customerId: string,
): Promise<CustomerPromotionsDTO> {
  await requireAdminCustomer();
  return getCustomerPromotionsTab(customerId);
}

export async function getCustomerSupportAction(customerId: string) {
  await requireAdminCustomer();
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { email: true },
  });
  return getCustomerSupportTab(customerId, c?.email ?? null);
}

export async function getCustomerSecurityAction(
  customerId: string,
): Promise<CustomerSecurityDTO | null> {
  await requireAdminCustomer();
  return getCustomerSecurityTab(customerId);
}

export async function getCustomerActivityAction(customerId: string) {
  await requireAdminCustomer();
  return getCustomerAuditLog(customerId);
}

export async function getCustomerNotesAction(customerId: string) {
  await requireAdminCustomer();
  return listCustomerNotes(customerId);
}

/** Reveal the full phone (masked everywhere by default). Admin-gated + audited. */
export async function revealCustomerPhoneAction(
  customerId: string,
): Promise<{ ok: boolean; phone?: string | null; error?: string }> {
  const actor = await admin();
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { phone: true },
  });
  if (!c) return { ok: false, error: "Client introuvable." };
  await writeAuditLog({
    adminId: actor.id,
    adminName: actor.name,
    customerId,
    action: "customer.viewed",
    metadata: { revealed: "phone" },
  });
  return { ok: true, phone: c.phone };
}

// ── Account & security mutations ─────────────────────────────────────────────

export async function setCustomerStatusAction(input: {
  customerId: string;
  status: string;
  reason: string;
}): Promise<ActionResult> {
  const actor = await admin();
  const result = await setCustomerStatus({ ...input, actor });
  if (result.ok) revalidateCustomer(input.customerId);
  return result;
}

export async function revokeCustomerSessionsAction(input: {
  customerId: string;
  reason: string;
}): Promise<ActionResult> {
  const actor = await admin();
  const result = await revokeCustomerSessions({ ...input, actor });
  if (result.ok) revalidateCustomer(input.customerId);
  return result;
}

export async function updateCustomerProfileAction(input: {
  customerId: string;
  name?: string;
  phone?: string | null;
  preferredLanguage?: string | null;
  marketingConsent?: boolean;
}): Promise<ActionResult> {
  const actor = await admin();
  const result = await updateCustomerProfile({ ...input, actor });
  if (result.ok) revalidateCustomer(input.customerId);
  return result;
}

export async function startCustomerEmailChangeAction(input: {
  customerId: string;
  newEmail: string;
  reason: string;
}): Promise<ActionResult> {
  const actor = await admin();
  const result = await startCustomerEmailChange({ ...input, actor });
  if (result.ok) revalidateCustomer(input.customerId);
  return result;
}

export async function resendVerificationAction(
  customerId: string,
): Promise<ActionResult> {
  const actor = await admin();
  return adminResendVerification({ customerId, actor });
}

export async function sendPasswordResetAction(
  customerId: string,
): Promise<ActionResult> {
  const actor = await admin();
  return adminSendPasswordReset({ customerId, actor });
}

// ── Notes ────────────────────────────────────────────────────────────────────

export async function addCustomerNoteAction(input: {
  customerId: string;
  category: string;
  body: string;
  orderId?: string | null;
}) {
  const actor = await admin();
  const result = await addCustomerNote({
    ...input,
    authorId: actor.id,
    authorName: actor.name,
  });
  if (result.ok) revalidateCustomer(input.customerId);
  return result;
}

export async function archiveCustomerNoteAction(input: {
  noteId: string;
  customerId: string;
}): Promise<ActionResult> {
  const actor = await admin();
  const result = await archiveCustomerNote({
    noteId: input.noteId,
    adminId: actor.id,
    adminName: actor.name,
  });
  if (result.ok) revalidateCustomer(input.customerId);
  return result;
}

// ── Wallet (customer-scoped, audited) ────────────────────────────────────────

export async function customerWalletAdjustAction(input: {
  customerId: string;
  direction: "credit" | "debit";
  amountMad: number;
  reason: string;
}): Promise<ActionResult> {
  const actor = await admin();
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "Un motif est obligatoire." };
  const c = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { email: true },
  });
  if (!c) return { ok: false, error: "Client introuvable." };

  // Delegates to the append-only ledger writer. A manual grant carries
  // resetsExpiration=false (never resets the inactivity timer).
  const result = await adminAdjustGhostCredit({
    customerEmail: c.email,
    direction: input.direction,
    amountMad: input.amountMad,
    reason,
    actor: actor.name,
    requestId: randomUUID(),
  });
  if (result.ok) {
    await writeAuditLog({
      adminId: actor.id,
      adminName: actor.name,
      customerId: input.customerId,
      action: "wallet.adjusted",
      reason,
      metadata: { direction: input.direction, amountMad: input.amountMad },
    });
    revalidateCustomer(input.customerId);
  }
  return result;
}

export async function customerWalletFreezeAction(input: {
  customerId: string;
  frozen: boolean;
  reason: string;
}): Promise<ActionResult> {
  const actor = await admin();
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "Un motif est obligatoire." };
  const c = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { email: true },
  });
  if (!c) return { ok: false, error: "Client introuvable." };
  const result = await adminSetWalletFrozen({
    customerEmail: c.email,
    frozen: input.frozen,
    reason,
    actor: actor.name,
  });
  if (result.ok) {
    await writeAuditLog({
      adminId: actor.id,
      adminName: actor.name,
      customerId: input.customerId,
      action: input.frozen ? "wallet.frozen" : "wallet.unfrozen",
      reason,
    });
    revalidateCustomer(input.customerId);
  }
  return result;
}

export async function customerWalletReconcileAction(input: {
  customerId: string;
}): Promise<{ ok: boolean; before?: number; after?: number; changed?: boolean; error?: string }> {
  const actor = await admin();
  const result = await repairWalletCache(input.customerId);
  await writeAuditLog({
    adminId: actor.id,
    adminName: actor.name,
    customerId: input.customerId,
    action: "wallet.reconciled",
    metadata: { before: result.before, after: result.after, changed: result.changed },
  });
  revalidateCustomer(input.customerId);
  return { ok: true, ...result };
}

// ── Support reply (reuses the existing support system) ───────────────────────

export async function customerSupportReplyAction(input: {
  customerId: string;
  ticketId: string;
  body: string;
}): Promise<ActionResult> {
  const actor = await admin();
  const result = await replySupportTicketAction(input.ticketId, input.body);
  if (result.ok) {
    await writeAuditLog({
      adminId: actor.id,
      adminName: actor.name,
      customerId: input.customerId,
      action: "customer.support_reply",
      metadata: { ticketId: input.ticketId },
    });
    revalidateCustomer(input.customerId);
  }
  return { ok: result.ok, error: result.error };
}
