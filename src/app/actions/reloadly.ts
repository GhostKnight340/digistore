"use server";

import { requireAdminCustomer } from "@/lib/auth";
import { retryReloadlyFulfillment } from "@/lib/db/fulfillment";
import { searchGiftCardProductsForAdmin } from "@/lib/reloadly/operations";
import { isReloadlyConfigured, isReloadlyLive } from "@/lib/reloadly/config";
import type { ActionResult, ReloadlyProductSearchDTO } from "@/lib/dto";

async function assertAdminAccess() {
  await requireAdminCustomer();
}

/** Admin-only: browse the Reloadly sandbox (or live) gift-card catalog to map a variant. */
export async function searchReloadlyProductsAction(input: {
  countryCode?: string;
  query?: string;
  page?: number;
}): Promise<ReloadlyProductSearchDTO> {
  await assertAdminAccess();
  if (!isReloadlyConfigured()) {
    return { results: [], page: 0, totalPages: 0, totalElements: 0 };
  }
  return searchGiftCardProductsForAdmin({
    countryCode: input.countryCode || undefined,
    query: input.query || undefined,
    page: input.page,
  });
}

/** Whether Reloadly is configured, and whether it's sandbox or live — for admin labeling. */
export async function getReloadlyStatusAction(): Promise<{
  configured: boolean;
  live: boolean;
}> {
  await assertAdminAccess();
  return { configured: isReloadlyConfigured(), live: isReloadlyLive() };
}

/** Admin-only: retry (or first-attempt) automatic Reloadly fulfillment for one order item. */
export async function retryReloadlyFulfillmentAction(
  orderId: string,
  orderItemId: string,
): Promise<ActionResult> {
  await assertAdminAccess();
  return retryReloadlyFulfillment(orderId, orderItemId);
}
