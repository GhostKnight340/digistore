"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  EMAIL_PERMISSIONS,
  requireEmailAdmin,
  assertEmailPermission,
  permissionAllowed,
  PermissionError,
} from "@/lib/admin/permissions";
import {
  searchCustomersForComposer,
  matchExistingAccounts,
  resolveOrderModule,
  listPaymentMethodRefs,
  listCouponRefs,
  searchProductsForComposer,
  previewComposedEmail,
  summarizeSend,
  sendTestEmail,
  sendRealEmail,
  retryRecipient,
  listEmailHistory,
  getEmailSendDetail,
  saveDraft,
  listDrafts,
  loadDraft,
  type ComposePayload,
} from "@/lib/email/adminEmailService";

function mapError(error: unknown): { ok: false; error: string } {
  if (error instanceof PermissionError) return { ok: false, error: error.message };
  console.error("[adminEmails]", error);
  return { ok: false, error: "Une erreur est survenue." };
}

async function requestMeta(): Promise<Record<string, unknown>> {
  try {
    const h = await headers();
    return {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: h.get("user-agent") || null,
    };
  } catch {
    return {};
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function searchCustomersAction(query: string) {
  await assertEmailPermission(EMAIL_PERMISSIONS.COMPOSE);
  return searchCustomersForComposer(query);
}

export async function matchAccountsAction(emails: string[]) {
  await assertEmailPermission(EMAIL_PERMISSIONS.COMPOSE);
  return matchExistingAccounts(emails);
}

export async function resolveOrderModuleAction(customerId: string, orderId: string) {
  await assertEmailPermission(EMAIL_PERMISSIONS.COMPOSE);
  return resolveOrderModule(customerId, orderId);
}

export async function listPaymentMethodsAction() {
  await assertEmailPermission(EMAIL_PERMISSIONS.COMPOSE);
  return listPaymentMethodRefs();
}

export async function listCouponsAction() {
  await assertEmailPermission(EMAIL_PERMISSIONS.COMPOSE);
  return listCouponRefs();
}

export async function searchProductsAction(query: string) {
  await assertEmailPermission(EMAIL_PERMISSIONS.COMPOSE);
  return searchProductsForComposer(query);
}

export async function previewEmailAction(payload: ComposePayload, recipientIndex = 0) {
  await assertEmailPermission(EMAIL_PERMISSIONS.COMPOSE);
  return previewComposedEmail(payload, recipientIndex);
}

export async function summarizeSendAction(payload: ComposePayload) {
  await assertEmailPermission(EMAIL_PERMISSIONS.SEND);
  return summarizeSend(payload);
}

// ── Mutations ────────────────────────────────────────────────────────────────

export async function saveDraftAction(payload: ComposePayload, draftId?: string | null) {
  try {
    const admin = await assertEmailPermission(EMAIL_PERMISSIONS.COMPOSE);
    const result = await saveDraft(payload, admin, draftId);
    revalidatePath("/admin/emails/history");
    return result;
  } catch (error) {
    return mapError(error);
  }
}

export async function sendTestEmailAction(payload: ComposePayload, testAddress: string) {
  try {
    const admin = await assertEmailPermission(EMAIL_PERMISSIONS.SEND);
    const result = await sendTestEmail(payload, testAddress, admin);
    revalidatePath("/admin/emails/history");
    return result;
  } catch (error) {
    return mapError(error);
  }
}

export async function sendEmailAction(payload: ComposePayload) {
  try {
    const admin = await assertEmailPermission(EMAIL_PERMISSIONS.SEND);
    const canGrantCredit = permissionAllowed(admin.permissions, EMAIL_PERMISSIONS.CREDIT_GRANT);
    const meta = await requestMeta();
    const result = await sendRealEmail(payload, { ...admin, canGrantCredit }, meta);
    revalidatePath("/admin/emails/history");
    return result;
  } catch (error) {
    return mapError(error);
  }
}

export async function retryRecipientAction(sendId: string, recipientId: string) {
  try {
    const admin = await assertEmailPermission(EMAIL_PERMISSIONS.SEND);
    const result = await retryRecipient(sendId, recipientId, admin);
    revalidatePath("/admin/emails/history");
    return result;
  } catch (error) {
    return mapError(error);
  }
}

// ── History / drafts ─────────────────────────────────────────────────────────

export async function listHistoryAction() {
  await assertEmailPermission(EMAIL_PERMISSIONS.VIEW);
  return listEmailHistory();
}

export async function getSendDetailAction(sendId: string) {
  await assertEmailPermission(EMAIL_PERMISSIONS.VIEW);
  return getEmailSendDetail(sendId);
}

export async function listDraftsAction() {
  await assertEmailPermission(EMAIL_PERMISSIONS.VIEW);
  return listDrafts();
}

export async function loadDraftAction(draftId: string) {
  await assertEmailPermission(EMAIL_PERMISSIONS.COMPOSE);
  return loadDraft(draftId);
}

/** Effective email permissions for the current admin (UI enable/disable only). */
export async function getEmailPermissionsAction() {
  const admin = await requireEmailAdmin();
  return {
    view: permissionAllowed(admin.permissions, EMAIL_PERMISSIONS.VIEW),
    compose: permissionAllowed(admin.permissions, EMAIL_PERMISSIONS.COMPOSE),
    send: permissionAllowed(admin.permissions, EMAIL_PERMISSIONS.SEND),
    creditGrant: permissionAllowed(admin.permissions, EMAIL_PERMISSIONS.CREDIT_GRANT),
  };
}
