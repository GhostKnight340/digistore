import type { Product } from "./types";

export const CATALOG_OVERRIDES_KEY = "digitalshop.productCatalog.v1";

export type ProductOverrides = Record<string, Partial<Product>>;

export function readCatalogOverrides(): ProductOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CATALOG_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as ProductOverrides)
      : {};
  } catch {
    return {};
  }
}

export function saveCatalogOverrides(overrides: ProductOverrides): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CATALOG_OVERRIDES_KEY, JSON.stringify(overrides));
}

/** Returns only the fields that differ from the base product. */
export function diffProduct(
  base: Product,
  edited: Product,
): Partial<Product> {
  const patch: Partial<Product> = {};
  (Object.keys(edited) as (keyof Product)[]).forEach((key) => {
    const a = JSON.stringify(base[key]);
    const b = JSON.stringify(edited[key]);
    if (a !== b) (patch as Record<string, unknown>)[key] = edited[key];
  });
  return patch;
}
