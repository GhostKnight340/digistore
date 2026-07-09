import "server-only";

import { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "./prisma";
import { ensureCategoryForProduct } from "./categories";
import { getReloadlyEnvironment, isReloadlyConfigured } from "@/lib/reloadly/config";
import {
  getGiftCardProducts,
  getGiftCardProduct,
  buildReloadlyCostInputs,
  type ReloadlyGiftCardProduct,
} from "@/lib/reloadly/operations";
import { computeProviderCost } from "@/lib/pricing/cost";
import { resolveMargin, computeSuggestedPrice } from "@/lib/pricing/suggested-price";
import { getPricingSettings } from "./pricing-settings";
import type { PricingSettings } from "@/lib/pricing/types";
import { isRegionCode, reloadlyCountryToRegion } from "@/lib/regions";
import type {
  ImportReloadlyProductInput,
  ImportReloadlyResultDTO,
  ReloadlyDenominationPreviewDTO,
  ReloadlyImportDetailDTO,
  ReloadlyImportMappingStatus,
  ReloadlyImportSearchPageDTO,
  ReloadlyImportSearchRowDTO,
  SupplierEnvironment,
} from "@/lib/dto";

const DEFAULT_DELIVERY_TYPE = "Produit numérique - livraison rapide";

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function variantSku(slug: string, faceValue: number, faceCurrency: string): string {
  return slugify(`${slug}-${faceValue}-${faceCurrency}`).slice(0, 170);
}

// ─── Mapping status ──────────────────────────────────────────────────────────

/** Face values already mapped in Ghost, grouped by Reloadly product id. */
async function mappedFaceValuesByProduct(): Promise<Map<number, Set<number>>> {
  const variants = await prisma.productVariant.findMany({
    where: { reloadlyProductId: { not: null } },
    select: { reloadlyProductId: true, faceValue: true },
  });
  const map = new Map<number, Set<number>>();
  for (const v of variants) {
    if (v.reloadlyProductId == null) continue;
    const set = map.get(v.reloadlyProductId) ?? new Set<number>();
    if (v.faceValue != null) set.add(v.faceValue);
    map.set(v.reloadlyProductId, set);
  }
  return map;
}

function computeMappingStatus(
  product: { denominationType: string; fixedRecipientDenominations: number[] },
  mapped: Set<number> | undefined,
): ReloadlyImportMappingStatus {
  if (!mapped || mapped.size === 0) return "not_added";
  if (product.denominationType === "RANGE") return "partial"; // never "all" for a range
  const offered = product.fixedRecipientDenominations ?? [];
  if (offered.length > 0 && offered.every((d) => mapped.has(d))) return "added";
  return "partial";
}

// ─── Search ──────────────────────────────────────────────────────────────────

// When a text query is present, Reloadly has no name parameter, so we scan
// several pages server-side and filter locally. Bounded so a search never
// hammers the API.
const SEARCH_SCAN_PAGE_SIZE = 100;
const SEARCH_SCAN_MAX_PAGES = 8;

function toSearchRow(
  p: ReloadlyGiftCardProduct,
  mapped: Map<number, Set<number>>,
): ReloadlyImportSearchRowDTO {
  return {
    productId: p.productId,
    productName: p.productName,
    brandName: p.brand?.brandName ?? "",
    categoryName: p.category?.name ?? null,
    country: p.country?.isoName ?? "",
    countryName: p.country?.name ?? "",
    flagUrl: p.country?.flagUrl ?? null,
    logoUrl: p.logoUrls?.[0] ?? p.brand?.logoUrl ?? null,
    recipientCurrency: p.recipientCurrencyCode,
    denominationType: p.denominationType,
    fixedDenominations: p.fixedRecipientDenominations ?? [],
    minDenomination: p.minRecipientDenomination,
    maxDenomination: p.maxRecipientDenomination,
    status: p.status,
    mappingStatus: computeMappingStatus(p, mapped.get(p.productId)),
    mappedFaceValues: [...(mapped.get(p.productId) ?? [])],
  };
}

function matchesRow(
  r: ReloadlyImportSearchRowDTO,
  filters: { query?: string; denominationType?: "FIXED" | "RANGE"; includeInactive?: boolean },
): boolean {
  if (!filters.includeInactive && r.status !== "ACTIVE") return false;
  if (filters.denominationType && r.denominationType !== filters.denominationType) return false;
  const q = filters.query?.trim().toLowerCase();
  if (q) {
    return (
      r.productName.toLowerCase().includes(q) ||
      r.brandName.toLowerCase().includes(q) ||
      String(r.productId) === q ||
      (r.categoryName ?? "").toLowerCase().includes(q)
    );
  }
  return true;
}

export async function searchReloadlyImportCatalog(filters: {
  page?: number;
  size?: number;
  countryCode?: string;
  query?: string;
  denominationType?: "FIXED" | "RANGE";
  includeInactive?: boolean;
}): Promise<ReloadlyImportSearchPageDTO> {
  const mapped = await mappedFaceValuesByProduct();
  const countryCode = filters.countryCode?.trim() || undefined;
  const hasQuery = Boolean(filters.query?.trim());
  const pageSize = filters.size ?? 24;
  const page = filters.page ?? 0;

  // No text query → trust Reloadly's own pagination (cheap, one call).
  if (!hasQuery) {
    const pageData = await getGiftCardProducts({ page, size: pageSize, countryCode });
    const rows = pageData.content.map((p) => toSearchRow(p, mapped)).filter((r) => matchesRow(r, filters));
    return { rows, page: pageData.number, totalPages: pageData.totalPages, totalElements: pageData.totalElements };
  }

  // Text query → scan a bounded window and filter locally, then paginate the
  // filtered result for display.
  const all: ReloadlyImportSearchRowDTO[] = [];
  for (let p = 0; p < SEARCH_SCAN_MAX_PAGES; p += 1) {
    const pageData = await getGiftCardProducts({ page: p, size: SEARCH_SCAN_PAGE_SIZE, countryCode });
    for (const item of pageData.content) {
      const row = toSearchRow(item, mapped);
      if (matchesRow(row, filters)) all.push(row);
    }
    if (!pageData.content.length || p >= pageData.totalPages - 1) break;
  }
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const start = page * pageSize;
  return {
    rows: all.slice(start, start + pageSize),
    page,
    totalPages,
    totalElements: all.length,
  };
}

// ─── Preview computation (shared) ────────────────────────────────────────────

async function categoryMarginPct(categoryId: string | null): Promise<number | null> {
  if (!categoryId) return null;
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { marginPctOverride: true },
  });
  return cat?.marginPctOverride != null ? Number(cat.marginPctOverride) : null;
}

/**
 * Cost + suggested-price preview for one denomination. Reuses the exact Phase 1
 * engine so preview == what the pricing panel will later show. `alreadyExists`
 * and `withinBounds` are set by the caller when it has that context.
 */
function previewDenomination(
  product: ReloadlyGiftCardProduct,
  faceValue: number,
  settings: PricingSettings,
  catMarginPct: number | null,
  marginOverride: number | null,
): ReloadlyDenominationPreviewDTO {
  const base: ReloadlyDenominationPreviewDTO = {
    faceValue,
    faceCurrency: product.recipientCurrencyCode,
    providerCost: null,
    supplierCurrency: product.senderCurrencyCode,
    fxRateToMad: null,
    costInMad: null,
    marginSource: null,
    marginPct: null,
    suggestedPriceMad: null,
    expectedProfitMad: null,
    expectedMarginPct: null,
    alreadyExists: false,
    withinBounds: true,
    error: null,
  };

  const inputs = buildReloadlyCostInputs(product, faceValue);
  if (!inputs) {
    return { ...base, withinBounds: false, error: "Dénomination non proposée par Reloadly." };
  }

  const providerCost = computeProviderCost(inputs).providerCost;
  const fxRateToMad = settings.fxRatesToMad[inputs.senderCurrency.toUpperCase()] ?? null;
  const margin = resolveMargin({
    variantFixedPriceMad: null,
    variantMarginPct: marginOverride,
    productMarginPct: null,
    categoryMarginPct: catMarginPct,
    defaultMarginPct: settings.defaultMarginPct,
  });

  const outcome = computeSuggestedPrice({
    providerCost,
    supplierCurrency: inputs.senderCurrency,
    fxRateToMad,
    margin,
    roundingIncrement: settings.roundingIncrement,
    roundingMode: settings.roundingMode,
    publishedPriceMad: null,
  });

  if (!outcome.ok) {
    return {
      ...base,
      providerCost: providerCost.toNumber(),
      fxRateToMad,
      error: "Taux de change interne manquant pour la devise fournisseur.",
    };
  }

  const b = outcome.breakdown;
  const expectedProfitMad =
    b.suggestedPriceMad != null && b.costInMad != null
      ? Number((b.suggestedPriceMad - b.costInMad).toFixed(2))
      : null;
  const expectedMarginPct =
    expectedProfitMad != null && b.suggestedPriceMad
      ? Number(((expectedProfitMad / b.suggestedPriceMad) * 100).toFixed(2))
      : null;

  return {
    ...base,
    providerCost: b.providerCost,
    fxRateToMad: b.fxRateToMad,
    costInMad: b.costInMad,
    marginSource: b.marginSource,
    marginPct: b.marginPct,
    suggestedPriceMad: b.suggestedPriceMad,
    expectedProfitMad,
    expectedMarginPct,
  };
}

async function suggestCategoryId(reloadlyCategoryName: string | null): Promise<string | null> {
  const categories = await prisma.category.findMany({ select: { id: true, name: true, slug: true } });
  if (categories.length === 0) return null;
  const name = (reloadlyCategoryName ?? "").toLowerCase();
  if (name) {
    const match = categories.find(
      (c) => c.name.toLowerCase() === name || c.id.toLowerCase() === name || (c.slug ?? "").toLowerCase() === name,
    );
    if (match) return match.id;
    // "Gaming" → a category whose name contains it, or vice-versa.
    const fuzzy = categories.find(
      (c) => c.name.toLowerCase().includes(name) || name.includes(c.name.toLowerCase()),
    );
    if (fuzzy) return fuzzy.id;
  }
  return null;
}

// ─── Detail ──────────────────────────────────────────────────────────────────

export async function getReloadlyImportDetail(
  productId: number,
): Promise<ReloadlyImportDetailDTO> {
  await ensureDatabaseReady();
  const environment = getReloadlyEnvironment() as SupplierEnvironment;
  const [product, settings] = await Promise.all([getGiftCardProduct(productId), getPricingSettings()]);

  const suggestedCategoryId = await suggestCategoryId(product.category?.name ?? null);
  const catMargin = await categoryMarginPct(suggestedCategoryId);

  // Existing variants for this Reloadly product → mark alreadyExists.
  const existing = await prisma.productVariant.findMany({
    where: { reloadlyProductId: productId },
    select: { faceValue: true, faceCurrency: true },
  });
  const existingKeys = new Set(
    existing.map((v) => `${v.faceValue}:${v.faceCurrency.toUpperCase()}`),
  );

  const denominations: ReloadlyDenominationPreviewDTO[] =
    product.denominationType === "RANGE"
      ? []
      : (product.fixedRecipientDenominations ?? []).map((faceValue) => {
          const preview = previewDenomination(product, faceValue, settings, catMargin, null);
          return {
            ...preview,
            alreadyExists: existingKeys.has(
              `${faceValue}:${product.recipientCurrencyCode.toUpperCase()}`,
            ),
          };
        });

  // Last cost sync time for this product (if any) in this environment.
  const cost = await prisma.reloadlyProviderCost.findFirst({
    where: { environment, reloadlyProductId: productId },
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  });

  return {
    productId: product.productId,
    productName: product.productName,
    brandName: product.brand?.brandName ?? "",
    categoryName: product.category?.name ?? null,
    country: product.country?.isoName ?? "",
    countryName: product.country?.name ?? "",
    flagUrl: product.country?.flagUrl ?? null,
    logoUrl: product.logoUrls?.[0] ?? product.brand?.logoUrl ?? null,
    recipientCurrency: product.recipientCurrencyCode,
    senderCurrency: product.senderCurrencyCode,
    denominationType: product.denominationType,
    status: product.status,
    senderFee: product.senderFee,
    senderFeePercentage: product.senderFeePercentage,
    discountPercentage: product.discountPercentage,
    minDenomination: product.minRecipientDenomination,
    maxDenomination: product.maxRecipientDenomination,
    redeemInstructionConcise: product.redeemInstruction?.concise ?? null,
    redeemInstructionVerbose: product.redeemInstruction?.verbose ?? null,
    userIdRequired: Boolean(
      (product as { additionalRequirements?: { userIdRequired?: boolean } })
        .additionalRequirements?.userIdRequired,
    ),
    costSyncedAt: cost?.syncedAt ? cost.syncedAt.toISOString() : null,
    suggestedRegionCode: reloadlyCountryToRegion(product.country?.isoName),
    suggestedCategoryId,
    suggestedSlug: slugify(product.productName),
    denominations,
    environment,
  };
}

/**
 * Server-side preview for an explicit list of face values (used for RANGE
 * custom denominations and FIXED recalcs). Validates RANGE bounds; marks
 * already-existing variants.
 */
export async function previewReloadlyDenominations(input: {
  productId: number;
  faceValues: number[];
  categoryId: string | null;
  marginOverride: number | null;
}): Promise<ReloadlyDenominationPreviewDTO[]> {
  await ensureDatabaseReady();
  const [product, settings] = await Promise.all([
    getGiftCardProduct(input.productId),
    getPricingSettings(),
  ]);
  const catMargin = await categoryMarginPct(input.categoryId);

  const existing = await prisma.productVariant.findMany({
    where: { reloadlyProductId: input.productId },
    select: { faceValue: true, faceCurrency: true },
  });
  const existingKeys = new Set(existing.map((v) => `${v.faceValue}:${v.faceCurrency.toUpperCase()}`));

  const min = product.minRecipientDenomination;
  const max = product.maxRecipientDenomination;

  return input.faceValues.map((faceValue) => {
    const withinBounds =
      product.denominationType === "RANGE"
        ? (min == null || faceValue >= min) && (max == null || faceValue <= max)
        : (product.fixedRecipientDenominations ?? []).includes(faceValue);
    if (!withinBounds) {
      return {
        faceValue,
        faceCurrency: product.recipientCurrencyCode,
        providerCost: null,
        supplierCurrency: product.senderCurrencyCode,
        fxRateToMad: null,
        costInMad: null,
        marginSource: null,
        marginPct: null,
        suggestedPriceMad: null,
        expectedProfitMad: null,
        expectedMarginPct: null,
        alreadyExists: existingKeys.has(
          `${faceValue}:${product.recipientCurrencyCode.toUpperCase()}`,
        ),
        withinBounds: false,
        error:
          product.denominationType === "RANGE"
            ? `Hors plage Reloadly (${min ?? "?"}–${max ?? "?"} ${product.recipientCurrencyCode}).`
            : "Dénomination non proposée par Reloadly.",
      };
    }
    const preview = previewDenomination(product, faceValue, settings, catMargin, input.marginOverride);
    return {
      ...preview,
      alreadyExists: existingKeys.has(
        `${faceValue}:${product.recipientCurrencyCode.toUpperCase()}`,
      ),
    };
  });
}

// ─── Import (create/update) ──────────────────────────────────────────────────

/**
 * Creates or updates a Ghost parent product + selected variants from a Reloadly
 * product. Reloadly-only (never touches manual/local products). Places NO
 * Reloadly order. Deduplicates: an existing (product, faceValue, faceCurrency)
 * variant is skipped ("Déjà ajouté"), an existing slug is reused (variants
 * appended). Also upserts the provider-cost rows so the pricing panel reflects
 * the imported denominations immediately. NEVER auto-publishes beyond the
 * admin-provided published price on each variant.
 */
export async function importReloadlyProduct(
  input: ImportReloadlyProductInput,
): Promise<ImportReloadlyResultDTO> {
  await ensureDatabaseReady();

  const fail = (error: string): ImportReloadlyResultDTO => ({
    ok: false,
    productSlug: null,
    productName: null,
    createdProduct: false,
    createdVariants: 0,
    skippedVariants: 0,
    skippedFaceValues: [],
    error,
  });

  if (!isReloadlyConfigured()) return fail("Reloadly non configuré.");
  if (!input.name.trim() || !input.slug.trim()) return fail("Nom et slug obligatoires.");
  if (input.variants.length === 0) return fail("Sélectionnez au moins une dénomination.");

  const environment = getReloadlyEnvironment();

  // Re-fetch the product server-side — the client is never trusted for cost or
  // denomination validity.
  let product: ReloadlyGiftCardProduct;
  try {
    product = await getGiftCardProduct(input.reloadlyProductId);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Produit Reloadly introuvable.");
  }

  const category = await ensureCategoryForProduct(input.categoryId || product.category?.name || "gaming");
  if (!category.ok || !category.id) return fail(category.error ?? "Catégorie introuvable.");

  const regionCode = isRegionCode(input.regionCode) ? input.regionCode : "";
  const slug = slugify(input.slug);
  if (!slug) return fail("Slug invalide.");

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Parent product: reuse by slug, else create.
      let productRow = await tx.product.findUnique({
        where: { slug },
        select: { id: true, slug: true, name: true },
      });
      let createdProduct = false;

      if (!productRow) {
        const created = await tx.product.create({
          data: {
            name: input.name.trim(),
            slug,
            category: category.id,
            brand: input.brand.trim() || product.brand?.brandName || null,
            description: input.description,
            instructions: input.instructions || product.redeemInstruction?.verbose || null,
            priceMad: 0, // real prices live on variants; refreshed below
            region: regionCode,
            deliveryType: DEFAULT_DELIVERY_TYPE,
            imageUrl: input.imageUrl || null,
            active: input.active,
            featured: input.featured,
          },
          select: { id: true, slug: true, name: true },
        });
        productRow = created;
        createdProduct = true;
      }

      // Existing variants on this product → dedupe by (faceValue, faceCurrency).
      const existingVariants = await tx.productVariant.findMany({
        where: { productId: productRow.id },
        select: { id: true, faceValue: true, faceCurrency: true, sortOrder: true },
      });
      const existingKeys = new Set(
        existingVariants.map((v) => `${v.faceValue}:${v.faceCurrency.toUpperCase()}`),
      );
      let nextSort = existingVariants.reduce((m, v) => Math.max(m, v.sortOrder), -1) + 1;

      let createdVariants = 0;
      const skippedFaceValues: number[] = [];
      const publishedPrices: number[] = [];

      for (const v of input.variants) {
        const key = `${v.faceValue}:${v.faceCurrency.toUpperCase()}`;
        if (existingKeys.has(key)) {
          skippedFaceValues.push(v.faceValue);
          continue;
        }

        // Validate the denomination is real (server-side, not client-trusted).
        const inputs = buildReloadlyCostInputs(product, v.faceValue);
        const isReloadly = v.stockControl === "reloadly";
        if (isReloadly && !inputs) {
          skippedFaceValues.push(v.faceValue);
          continue;
        }

        const sku = variantSku(slug, v.faceValue, v.faceCurrency);
        await tx.productVariant.create({
          data: {
            id: sku,
            productId: productRow.id,
            name: `${v.faceValue} ${v.faceCurrency}`,
            priceMad: Math.max(0, Math.round(v.publishedPriceMad)),
            faceValue: v.faceValue,
            faceCurrency: v.faceCurrency,
            stockControl: isReloadly ? "reloadly" : "manual",
            stockMode: "automatic",
            reloadlyProductId: isReloadly ? input.reloadlyProductId : null,
            reloadlyCountryCode: isReloadly ? input.reloadlyCountryCode : null,
            marginPctOverride:
              v.marginPctOverride != null ? new Prisma.Decimal(v.marginPctOverride) : null,
            fixedSuggestedPriceMad: v.fixedSuggestedPriceMad ?? null,
            active: v.active,
            featured: false,
            sortOrder: nextSort++,
          },
        });
        existingKeys.add(key);
        createdVariants += 1;
        publishedPrices.push(Math.max(0, Math.round(v.publishedPriceMad)));

        // Upsert the provider-cost row so the pricing panel reflects it now.
        if (isReloadly && inputs) {
          const { providerCost } = computeProviderCost(inputs);
          await tx.reloadlyProviderCost.upsert({
            where: {
              environment_reloadlyProductId_recipientFaceValue: {
                environment,
                reloadlyProductId: input.reloadlyProductId,
                recipientFaceValue: new Prisma.Decimal(v.faceValue),
              },
            },
            update: {
              productName: inputs.productName,
              denominationType: inputs.denominationType,
              recipientCurrency: inputs.recipientCurrency,
              senderCurrency: inputs.senderCurrency,
              senderBaseCost: new Prisma.Decimal(inputs.senderBase),
              discountPercentage: new Prisma.Decimal(inputs.discountPercentage),
              senderFee: new Prisma.Decimal(inputs.senderFee),
              senderFeePercentage: new Prisma.Decimal(inputs.senderFeePercentage),
              recipientToSenderExchangeRate:
                inputs.recipientToSenderExchangeRate != null
                  ? new Prisma.Decimal(inputs.recipientToSenderExchangeRate)
                  : null,
              computedProviderCost: providerCost,
              syncedAt: new Date(),
            },
            create: {
              environment,
              reloadlyProductId: input.reloadlyProductId,
              productName: inputs.productName,
              denominationType: inputs.denominationType,
              recipientFaceValue: new Prisma.Decimal(v.faceValue),
              recipientCurrency: inputs.recipientCurrency,
              senderCurrency: inputs.senderCurrency,
              senderBaseCost: new Prisma.Decimal(inputs.senderBase),
              discountPercentage: new Prisma.Decimal(inputs.discountPercentage),
              senderFee: new Prisma.Decimal(inputs.senderFee),
              senderFeePercentage: new Prisma.Decimal(inputs.senderFeePercentage),
              recipientToSenderExchangeRate:
                inputs.recipientToSenderExchangeRate != null
                  ? new Prisma.Decimal(inputs.recipientToSenderExchangeRate)
                  : null,
              computedProviderCost: providerCost,
            },
          });
        }
      }

      // Keep the parent's display priceMad in sync with the cheapest new
      // variant (only when we actually created variants).
      if (publishedPrices.length > 0) {
        await tx.product.update({
          where: { id: productRow.id },
          data: { priceMad: Math.min(...publishedPrices) },
        });
      }

      return {
        productSlug: productRow.slug,
        productName: productRow.name,
        createdProduct,
        createdVariants,
        skippedVariants: skippedFaceValues.length,
        skippedFaceValues,
      };
    });

    return { ok: true, error: null, ...result };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("Un produit ou SKU en conflit existe déjà.");
    }
    return fail(error instanceof Error ? error.message : "Import impossible.");
  }
}
