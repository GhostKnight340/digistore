"use server";

import { getCurrentCustomer } from "@/lib/auth";
import { evaluatePromoForItems } from "@/lib/db/promoCodes";
import { getGhostCreditWallet } from "@/lib/db/ghostCredit";
import type { PromoValidationResultDTO, GhostCreditWalletDTO } from "@/lib/dto";

/**
 * Checkout: validate a promo code against the current cart and return a
 * customer-facing preview (discount or Ghost Credit). This is a PREVIEW only —
 * the authoritative re-validation + reservation happens server-side inside
 * createOrder. All limit/eligibility logic runs on the server; the client never
 * decides a total.
 */
export async function validatePromoCodeAction(input: {
  code: string;
  items: { productId: string; quantity: number }[];
  /** Guest email typed on the checkout form (used for per-customer/first-order
   *  preview checks; ignored when logged in). */
  email?: string;
}): Promise<PromoValidationResultDTO> {
  if (!input.code?.trim()) return { ok: false, error: "Veuillez saisir un code promo." };
  if (!input.items?.length) return { ok: false, error: "Votre panier est vide." };

  const customer = await getCurrentCustomer();
  const customerEmail = customer?.email ?? input.email?.trim().toLowerCase() ?? "";
  return evaluatePromoForItems(input.code, input.items, {
    isLoggedIn: Boolean(customer),
    customerId: customer?.id ?? null,
    customerEmail,
  });
}

/** Account wallet: current Ghost Credit balance + ledger history for the user. */
export async function getMyGhostCreditWalletAction(): Promise<GhostCreditWalletDTO | null> {
  const customer = await getCurrentCustomer();
  if (!customer) return null;
  return getGhostCreditWallet(customer.id);
}

/**
 * Account: toggle the "email me 3 days before my Ghost Credit expires" preference
 * for the CURRENT customer (id derived from the session, never from the client).
 */
export async function setExpiryReminderAction(enabled: boolean): Promise<{ ok: boolean }> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false };
  const { prisma } = await import("@/lib/db/prisma");
  await prisma.customer.update({
    where: { id: customer.id },
    data: { expirationReminderEnabled: Boolean(enabled) },
  });
  return { ok: true };
}
