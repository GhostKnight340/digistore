/**
 * Guide → product coverage.
 *
 * Decides, for every product a guide is linked to, whether a customer can
 * actually buy it right now — and when not, exactly why. The rules deliberately
 * MIRROR the storefront gates in src/lib/db/catalog.ts (`isVariantPublic` /
 * `variantStockStatus` / the `getPublicParentCards` filter) so admin coverage
 * can never claim something the shop contradicts.
 *
 * Availability is NEVER stored — it is always derived from live product,
 * variant, category and inventory state, so a product going inactive updates
 * every guide's coverage immediately.
 *
 * Inventory-awareness: when the global inventory system is OFF, stock is not a
 * factor at all and no stock wording is produced anywhere (`stockStatus` stays
 * null). See `isInventoryEnabled` / `isStockTracked` in src/lib/storeSettings.
 *
 * Client-safe: pure data in, pure data out (no `server-only`, no Prisma), so the
 * admin UI can render and re-summarize without a round-trip.
 */

/** Why a linked product cannot currently be sold. */
export type CoverageReason =
  | "product_missing"
  | "product_inactive"
  | "category_inactive"
  | "no_active_variant"
  | "out_of_stock"
  | "no_supplier_route";

/** French admin copy for each red state. Kept here so list + detail agree. */
export const COVERAGE_REASON_LABELS: Record<CoverageReason, string> = {
  product_missing: "Produit absent du catalogue",
  product_inactive: "Produit masqué ou archivé",
  category_inactive: "Catégorie masquée",
  no_active_variant: "Variante indisponible",
  out_of_stock: "Rupture de stock",
  no_supplier_route: "Aucun mapping fournisseur actif",
};

/** Longer tooltip copy explaining what the admin should do about it. */
export const COVERAGE_REASON_HINTS: Record<CoverageReason, string> = {
  product_missing:
    "Ce produit n'existe plus dans le catalogue. Retirez le lien ou recréez le produit.",
  product_inactive:
    "Le produit existe mais il est désactivé : il n'apparaît pas en boutique.",
  category_inactive:
    "La catégorie du produit est désactivée, ce qui masque le produit en boutique.",
  no_active_variant:
    "Aucune déclinaison active pour ce produit : rien n'est achetable.",
  out_of_stock: "Aucune déclinaison n'est actuellement en stock.",
  no_supplier_route:
    "Aucune déclinaison n'a de route de livraison : ni fournisseur actif, ni livraison manuelle.",
};

export type CoverageStatus = "available" | "unavailable";
export type CoverageStockStatus = "in_stock" | "out_of_stock";

export interface CoverageVariantInput {
  id: string;
  name: string;
  active: boolean;
  /** "automatic" | "force_in_stock" | "force_out_of_stock" */
  stockMode: string;
  /** Variant-level region override; null inherits the product region. */
  region: string | null;
  manualFulfillmentAllowed: boolean;
  /** Count of supplier mappings that are enabled (auto-fulfilment routes). */
  enabledSupplierMappings: number;
  /** Unused digital codes on hand. Only consulted when stock is tracked. */
  unusedCodes: number;
}

export interface CoverageProductInput {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  region: string;
  /** False when the product's category record is disabled. */
  categoryActive: boolean;
  variants: CoverageVariantInput[];
}

/** One `GuideProduct` row resolved against the catalog. */
export interface CoverageLinkInput {
  productId: string;
  /** Null = the link covers the whole product family (all denominations). */
  variantId: string | null;
  /** Null when the product no longer exists. */
  product: CoverageProductInput | null;
}

export interface CoverageSettings {
  inventoryEnabled: boolean;
  /** inventory enabled AND not in "manual" (always-in-stock) mode. */
  stockTracked: boolean;
}

export interface ProductCoverage {
  productId: string;
  variantId: string | null;
  /** Product name, or the raw id when the product is gone. */
  name: string;
  slug: string | null;
  /** Variant/denomination label when the link pins one, else null. */
  variantName: string | null;
  region: string | null;
  status: CoverageStatus;
  reason: CoverageReason | null;
  reasonLabel: string | null;
  reasonHint: string | null;
  /** Null whenever the inventory system is disabled — never render stock then. */
  stockStatus: CoverageStockStatus | null;
  /** Admin deep-link, null when the product no longer exists. */
  adminHref: string | null;
}

/** Mirrors the private `normalizeStockMode` in src/lib/db/catalog.ts. */
function normalizeStockMode(value: string): "automatic" | "force_in_stock" | "force_out_of_stock" {
  return value === "force_in_stock" || value === "force_out_of_stock" ? value : "automatic";
}

function unavailable(
  base: Omit<ProductCoverage, "status" | "reason" | "reasonLabel" | "reasonHint">,
  reason: CoverageReason,
): ProductCoverage {
  return {
    ...base,
    status: "unavailable",
    reason,
    reasonLabel: COVERAGE_REASON_LABELS[reason],
    reasonHint: COVERAGE_REASON_HINTS[reason],
  };
}

/**
 * Resolve a single guide↔product link to a green/red state with one reason.
 * Reasons are evaluated most-fundamental first so the message points at the
 * real blocker (a missing product is reported as missing, not "out of stock").
 */
export function computeProductCoverage(
  link: CoverageLinkInput,
  settings: CoverageSettings,
): ProductCoverage {
  const product = link.product;

  if (!product) {
    return unavailable(
      {
        productId: link.productId,
        variantId: link.variantId,
        name: link.productId,
        slug: null,
        variantName: null,
        region: null,
        stockStatus: null,
        adminHref: null,
      },
      "product_missing",
    );
  }

  const pinned = link.variantId
    ? product.variants.find((v) => v.id === link.variantId) ?? null
    : null;
  const base = {
    productId: product.id,
    variantId: link.variantId,
    name: product.name,
    slug: product.slug,
    variantName: pinned?.name ?? null,
    region: pinned?.region ?? product.region,
    stockStatus: null as CoverageStockStatus | null,
    adminHref: `/admin?tab=products&product=${encodeURIComponent(product.id)}`,
  };

  if (!product.active) return unavailable(base, "product_inactive");
  if (!product.categoryActive) return unavailable(base, "category_inactive");

  // A pinned variant that no longer exists behaves like a dead denomination.
  const candidates = link.variantId ? (pinned ? [pinned] : []) : product.variants;
  const active = candidates.filter((v) => v.active);
  if (active.length === 0) return unavailable(base, "no_active_variant");

  // Inventory OFF: availability is active-only, exactly like isVariantPublic.
  if (!settings.inventoryEnabled) {
    const fulfillable = active.filter(
      (v) => v.manualFulfillmentAllowed || v.enabledSupplierMappings > 0,
    );
    if (fulfillable.length === 0) return unavailable(base, "no_supplier_route");
    return { ...base, status: "available", reason: null, reasonLabel: null, reasonHint: null };
  }

  // Inventory ON: the force_out_of_stock override applies.
  const sellable = active.filter(
    (v) => normalizeStockMode(v.stockMode) !== "force_out_of_stock",
  );
  if (sellable.length === 0) {
    return unavailable({ ...base, stockStatus: "out_of_stock" }, "out_of_stock");
  }

  // Quantities only matter when stock is actually tracked.
  const inStock = settings.stockTracked
    ? sellable.filter(
        (v) => normalizeStockMode(v.stockMode) === "force_in_stock" || v.unusedCodes > 0,
      )
    : sellable;
  if (inStock.length === 0) {
    return unavailable({ ...base, stockStatus: "out_of_stock" }, "out_of_stock");
  }

  const fulfillable = inStock.filter(
    (v) => v.manualFulfillmentAllowed || v.enabledSupplierMappings > 0,
  );
  if (fulfillable.length === 0) {
    return unavailable({ ...base, stockStatus: "in_stock" }, "no_supplier_route");
  }

  return {
    ...base,
    stockStatus: "in_stock",
    status: "available",
    reason: null,
    reasonLabel: null,
    reasonHint: null,
  };
}

/** An admin-authored "expected product" label with no catalog counterpart. */
export interface ExpectedProductEntry {
  label: string;
  /** Always true — expected entries exist precisely because we don't sell them. */
  missing: true;
}

export interface GuideCoverageSummary {
  available: ProductCoverage[];
  unavailable: ProductCoverage[];
  /** Documentation-only planning entries. NEVER catalog records. */
  expected: ExpectedProductEntry[];
  counts: {
    available: number;
    unavailable: number;
    expected: number;
    linked: number;
  };
  /** True when the guide has at least one product a customer can buy now. */
  hasSellableProduct: boolean;
}

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Roll per-link results into the summary the admin row/editor renders.
 * Expected labels that turn out to match an available product are dropped, so
 * the UI never simultaneously claims the same thing is sold and missing.
 */
export function summarizeCoverage(
  items: ProductCoverage[],
  expectedProducts: string[] = [],
): GuideCoverageSummary {
  const available = items.filter((i) => i.status === "available");
  const unavailable = items.filter((i) => i.status === "unavailable");

  const availableNames = new Set(available.map((i) => normalizeLabel(i.name)));
  const seen = new Set<string>();
  const expected: ExpectedProductEntry[] = [];
  for (const raw of expectedProducts) {
    const label = raw.trim();
    if (!label) continue;
    const key = normalizeLabel(label);
    if (seen.has(key) || availableNames.has(key)) continue;
    seen.add(key);
    expected.push({ label, missing: true });
  }

  return {
    available,
    unavailable,
    expected,
    counts: {
      available: available.length,
      unavailable: unavailable.length,
      expected: expected.length,
      linked: items.length,
    },
    hasSellableProduct: available.length > 0,
  };
}

/** Compact French summary line, e.g. "6 disponibles · 2 indisponibles". */
export function coverageSummaryLabel(summary: GuideCoverageSummary): string {
  const parts: string[] = [];
  parts.push(`${summary.counts.available} disponible${summary.counts.available === 1 ? "" : "s"}`);
  if (summary.counts.unavailable > 0) {
    parts.push(
      `${summary.counts.unavailable} indisponible${summary.counts.unavailable === 1 ? "" : "s"}`,
    );
  }
  if (summary.counts.expected > 0) {
    parts.push(`${summary.counts.expected} attendu${summary.counts.expected === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}
