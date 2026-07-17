/**
 * Fulfillment eligibility — THE single server-side answer to "can this
 * variant currently be fulfilled, and how?". Pure functions over plain data
 * so the same rules run in server actions, the delivery path, the admin
 * product list, and unit tests. Callers load the inputs (mappings + supplier
 * global state + variant flags) and pass them in.
 *
 * Rules:
 *  - A supplier route is available iff its mapping is enabled, automatic
 *    fulfillment is allowed on it, the supplier is globally enabled AND
 *    configured, and the last validation did not fail (never-validated is
 *    allowed but surfaces a warning).
 *  - Manual fulfillment (variant flag) is always a valid fallback route.
 *  - Priority 1 = fournisseur préféré, 2 = secours, further = fallbacks.
 */

export type MappingEligibilityInput = {
  id: string;
  supplier: string;
  enabled: boolean;
  autoFulfillEnabled: boolean;
  priority: number;
  supplierProductId: string;
  /** FazerCards needs a category too; Reloadly does not. */
  supplierCategoryId: string | null;
  supplierKind: string | null;
  lastValidationOk: boolean | null;
};

export type SupplierGlobalState = {
  /** Registry slug → { enabled (admin switch), configured (credentials present) }. */
  [slug: string]: { enabled: boolean; configured: boolean } | undefined;
};

export type FulfillmentReason =
  | "preferred_supplier_available"
  | "backup_supplier_available"
  | "fallback_supplier_available"
  | "supplier_disabled"
  | "supplier_unconfigured"
  | "mapping_disabled"
  | "mapping_invalid"
  | "mapping_incomplete"
  | "mapping_missing"
  | "auto_fulfillment_disabled"
  | "manual_available"
  | "no_route";

export type SupplierRoute = {
  mappingId: string;
  supplier: string;
  priority: number;
  role: "preferred" | "backup" | "fallback";
  /** True when the mapping has never been validated — usable, but warn. */
  neverValidated: boolean;
};

/** Polished French summary labels for the admin product list. */
export type SupplySummary = "ready" | "manual_only" | "incomplete" | "none";

export const SUPPLY_SUMMARY_LABELS: Record<SupplySummary, string> = {
  ready: "Prêt",
  manual_only: "Manuel uniquement",
  incomplete: "Mapping incomplet",
  none: "Aucun approvisionnement",
};

export type FulfillmentEligibility = {
  /** At least one route (supplier or manual) exists. */
  fulfillable: boolean;
  /** Automatic supplier routes, best (lowest priority) first. */
  supplierRoutes: SupplierRoute[];
  manualAllowed: boolean;
  summary: SupplySummary;
  /** Every reason that applies — for admin warnings, never customer-facing. */
  reasons: FulfillmentReason[];
};

/** A mapping is structurally complete when the provider can purchase from it. */
export function isMappingComplete(mapping: MappingEligibilityInput): boolean {
  if (!mapping.supplierProductId.trim()) return false;
  if (mapping.supplier === "fazercards") {
    return Boolean(mapping.supplierCategoryId?.trim()) && Boolean(mapping.supplierKind?.trim());
  }
  return true;
}

export function computeFulfillmentEligibility(input: {
  mappings: MappingEligibilityInput[];
  suppliers: SupplierGlobalState;
  manualFulfillmentAllowed: boolean;
}): FulfillmentEligibility {
  const reasons = new Set<FulfillmentReason>();
  const routes: SupplierRoute[] = [];

  const sorted = [...input.mappings].sort((a, b) => a.priority - b.priority);
  if (sorted.length === 0) reasons.add("mapping_missing");

  for (const mapping of sorted) {
    const supplier = input.suppliers[mapping.supplier];
    if (!mapping.enabled) {
      reasons.add("mapping_disabled");
      continue;
    }
    if (!mapping.autoFulfillEnabled) {
      reasons.add("auto_fulfillment_disabled");
      continue;
    }
    if (!supplier || !supplier.enabled) {
      reasons.add("supplier_disabled");
      continue;
    }
    if (!supplier.configured) {
      reasons.add("supplier_unconfigured");
      continue;
    }
    if (!isMappingComplete(mapping)) {
      reasons.add("mapping_incomplete");
      continue;
    }
    if (mapping.lastValidationOk === false) {
      reasons.add("mapping_invalid");
      continue;
    }
    routes.push({
      mappingId: mapping.id,
      supplier: mapping.supplier,
      priority: mapping.priority,
      role: mapping.priority === 1 ? "preferred" : mapping.priority === 2 ? "backup" : "fallback",
      neverValidated: mapping.lastValidationOk == null,
    });
  }

  if (routes.length > 0) {
    const best = routes[0];
    reasons.add(
      best.role === "preferred"
        ? "preferred_supplier_available"
        : best.role === "backup"
          ? "backup_supplier_available"
          : "fallback_supplier_available",
    );
  }
  if (input.manualFulfillmentAllowed) reasons.add("manual_available");

  const fulfillable = routes.length > 0 || input.manualFulfillmentAllowed;
  if (!fulfillable) reasons.add("no_route");

  const summary: SupplySummary =
    routes.length > 0
      ? "ready"
      : input.mappings.length > 0
        ? input.manualFulfillmentAllowed
          ? "incomplete" // mappings exist but none usable — manual saves the day
          : "incomplete"
        : input.manualFulfillmentAllowed
          ? "manual_only"
          : "none";

  return {
    fulfillable,
    supplierRoutes: routes,
    manualAllowed: input.manualFulfillmentAllowed,
    summary: fulfillable ? summary : "none",
    reasons: [...reasons],
  };
}

// ── Margin helpers (display only — never mutates prices) ────────────────────

export type MarginComputation =
  | {
      computable: true;
      costMad: number;
      marginMad: number;
      marginPct: number;
      converted: boolean;
    }
  | { computable: false; reason: "missing_cost" | "missing_fx_rate" };

/** Storefront/reporting currency — costs in it need no conversion. */
function isMad(currency: string): boolean {
  const c = currency.trim().toUpperCase();
  return c === "MAD" || c === "DH";
}

/**
 * Gross margin of a mapping against the Ghost selling price. Uses the
 * project's existing internal FX table (pricing settings `fxRatesToMad`) —
 * no live conversion source is introduced. When the supplier currency has no
 * configured rate, margin is declared not-computable rather than guessed.
 */
export function computeMappingMargin(input: {
  sellingPriceMad: number;
  costAmount: number | null;
  costCurrency: string | null;
  fxRatesToMad: Record<string, number>;
}): MarginComputation {
  if (input.costAmount == null || !Number.isFinite(input.costAmount) || !input.costCurrency) {
    return { computable: false, reason: "missing_cost" };
  }
  let costMad: number;
  let converted = false;
  if (isMad(input.costCurrency)) {
    costMad = input.costAmount;
  } else {
    const rate = input.fxRatesToMad[input.costCurrency.trim().toUpperCase()];
    if (rate == null || !Number.isFinite(rate) || rate <= 0) {
      return { computable: false, reason: "missing_fx_rate" };
    }
    costMad = input.costAmount * rate;
    converted = true;
  }
  const marginMad = input.sellingPriceMad - costMad;
  const marginPct = input.sellingPriceMad > 0 ? (marginMad / input.sellingPriceMad) * 100 : 0;
  return {
    computable: true,
    costMad: Math.round(costMad * 100) / 100,
    marginMad: Math.round(marginMad * 100) / 100,
    marginPct: Math.round(marginPct * 10) / 10,
    converted,
  };
}

/** Cost snapshots older than this are flagged "stale" in the admin UI. */
export const COST_STALE_AFTER_DAYS = 14;
/** Default warning threshold for thin margins (percent of selling price). */
export const LOW_MARGIN_WARN_PCT = 5;
