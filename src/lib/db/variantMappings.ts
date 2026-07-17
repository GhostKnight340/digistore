/**
 * Variant ↔ supplier mapping persistence + the assembled "Approvisionnement"
 * view (mappings, margins, warnings, eligibility summary) for the variant
 * editor. All writes validate server-side — client-submitted ids, costs,
 * priorities and enabled states are never trusted blindly.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "./prisma";
import { getPricingSettings } from "./pricing-settings";
import {
  SUPPLIER_SLUGS,
  getSupplierProvider,
  isSupplierSlug,
  type SupplierSlug,
} from "@/lib/suppliers/registry";
import {
  COST_STALE_AFTER_DAYS,
  LOW_MARGIN_WARN_PCT,
  SUPPLY_SUMMARY_LABELS,
  computeFulfillmentEligibility,
  computeMappingMargin,
  isMappingComplete,
  type SupplierGlobalState,
  type SupplySummary,
} from "@/lib/suppliers/eligibility";
import type {
  ActionResult,
  MappingValidationResultDTO,
  MappingWarningCode,
  SaveVariantMappingInput,
  VariantMappingDTO,
  VariantSupplyDTO,
} from "@/lib/dto";

type MappingRow = NonNullable<Awaited<ReturnType<typeof prisma.variantSupplierMapping.findUnique>>>;

const MAX_PRIORITY = 9;

/** Global enabled/configured state for every registry supplier, in one read. */
export async function loadSupplierGlobalState(): Promise<SupplierGlobalState> {
  const rows = await prisma.supplier.findMany({ select: { id: true, enabled: true } });
  const enabledById = new Map(rows.map((row) => [row.id, row.enabled]));
  const state: SupplierGlobalState = {};
  for (const slug of SUPPLIER_SLUGS) {
    state[slug] = {
      enabled: enabledById.get(slug) ?? true,
      configured: getSupplierProvider(slug).isConfigured(),
    };
  }
  return state;
}

function mappingWarnings(
  mapping: MappingRow,
  context: {
    sellingPriceMad: number;
    variantFaceValue: number | null;
    variantFaceCurrency: string;
    variantRegion: string | null;
    supplierState: { enabled: boolean; configured: boolean } | undefined;
    margin: ReturnType<typeof computeMappingMargin>;
  },
): MappingWarningCode[] {
  const warnings: MappingWarningCode[] = [];
  if (mapping.lastValidationOk === false) warnings.push("validation_failed");
  if (mapping.lastValidationOk == null) warnings.push("never_validated");
  if (!context.supplierState?.enabled) warnings.push("supplier_disabled");
  else if (!context.supplierState.configured) warnings.push("supplier_unconfigured");
  if (
    !isMappingComplete({
      id: mapping.id,
      supplier: mapping.supplier,
      enabled: mapping.enabled,
      autoFulfillEnabled: mapping.autoFulfillEnabled,
      priority: mapping.priority,
      supplierProductId: mapping.supplierProductId,
      supplierCategoryId: mapping.supplierCategoryId,
      supplierKind: mapping.supplierKind,
      lastValidationOk: mapping.lastValidationOk,
    })
  ) {
    warnings.push("mapping_incomplete");
  }
  if (mapping.costAmount == null) warnings.push("cost_missing");
  else if (
    mapping.costUpdatedAt &&
    Date.now() - mapping.costUpdatedAt.getTime() > COST_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000
  ) {
    warnings.push("cost_stale");
  }
  if (context.margin.computable) {
    if (context.margin.marginMad <= 0) warnings.push("cost_above_price");
    else if (context.margin.marginPct < LOW_MARGIN_WARN_PCT) warnings.push("low_margin");
  }
  // Region conflict: both sides declare a region and they differ. Reloadly
  // regions are country ISO codes while Ghost regions are region-table codes,
  // so only flag exact-known conflicts (same length-2 codes that differ).
  if (
    mapping.supplierRegion &&
    context.variantRegion &&
    mapping.supplierRegion.trim().toUpperCase() !== context.variantRegion.trim().toUpperCase()
  ) {
    warnings.push("region_mismatch");
  }
  if (
    mapping.faceValue != null &&
    context.variantFaceValue != null &&
    mapping.faceValue !== context.variantFaceValue
  ) {
    warnings.push("denomination_mismatch");
  }
  return warnings;
}

function toMappingDTO(
  mapping: MappingRow,
  context: {
    sellingPriceMad: number;
    variantFaceValue: number | null;
    variantFaceCurrency: string;
    variantRegion: string | null;
    suppliers: SupplierGlobalState;
    fxRatesToMad: Record<string, number>;
  },
): VariantMappingDTO {
  const provider = isSupplierSlug(mapping.supplier) ? getSupplierProvider(mapping.supplier) : null;
  const supplierState = context.suppliers[mapping.supplier];
  const margin = computeMappingMargin({
    sellingPriceMad: context.sellingPriceMad,
    costAmount: mapping.costAmount,
    costCurrency: mapping.costCurrency,
    fxRatesToMad: context.fxRatesToMad,
  });
  return {
    id: mapping.id,
    supplier: mapping.supplier,
    supplierName: provider?.name ?? mapping.supplier,
    supplierAccentColor: provider?.accentColor ?? "#3e7bfa",
    supplierInitials: provider?.initials ?? mapping.supplier.slice(0, 2).toUpperCase(),
    supplierGloballyEnabled: supplierState?.enabled ?? false,
    supplierConfigured: supplierState?.configured ?? false,
    enabled: mapping.enabled,
    autoFulfillEnabled: mapping.autoFulfillEnabled,
    priority: mapping.priority,
    supplierProductId: mapping.supplierProductId,
    supplierCategoryId: mapping.supplierCategoryId,
    supplierKind: mapping.supplierKind,
    supplierProductName: mapping.supplierProductName,
    supplierRegion: mapping.supplierRegion,
    faceValue: mapping.faceValue,
    faceCurrency: mapping.faceCurrency,
    costAmount: mapping.costAmount,
    costCurrency: mapping.costCurrency,
    costUpdatedAt: mapping.costUpdatedAt?.toISOString() ?? null,
    lastValidatedAt: mapping.lastValidatedAt?.toISOString() ?? null,
    lastValidationOk: mapping.lastValidationOk,
    lastValidationMessage: mapping.lastValidationMessage,
    margin,
    warnings: mappingWarnings(mapping, {
      sellingPriceMad: context.sellingPriceMad,
      variantFaceValue: context.variantFaceValue,
      variantFaceCurrency: context.variantFaceCurrency,
      variantRegion: context.variantRegion,
      supplierState,
      margin,
    }),
  };
}

export async function getVariantSupply(variantId: string): Promise<VariantSupplyDTO | null> {
  await ensureDatabaseReady();
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      priceMad: true,
      faceValue: true,
      faceCurrency: true,
      region: true,
      manualFulfillmentAllowed: true,
      product: { select: { region: true } },
      supplierMappings: { orderBy: { priority: "asc" } },
    },
  });
  if (!variant) return null;

  const [suppliers, pricing] = await Promise.all([loadSupplierGlobalState(), getPricingSettings()]);
  const context = {
    sellingPriceMad: variant.priceMad,
    variantFaceValue: variant.faceValue,
    variantFaceCurrency: variant.faceCurrency,
    variantRegion: variant.region ?? variant.product.region ?? null,
    suppliers,
    fxRatesToMad: pricing.fxRatesToMad,
  };
  const eligibility = computeFulfillmentEligibility({
    mappings: variant.supplierMappings,
    suppliers,
    manualFulfillmentAllowed: variant.manualFulfillmentAllowed,
  });

  return {
    variantId: variant.id,
    sellingPriceMad: variant.priceMad,
    variantFaceValue: variant.faceValue,
    variantFaceCurrency: variant.faceCurrency,
    variantRegion: context.variantRegion,
    manualFulfillmentAllowed: variant.manualFulfillmentAllowed,
    mappings: variant.supplierMappings.map((mapping) => toMappingDTO(mapping, context)),
    summary: eligibility.summary,
    summaryLabel: SUPPLY_SUMMARY_LABELS[eligibility.summary],
  };
}

function sanitizeString(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function sanitizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export async function saveVariantMapping(
  input: SaveVariantMappingInput,
): Promise<ActionResult & { validation?: MappingValidationResultDTO; manualDisabled?: boolean }> {
  await ensureDatabaseReady();
  if (!isSupplierSlug(input.supplier)) return { ok: false, error: "Fournisseur inconnu." };
  const supplier: SupplierSlug = input.supplier;

  const supplierProductId = sanitizeString(input.supplierProductId, 120);
  if (!supplierProductId) {
    return { ok: false, error: "L’identifiant produit fournisseur est obligatoire." };
  }
  const supplierCategoryId = sanitizeString(input.supplierCategoryId, 120);
  const supplierKind = sanitizeString(input.supplierKind, 40);
  if (supplier === "fazercards" && (!supplierCategoryId || !supplierKind)) {
    return { ok: false, error: "FazerCards nécessite un type et un Category/Game ID." };
  }
  if (supplier === "reloadly" && !/^\d+$/.test(supplierProductId)) {
    return { ok: false, error: "L’identifiant produit Reloadly doit être numérique." };
  }

  const variant = await prisma.productVariant.findUnique({
    where: { id: input.variantId },
    select: { id: true },
  });
  if (!variant) return { ok: false, error: "Variante introuvable." };

  const data = {
    supplierProductId,
    supplierCategoryId,
    supplierKind,
    supplierProductName: sanitizeString(input.supplierProductName),
    supplierRegion: sanitizeString(input.supplierRegion, 8)?.toUpperCase() ?? null,
    faceValue: sanitizeNumber(input.faceValue),
    faceCurrency: sanitizeString(input.faceCurrency, 8)?.toUpperCase() ?? null,
    costAmount: sanitizeNumber(input.costAmount),
    costCurrency: sanitizeString(input.costCurrency, 8)?.toUpperCase() ?? null,
    enabled: Boolean(input.enabled),
    autoFulfillEnabled: Boolean(input.autoFulfillEnabled),
  };

  try {
    let mappingId: string;
    let isCreate = false;

    if (input.id) {
      // Edit: the mapping must exist AND belong to the claimed variant —
      // the supplier itself is immutable on edit (delete + recreate instead).
      const existing = await prisma.variantSupplierMapping.findUnique({ where: { id: input.id } });
      if (!existing || existing.variantId !== input.variantId || existing.supplier !== supplier) {
        return { ok: false, error: "Mapping introuvable pour cette variante." };
      }
      const identityChanged =
        existing.supplierProductId !== data.supplierProductId ||
        existing.supplierCategoryId !== data.supplierCategoryId ||
        existing.supplierKind !== data.supplierKind;
      await prisma.variantSupplierMapping.update({
        where: { id: input.id },
        data: {
          ...data,
          ...(data.costAmount !== existing.costAmount ? { costUpdatedAt: new Date() } : {}),
          // Pointing at a different supplier product invalidates prior checks.
          ...(identityChanged
            ? { lastValidatedAt: null, lastValidationOk: null, lastValidationMessage: null }
            : {}),
        },
      });
      mappingId = input.id;
    } else {
      // Create: next priority slot; the DB unique (variantId, supplier) blocks
      // duplicate supplier mappings even under concurrent creates.
      const created = await prisma.$transaction(async (tx) => {
        const max = await tx.variantSupplierMapping.aggregate({
          where: { variantId: input.variantId },
          _max: { priority: true },
        });
        return tx.variantSupplierMapping.create({
          data: {
            variantId: input.variantId,
            supplier,
            priority: Math.min((max._max.priority ?? 0) + 1, MAX_PRIORITY),
            ...data,
            ...(data.costAmount != null ? { costUpdatedAt: new Date() } : {}),
          },
        });
      });
      mappingId = created.id;
      isCreate = true;
    }

    // Auto-verify on save so the admin never has to click "Vérifier" as a
    // separate step. Best-effort: a provider/network error just records a
    // failed validation on the mapping (surfaced in the UI) — the save itself
    // still succeeds.
    let validation: MappingValidationResultDTO | undefined;
    try {
      validation = await validateVariantMapping(mappingId);
    } catch (validationError) {
      console.error("[variantMappings:auto-validate]", validationError);
    }

    // When a variant's FIRST supplier mapping validates OK, automatic
    // fulfillment now covers it — so default manual delivery OFF (the admin
    // can always re-enable it, and can still deliver a manual code by hand at
    // delivery time; this flag only drives the readiness summary).
    let manualDisabled = false;
    if (isCreate && validation?.ok) {
      const count = await prisma.variantSupplierMapping.count({
        where: { variantId: input.variantId },
      });
      if (count === 1) {
        const updated = await prisma.productVariant.updateMany({
          where: { id: input.variantId, manualFulfillmentAllowed: true },
          data: { manualFulfillmentAllowed: false },
        });
        manualDisabled = updated.count > 0;
      }
    }

    return { ok: true, validation, manualDisabled };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "Un mapping existe déjà pour ce fournisseur sur cette variante." };
    }
    console.error("[variantMappings:save]", error);
    return { ok: false, error: "Enregistrement du mapping impossible." };
  }
}

export async function deleteVariantMapping(id: string): Promise<ActionResult> {
  await ensureDatabaseReady();
  try {
    await prisma.variantSupplierMapping.delete({ where: { id } });
    return { ok: true };
  } catch {
    return { ok: false, error: "Mapping introuvable." };
  }
}

export async function setVariantMappingEnabled(id: string, enabled: boolean): Promise<ActionResult> {
  await ensureDatabaseReady();
  try {
    await prisma.variantSupplierMapping.update({ where: { id }, data: { enabled } });
    return { ok: true };
  } catch {
    return { ok: false, error: "Mapping introuvable." };
  }
}

/**
 * Reorders a variant's mappings: orderedIds[0] becomes priority 1 (préféré),
 * orderedIds[1] priority 2 (secours), etc. The full id set must match the
 * variant's mappings exactly — no partial reorders, no foreign ids.
 */
export async function reorderVariantMappings(
  variantId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  await ensureDatabaseReady();
  if (orderedIds.length > MAX_PRIORITY) return { ok: false, error: "Trop de mappings." };
  try {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.variantSupplierMapping.findMany({
        where: { variantId },
        select: { id: true },
      });
      const current = new Set(rows.map((row) => row.id));
      if (current.size !== orderedIds.length || orderedIds.some((id) => !current.has(id))) {
        throw new Error("mismatch");
      }
      // Two-phase update dodges any transient unique/priority collisions.
      for (let index = 0; index < orderedIds.length; index += 1) {
        await tx.variantSupplierMapping.update({
          where: { id: orderedIds[index] },
          data: { priority: 100 + index },
        });
      }
      for (let index = 0; index < orderedIds.length; index += 1) {
        await tx.variantSupplierMapping.update({
          where: { id: orderedIds[index] },
          data: { priority: index + 1 },
        });
      }
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Réordonnancement impossible — rechargez la page et réessayez." };
  }
}

export async function setManualFulfillment(
  variantId: string,
  allowed: boolean,
): Promise<ActionResult> {
  await ensureDatabaseReady();
  try {
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { manualFulfillmentAllowed: allowed },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Variante introuvable." };
  }
}

/**
 * "Vérifier le mapping" — read-only provider catalog check. NEVER places an
 * order (providers expose a dedicated validateMapping that only reads their
 * catalog). Persists the outcome + authoritative refresh facts.
 */
export async function validateVariantMapping(id: string): Promise<MappingValidationResultDTO> {
  await ensureDatabaseReady();
  const checkedAt = new Date().toISOString();
  const mapping = await prisma.variantSupplierMapping.findUnique({ where: { id } });
  if (!mapping || !isSupplierSlug(mapping.supplier)) {
    return { ok: false, message: "Mapping introuvable.", checkedAt };
  }
  const provider = getSupplierProvider(mapping.supplier);
  const result = await provider.validateMapping({
    supplierProductId: mapping.supplierProductId,
    supplierCategoryId: mapping.supplierCategoryId,
    supplierKind: mapping.supplierKind,
    supplierRegion: mapping.supplierRegion,
    faceValue: mapping.faceValue,
    faceCurrency: mapping.faceCurrency,
  });
  await prisma.variantSupplierMapping.update({
    where: { id },
    data: {
      lastValidatedAt: new Date(),
      lastValidationOk: result.ok,
      lastValidationMessage: result.message.slice(0, 500),
      ...(result.refresh?.supplierProductName
        ? { supplierProductName: result.refresh.supplierProductName }
        : {}),
      ...(result.refresh?.supplierRegion ? { supplierRegion: result.refresh.supplierRegion } : {}),
      ...(result.refresh?.costAmount != null
        ? {
            costAmount: result.refresh.costAmount,
            costCurrency: result.refresh.costCurrency ?? mapping.costCurrency,
            costUpdatedAt: new Date(),
          }
        : {}),
    },
  });
  return { ok: result.ok, message: result.message, checkedAt };
}

/**
 * Re-runs the read-only catalog check on EVERY mapping (optionally scoped to
 * one supplier) — the "Revalider tous les mappings" bulk action. Sequential
 * so provider rate limits are respected (each check is one catalog read); the
 * catalogue is small enough that this stays well within a request budget.
 * Never places an order. Returns an outcome summary.
 */
export async function revalidateAllMappings(
  supplier?: string,
): Promise<{ total: number; ok: number; failed: number }> {
  await ensureDatabaseReady();
  const mappings = await prisma.variantSupplierMapping.findMany({
    where: supplier ? { supplier } : {},
    select: { id: true },
    orderBy: { updatedAt: "asc" },
  });
  let ok = 0;
  let failed = 0;
  for (const mapping of mappings) {
    try {
      const result = await validateVariantMapping(mapping.id);
      if (result.ok) ok += 1;
      else failed += 1;
    } catch (error) {
      console.error("[variantMappings:revalidate-all]", error);
      failed += 1;
    }
  }
  return { total: mappings.length, ok, failed };
}

/**
 * Per-parent supply summary for the admin product list ("Prêt" / "Manuel
 * uniquement" / "Mapping incomplet" / "Aucun approvisionnement"): the WORST
 * summary across the parent's active variants, so a single unfulfillable
 * variant surfaces on the list.
 */
export async function getProductSupplySummaries(): Promise<Record<string, SupplySummary>> {
  await ensureDatabaseReady();
  const [variants, suppliers] = await Promise.all([
    prisma.productVariant.findMany({
      where: { active: true },
      select: {
        manualFulfillmentAllowed: true,
        product: { select: { slug: true } },
        supplierMappings: {
          select: {
            id: true,
            supplier: true,
            enabled: true,
            autoFulfillEnabled: true,
            priority: true,
            supplierProductId: true,
            supplierCategoryId: true,
            supplierKind: true,
            lastValidationOk: true,
          },
        },
      },
    }),
    loadSupplierGlobalState(),
  ]);

  const RANK: Record<SupplySummary, number> = { ready: 0, manual_only: 1, incomplete: 2, none: 3 };
  const summaries: Record<string, SupplySummary> = {};
  for (const variant of variants) {
    const { summary } = computeFulfillmentEligibility({
      mappings: variant.supplierMappings,
      suppliers,
      manualFulfillmentAllowed: variant.manualFulfillmentAllowed,
    });
    const slug = variant.product.slug;
    const current = summaries[slug];
    if (current == null || RANK[summary] > RANK[current]) summaries[slug] = summary;
  }
  return summaries;
}
