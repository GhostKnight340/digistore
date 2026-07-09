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
import { variantIdentityKey, variantSku } from "@/lib/pricing/variant-identity";
import { getPricingSettings } from "./pricing-settings";
import { getProductList } from "./products";
import type { PricingSettings } from "@/lib/pricing/types";
import { isRegionCode, reloadlyCountryToRegion } from "@/lib/regions";
import type {
  GhostParentOptionDTO,
  ImportGroupInput,
  ImportReloadlyBatchInput,
  ImportReloadlyBatchResultDTO,
  ImportReloadlyProductInput,
  ImportReloadlyResultDTO,
  ImportedProductSummaryDTO,
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

/** A temporary Reloadly provider logo, not final Ghost.ma product art (§2). */
export function isProviderPlaceholderImage(url: string | null | undefined): boolean {
  return !!url && /cdn\.reloadly\.com/i.test(url);
}

/** Existing Ghost parent products the importer can group new variants into (§5). */
export async function listGhostParentOptions(): Promise<GhostParentOptionDTO[]> {
  const list = await getProductList();
  return list.map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    region: p.region,
    active: p.active,
    variantCount: p.variantCount,
  }));
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
    costStaleDays: settings.costStaleDays,
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
 * Pre-pass (NO db transaction): fetch + validate every distinct Reloadly product
 * referenced by the batch. External HTTP must never run inside an open Postgres
 * transaction (same rule as fulfillment).
 */
async function resolveBatchSources(
  input: ImportReloadlyBatchInput,
): Promise<
  { ok: true; products: Map<number, ReloadlyGiftCardProduct> } | { ok: false; error: string }
> {
  const ids = new Set<number>();
  for (const g of input.groups) for (const s of g.sources) ids.add(s.reloadlyProductId);
  const products = new Map<number, ReloadlyGiftCardProduct>();
  for (const id of ids) {
    try {
      products.set(id, await getGiftCardProduct(id));
    } catch (e) {
      return {
        ok: false,
        error: `Produit Reloadly #${id} introuvable : ${e instanceof Error ? e.message : ""}`,
      };
    }
  }
  return { ok: true, products };
}

function upsertCostArgs(
  environment: string,
  reloadlyProductId: number,
  faceValue: number,
  inputs: NonNullable<ReturnType<typeof buildReloadlyCostInputs>>,
) {
  const { providerCost } = computeProviderCost(inputs);
  const common = {
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
  };
  return {
    where: {
      environment_reloadlyProductId_recipientFaceValue: {
        environment,
        reloadlyProductId,
        recipientFaceValue: new Prisma.Decimal(faceValue),
      },
    },
    update: { ...common, syncedAt: new Date() },
    create: {
      environment,
      reloadlyProductId,
      recipientFaceValue: new Prisma.Decimal(faceValue),
      ...common,
    },
  };
}

/**
 * Bulk importer. Creates/updates one or more Ghost parent products and their
 * variants from selected Reloadly products, with:
 *  - draft vs publish for NEW parents (draft ⇒ product.active=false);
 *  - existing parents: their active state is PRESERVED, new variants added
 *    inactive unless activateNewVariants; existing variants/media/content kept;
 *  - grouping: multiple regional Reloadly sources → one parent (§5);
 *  - identity-based dedup (variantIdentityKey) so regional variants coexist but
 *    a repeated Reloadly mapping is skipped (§6);
 *  - admin-only competitor reference price stored, never affecting pricing (§7).
 * Places NO Reloadly order. Never touches manual/local products.
 */
export async function importReloadlyBatch(
  input: ImportReloadlyBatchInput,
): Promise<ImportReloadlyBatchResultDTO> {
  await ensureDatabaseReady();
  const empty: ImportReloadlyBatchResultDTO = {
    ok: false,
    error: null,
    productsCreated: 0,
    productsUpdated: 0,
    variantsCreated: 0,
    variantsSkipped: 0,
    draftProducts: 0,
    publishedProducts: 0,
    variantsNeedingMedia: 0,
    products: [],
  };
  const fail = (error: string): ImportReloadlyBatchResultDTO => ({ ...empty, error });

  if (!isReloadlyConfigured()) return fail("Reloadly non configuré.");
  if (input.groups.length === 0) return fail("Aucun produit à importer.");

  const environment = getReloadlyEnvironment();
  const resolved = await resolveBatchSources(input);
  if (!resolved.ok) return fail(resolved.error);
  const products = resolved.products;

  try {
    const summaries = await prisma.$transaction(async (tx) => {
      const out: ImportedProductSummaryDTO[] = [];
      for (const group of input.groups) {
        out.push(await importGroup(tx, group, input.status, environment, products));
      }
      return out;
    });

    const productsCreated = summaries.filter((s) => s.createdProduct).length;
    return {
      ok: true,
      error: null,
      productsCreated,
      productsUpdated: summaries.length - productsCreated,
      variantsCreated: summaries.reduce((n, s) => n + s.createdVariants, 0),
      variantsSkipped: summaries.reduce((n, s) => n + s.skippedVariants, 0),
      draftProducts: summaries.filter((s) => s.isDraft).length,
      publishedProducts: summaries.filter((s) => s.createdProduct && !s.isDraft).length,
      variantsNeedingMedia: summaries.filter((s) => s.needsMediaReview).length,
      products: summaries,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("Un produit ou SKU en conflit existe déjà.");
    }
    return fail(error instanceof Error ? error.message : "Import impossible.");
  }
}

async function importGroup(
  tx: Prisma.TransactionClient,
  group: ImportGroupInput,
  status: ImportReloadlyBatchInput["status"],
  environment: string,
  products: Map<number, ReloadlyGiftCardProduct>,
): Promise<ImportedProductSummaryDTO> {
  // Resolve / create the parent product.
  let productRow: { id: string; slug: string; name: string; active: boolean };
  let createdProduct = false;
  let isDraft = false;

  if (group.target.mode === "existing") {
    const existing = await tx.product.findUnique({
      where: { slug: group.target.slug },
      select: { id: true, slug: true, name: true, active: true },
    });
    if (!existing) throw new Error(`Produit Ghost.ma introuvable : ${group.target.slug}.`);
    productRow = existing; // active state PRESERVED — never toggled here
  } else {
    const t = group.target;
    const slug = slugify(t.slug);
    if (!slug) throw new Error("Slug invalide.");
    if (!t.name.trim()) throw new Error("Nom de produit obligatoire.");
    const existing = await tx.product.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, active: true },
    });
    if (existing) {
      productRow = existing; // idempotent re-import — preserve state
    } else {
      const category = await ensureCategoryForProduct(t.categoryId || "gaming");
      if (!category.ok || !category.id) throw new Error(category.error ?? "Catégorie introuvable.");
      const active = status === "publish";
      isDraft = !active;
      const created = await tx.product.create({
        data: {
          name: t.name.trim(),
          slug,
          category: category.id,
          brand: t.brand.trim() || null,
          description: t.description,
          instructions: t.instructions || null,
          priceMad: 0,
          region: isRegionCode(t.regionCode) ? t.regionCode : "",
          deliveryType: DEFAULT_DELIVERY_TYPE,
          imageUrl: t.imageUrl || null,
          active,
          featured: t.featured,
        },
        select: { id: true, slug: true, name: true, active: true },
      });
      productRow = created;
      createdProduct = true;
    }
  }

  // Existing variants → identity dedup.
  const existingVariants = await tx.productVariant.findMany({
    where: { productId: productRow.id },
    select: {
      faceValue: true,
      faceCurrency: true,
      reloadlyProductId: true,
      reloadlyCountryCode: true,
      sortOrder: true,
    },
  });
  const existingKeys = new Set(
    existingVariants
      .filter((v) => v.faceValue != null)
      .map((v) =>
        variantIdentityKey({
          faceValue: v.faceValue!,
          faceCurrency: v.faceCurrency,
          reloadlyProductId: v.reloadlyProductId,
          reloadlyCountryCode: v.reloadlyCountryCode,
        }),
      ),
  );
  let nextSort = existingVariants.reduce((m, v) => Math.max(m, v.sortOrder), -1) + 1;

  // New variants on an EXISTING parent are inactive unless explicitly activated;
  // on a NEW parent they follow the parent (visible once the parent publishes).
  const variantActive = group.target.mode === "existing" ? group.activateNewVariants : true;

  let createdVariants = 0;
  const skippedFaceValues: number[] = [];
  const publishedPrices: number[] = [];

  for (const source of group.sources) {
    const product = products.get(source.reloadlyProductId);
    if (!product) throw new Error(`Produit Reloadly #${source.reloadlyProductId} non résolu.`);

    for (const v of source.variants) {
      const isReloadly = v.stockControl === "reloadly";
      const identity = variantIdentityKey({
        faceValue: v.faceValue,
        faceCurrency: v.faceCurrency,
        reloadlyProductId: isReloadly ? source.reloadlyProductId : null,
        reloadlyCountryCode: isReloadly ? source.reloadlyCountryCode : null,
      });
      if (existingKeys.has(identity)) {
        skippedFaceValues.push(v.faceValue);
        continue;
      }

      const inputs = isReloadly ? buildReloadlyCostInputs(product, v.faceValue) : null;
      if (isReloadly && !inputs) {
        skippedFaceValues.push(v.faceValue); // not a real offered denomination
        continue;
      }

      const sku = variantSku(productRow.slug, {
        faceValue: v.faceValue,
        faceCurrency: v.faceCurrency,
        reloadlyCountryCode: isReloadly ? source.reloadlyCountryCode : null,
      });
      const priceMad = Math.max(0, Math.round(v.publishedPriceMad));

      await tx.productVariant.create({
        data: {
          id: sku,
          productId: productRow.id,
          name: `${v.faceValue} ${v.faceCurrency}`,
          priceMad,
          faceValue: v.faceValue,
          faceCurrency: v.faceCurrency,
          // Per-variant region from the Reloadly country, so a parent grouping
          // several regional sources renders a region selector on the storefront.
          // Null when it collapses to the parent's own region (single-region import).
          region: isReloadly ? reloadlyCountryToRegion(source.reloadlyCountryCode) || null : null,
          stockControl: isReloadly ? "reloadly" : "manual",
          stockMode: "automatic",
          reloadlyProductId: isReloadly ? source.reloadlyProductId : null,
          reloadlyCountryCode: isReloadly ? source.reloadlyCountryCode : null,
          marginPctOverride:
            v.marginPctOverride != null ? new Prisma.Decimal(v.marginPctOverride) : null,
          fixedSuggestedPriceMad: v.fixedSuggestedPriceMad ?? null,
          competitorReferencePriceMad: v.competitorReferencePriceMad ?? null,
          competitorReferenceSource: v.competitorReferenceSource?.trim() || null,
          active: variantActive,
          featured: false,
          sortOrder: nextSort++,
        },
      });
      existingKeys.add(identity);
      createdVariants += 1;
      publishedPrices.push(priceMad);

      if (isReloadly && inputs) {
        await tx.reloadlyProviderCost.upsert(
          upsertCostArgs(environment, source.reloadlyProductId, v.faceValue, inputs),
        );
      }
    }
  }

  // Refresh a NEWLY-created parent's display priceMad to its cheapest variant.
  if (publishedPrices.length > 0 && createdProduct) {
    await tx.product.update({
      where: { id: productRow.id },
      data: { priceMad: Math.min(...publishedPrices) },
    });
  }

  // Media readiness (§2): final Ghost media = a ProductMedia row, or an imageUrl
  // that is NOT a temporary Reloadly provider logo.
  const productWithMedia = await tx.product.findUnique({
    where: { id: productRow.id },
    select: { imageUrl: true, _count: { select: { media: true } } },
  });
  const usingProviderPlaceholder = isProviderPlaceholderImage(productWithMedia?.imageUrl);
  const hasFinalMedia =
    (productWithMedia?._count.media ?? 0) > 0 ||
    (!!productWithMedia?.imageUrl && !usingProviderPlaceholder);

  return {
    slug: productRow.slug,
    name: productRow.name,
    createdProduct,
    active: group.target.mode === "existing" ? productRow.active : status === "publish",
    isDraft: createdProduct && isDraft,
    createdVariants,
    skippedVariants: skippedFaceValues.length,
    skippedFaceValues,
    needsMediaReview: !hasFinalMedia,
    usingProviderPlaceholder,
  };
}

/**
 * Back-compat single-product import. Delegates to the batch importer as one
 * "new" group with one source. Kept so existing callers/tests keep working.
 */
export async function importReloadlyProduct(
  input: ImportReloadlyProductInput,
): Promise<ImportReloadlyResultDTO> {
  const failLegacy = (error: string): ImportReloadlyResultDTO => ({
    ok: false,
    productSlug: null,
    productName: null,
    createdProduct: false,
    createdVariants: 0,
    skippedVariants: 0,
    skippedFaceValues: [],
    error,
  });
  if (!input.name.trim() || !input.slug.trim()) return failLegacy("Nom et slug obligatoires.");
  if (input.variants.length === 0) return failLegacy("Sélectionnez au moins une dénomination.");

  const result = await importReloadlyBatch({
    status: input.active ? "publish" : "draft",
    groups: [
      {
        target: {
          mode: "new",
          name: input.name,
          slug: input.slug,
          categoryId: input.categoryId,
          brand: input.brand,
          description: input.description,
          instructions: input.instructions,
          regionCode: input.regionCode,
          featured: input.featured,
          imageUrl: input.imageUrl,
          imageIsProviderPlaceholder: isProviderPlaceholderImage(input.imageUrl),
        },
        activateNewVariants: true,
        sources: [
          {
            reloadlyProductId: input.reloadlyProductId,
            reloadlyCountryCode: input.reloadlyCountryCode,
            variants: input.variants.map((v) => ({
              faceValue: v.faceValue,
              faceCurrency: v.faceCurrency,
              publishedPriceMad: v.publishedPriceMad,
              marginPctOverride: v.marginPctOverride,
              fixedSuggestedPriceMad: v.fixedSuggestedPriceMad,
              stockControl: v.stockControl,
            })),
          },
        ],
      },
    ],
  });

  if (!result.ok) return failLegacy(result.error ?? "Import impossible.");
  const p = result.products[0];
  return {
    ok: true,
    error: null,
    productSlug: p?.slug ?? null,
    productName: p?.name ?? null,
    createdProduct: p?.createdProduct ?? false,
    createdVariants: p?.createdVariants ?? 0,
    skippedVariants: p?.skippedVariants ?? 0,
    skippedFaceValues: p?.skippedFaceValues ?? [],
  };
}

