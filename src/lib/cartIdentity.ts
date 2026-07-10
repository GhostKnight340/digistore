import type { CartItem, Product } from "./types";

/**
 * A stable, human-meaningful identity for a cart line that survives SKU/id
 * renames. Cart items key on the variant id (which is the SKU — a *mutable*
 * primary key, see src/lib/db/products.ts saveVariant), so an admin SKU change
 * or the SKU-cleanup script orphans saved carts. We additionally store this
 * natural key so a stale item can re-bind to the renamed variant.
 *
 * The parts mirror the variant identity used elsewhere (see
 * pricing/variant-identity.ts): the same denomination of the same parent
 * product in the same region is the same customer-facing offer, regardless of
 * what its SKU string happens to be.
 */
export interface CartIdentity {
  /** Parent product slug (Product.parentId — stable across variant renames). */
  parentId?: string;
  faceValue?: number | null;
  faceCurrency?: string;
  /** Resolved region (variant.region ?? parent region). */
  region?: string;
}

/**
 * Canonical key for a natural-key lookup, or null when there isn't enough to
 * form one (legacy v1 cart items have no identity and can't be healed).
 */
export function cartIdentityKey(parts: CartIdentity): string | null {
  if (!parts.parentId) return null;
  const face = parts.faceValue ?? "";
  const currency = (parts.faceCurrency ?? "").trim().toUpperCase();
  const region = (parts.region ?? "").trim().toUpperCase();
  return `${parts.parentId}|${face}|${currency}|${region}`;
}

/** Identity key for a catalogue product (a variant-flattened Product). */
export function productIdentityKey(product: Product): string | null {
  return cartIdentityKey({
    parentId: product.parentId,
    faceValue: product.faceValue,
    faceCurrency: product.faceCurrency,
    region: product.region,
  });
}

/** Identity key for a stored cart item. */
export function cartItemIdentityKey(item: CartItem): string | null {
  return cartIdentityKey({
    parentId: item.parentId,
    faceValue: item.faceValue,
    faceCurrency: item.faceCurrency,
    region: item.region,
  });
}
