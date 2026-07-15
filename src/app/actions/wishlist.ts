"use server";

import { revalidatePath } from "next/cache";
import { getCurrentCustomer } from "@/lib/auth";
import {
  getWishlistSlugs,
  mergeWishlist,
  removeWishlist,
  toggleWishlist,
} from "@/lib/db/wishlist";

/**
 * Customer wishlist actions. Identity ALWAYS comes from the session
 * (`getCurrentCustomer`) — the client never supplies a customer id, so a
 * customer can only ever touch their own wishlist. Guests get `requiresAuth`
 * and keep using their local (device) wishlist.
 */

export type WishlistActionResult = {
  ok: boolean;
  saved?: boolean;
  slugs?: string[];
  requiresAuth?: boolean;
  error?: string;
};

export async function toggleWishlistAction(slug: string): Promise<WishlistActionResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, requiresAuth: true };
  const result = await toggleWishlist(customer.id, slug);
  if (result.ok) revalidatePath("/account/favoris");
  return { ok: result.ok, saved: result.saved, error: result.error };
}

export async function removeWishlistAction(slug: string): Promise<WishlistActionResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, requiresAuth: true };
  await removeWishlist(customer.id, slug);
  revalidatePath("/account/favoris");
  return { ok: true, saved: false };
}

/** Merge a guest's local slugs into the account (called once after login). */
export async function mergeWishlistAction(slugs: string[]): Promise<WishlistActionResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, requiresAuth: true };
  const merged = await mergeWishlist(customer.id, Array.isArray(slugs) ? slugs : []);
  revalidatePath("/account/favoris");
  return { ok: true, slugs: merged };
}

/** Fresh server truth for the current customer's wishlist slugs. */
export async function getWishlistSlugsAction(): Promise<WishlistActionResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, requiresAuth: true };
  return { ok: true, slugs: await getWishlistSlugs(customer.id) };
}
