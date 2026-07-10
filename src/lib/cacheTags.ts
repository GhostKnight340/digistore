/**
 * Next.js data-cache tags for the storefront. Read functions in
 * `src/lib/db/catalog.ts` are wrapped in `unstable_cache` under these tags so
 * they serve from Next's data cache instead of hitting Neon on every request.
 * Admin mutations call `revalidateTag(...)` to invalidate them instantly.
 *
 * - CATALOG_TAG      — products, variants, categories, prices, region counts.
 * - STORE_SETTINGS_TAG — the single store-settings row (pricing/inventory/theme).
 *
 * Catalog reads depend on settings (visibility/pricing), so they carry BOTH
 * tags; settings-only reads carry just STORE_SETTINGS_TAG.
 */
export const CATALOG_TAG = "catalog";
export const STORE_SETTINGS_TAG = "store-settings";
