"use server";

import { revalidatePath } from "next/cache";
import { requireAdminCustomer } from "@/lib/auth";
import {
  listPromoCodes,
  getPromoCodeDetail,
  getPromoScopeOptions,
  savePromoCode,
  setPromoActive,
  archivePromoCode,
  duplicatePromoCode,
  deletePromoCode,
} from "@/lib/db/promoCodes";
import { adminAdjustGhostCredit, adminSetWalletFrozen } from "@/lib/db/ghostCreditAdmin";
import { reconcileAllWallets, type WalletReconcileRow } from "@/lib/db/walletReconcile";
import type {
  ActionResult,
  AdminPromoCodeSummaryDTO,
  AdminPromoCodeDetailDTO,
  PromoScopeOptionDTO,
  SavePromoCodeInput,
} from "@/lib/dto";

function revalidate() {
  revalidatePath("/admin");
}

export async function getPromoCodesAction(): Promise<AdminPromoCodeSummaryDTO[]> {
  await requireAdminCustomer();
  return listPromoCodes();
}

export async function getPromoCodeDetailAction(id: string): Promise<AdminPromoCodeDetailDTO | null> {
  await requireAdminCustomer();
  return getPromoCodeDetail(id);
}

export async function getPromoScopeOptionsAction(): Promise<{
  products: PromoScopeOptionDTO[];
  categories: PromoScopeOptionDTO[];
}> {
  await requireAdminCustomer();
  return getPromoScopeOptions();
}

export async function savePromoCodeAction(
  input: SavePromoCodeInput,
): Promise<ActionResult & { id?: string }> {
  const admin = await requireAdminCustomer();
  const result = await savePromoCode(input, admin.name);
  if (result.ok) revalidate();
  return result;
}

export async function setPromoActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const admin = await requireAdminCustomer();
  const result = await setPromoActive(id, active, admin.name);
  if (result.ok) revalidate();
  return result;
}

export async function archivePromoCodeAction(id: string, archived: boolean): Promise<ActionResult> {
  const admin = await requireAdminCustomer();
  const result = await archivePromoCode(id, archived, admin.name);
  if (result.ok) revalidate();
  return result;
}

export async function duplicatePromoCodeAction(id: string): Promise<ActionResult & { id?: string }> {
  const admin = await requireAdminCustomer();
  const result = await duplicatePromoCode(id, admin.name);
  if (result.ok) revalidate();
  return result;
}

export async function deletePromoCodeAction(id: string): Promise<ActionResult> {
  await requireAdminCustomer();
  const result = await deletePromoCode(id);
  if (result.ok) revalidate();
  return result;
}

/**
 * Admin-safe manual Ghost Credit correction (grant or reverse) with a mandatory
 * reason. Always writes a new ledger row — never edits history.
 */
export async function adminAdjustGhostCreditAction(input: {
  customerEmail: string;
  direction: "credit" | "debit";
  amountMad: number;
  reason: string;
  /** Stable per-request id (idempotency): the UI generates it once per form. */
  requestId: string;
}): Promise<ActionResult> {
  const admin = await requireAdminCustomer();
  const result = await adminAdjustGhostCredit({ ...input, actor: admin.name });
  if (result.ok) revalidate();
  return result;
}

/** Admin: freeze / unfreeze a customer's wallet (blocks spending). */
export async function adminSetWalletFrozenAction(input: {
  customerEmail: string;
  frozen: boolean;
  reason: string;
}): Promise<ActionResult> {
  const admin = await requireAdminCustomer();
  const result = await adminSetWalletFrozen({ ...input, actor: admin.name });
  if (result.ok) revalidate();
  return result;
}

/** Admin: read-only wallet reconciliation (ledger-derived vs cached balances). */
export async function getWalletReconciliationAction(): Promise<{
  checked: number;
  mismatches: WalletReconcileRow[];
}> {
  await requireAdminCustomer();
  return reconcileAllWallets();
}
