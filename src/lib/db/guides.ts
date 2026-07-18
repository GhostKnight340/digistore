import "server-only";

import { unstable_cache } from "next/cache";
import { ensureDatabaseReady, prisma } from "./prisma";
import { getPublicParentCards, getStoreSettings } from "./catalog";
import { CATALOG_TAG, GUIDES_TAG } from "@/lib/cacheTags";
import {
  guideHref,
  slugifyGuide,
  normalizeGuideBlocks,
  normalizeGuideFaq,
  normalizeGuideNavigatorTip,
  normalizeGuideAliases,
  normalizeGuideIcon,
  defaultGuideNavigatorTip,
} from "@/lib/guide";
import {
  ACTIVATION_GUIDE_SPECS,
  buildActivationBlocks,
  buildActivationFaq,
  activationMatchKeywords,
} from "@/lib/guides/activationLibrary";
import {
  computeProductCoverage,
  summarizeCoverage,
  type CoverageSettings,
  type GuideCoverageSummary,
  type ProductCoverage,
} from "@/lib/guides/coverage";
import { isInventoryEnabled, isStockTracked } from "@/lib/storeSettings";
import type { Prisma } from "@prisma/client";
import type {
  AdminGuideDTO,
  GuideOptionDTO,
  GuideProductLinkDTO,
  SaveGuideInput,
  ActionResult,
} from "@/lib/dto";
import type { GuideDetail, GuideIndexItem } from "@/lib/types";

// A guide is publicly visible when it is published, not archived, and either has
// no schedule or its scheduled time has passed. This predicate is the single
// gate used by every public read (index, detail, search, sitemap) so a draft or
// future-scheduled guide can never leak.
function publicGuideWhere(now: Date): Prisma.GuideWhereInput {
  return {
    published: true,
    // Independent visibility switch. Turning it off removes the guide from the
    // index, search, rails, platform filters, sitemap AND its direct URL, while
    // leaving `published`/`archivedAt` untouched.
    publiclyVisible: true,
    archivedAt: null,
    OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
  };
}

const INDEX_SELECT = {
  slug: true,
  title: true,
  summary: true,
  platform: true,
  icon: true,
  heroImageUrl: true,
  featured: true,
  categoryId: true,
  updatedAt: true,
} satisfies Prisma.GuideSelect;

function toIndexItem(row: {
  slug: string;
  title: string;
  summary: string;
  platform: string;
  icon: string;
  heroImageUrl: string | null;
  featured: boolean;
  categoryId: string | null;
  updatedAt: Date;
}): GuideIndexItem {
  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    platform: row.platform,
    icon: normalizeGuideIcon(row.icon) || "",
    heroImageUrl: row.heroImageUrl,
    featured: row.featured,
    categoryId: row.categoryId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Public reads (cached) ────────────────────────────────────────────────────

/** All published, current guides for the /guides index, ordered for display. */
export async function getPublishedGuideIndex(): Promise<GuideIndexItem[]> {
  await ensureDatabaseReady();
  return getPublishedGuideIndexCached();
}

const getPublishedGuideIndexCached = unstable_cache(
  async (): Promise<GuideIndexItem[]> => {
    const rows = await prisma.guide.findMany({
      where: publicGuideWhere(new Date()),
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
      select: INDEX_SELECT,
    });
    return rows.map(toIndexItem);
  },
  ["guides-index"],
  { tags: [GUIDES_TAG] },
);

/** Published guide slugs for the sitemap (published + current only). */
export async function getPublishedGuideSlugs(): Promise<
  { slug: string; updatedAt: Date }[]
> {
  await ensureDatabaseReady();
  return prisma.guide.findMany({
    where: publicGuideWhere(new Date()),
    select: { slug: true, updatedAt: true },
  });
}

/**
 * Full public guide by slug, or null when missing/draft/scheduled/archived.
 * Related products and guides are resolved LIVE and visibility-filtered here —
 * hidden/inactive products and unpublished related guides never render.
 */
export async function getGuideBySlug(
  slug: string,
  opts?: { preview?: boolean },
): Promise<GuideDetail | null> {
  await ensureDatabaseReady();
  const clean = slug.trim().toLowerCase();
  if (!clean) return null;
  const now = new Date();
  // Admin preview intentionally bypasses the visibility/publication gates so a
  // hidden or draft guide can still be reviewed before going live. The CALLER
  // is responsible for proving the viewer is an admin.
  const where: Prisma.GuideWhereInput = opts?.preview
    ? { slug: clean, archivedAt: null }
    : { slug: clean, ...publicGuideWhere(now) };
  const row = await prisma.guide.findFirst({
    where,
    include: {
      category: { select: { name: true } },
      products: { orderBy: { sortOrder: "asc" }, select: { productId: true } },
    },
  });
  if (!row) return null;

  // Source links from the relation, falling back to the legacy array for rows
  // written before the relation existed. `getPublicParentCards` already drops
  // anything not publicly sellable, so a non-empty result is exactly the
  // condition for showing a product CTA on the guide.
  const linkedProductIds =
    row.products.length > 0
      ? Array.from(new Set(row.products.map((p) => p.productId)))
      : row.relatedProductIds;
  const productMap = await getPublicParentCards(linkedProductIds);
  const relatedProducts = linkedProductIds
    .map((id) => productMap.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  // Whether a customer can ACTUALLY buy something right now. Deliberately
  // stricter than `relatedProducts`: a card can render while every variant is
  // out of stock. Using the same coverage rule as the admin guarantees the
  // public CTA and admin coverage can never disagree.
  const coverage = summarizeCoverage(
    (await loadGuideCoverage([row.id])).get(row.id) ?? [],
    row.expectedProducts ?? [],
  );

  let relatedGuides: GuideIndexItem[] = [];
  if (row.relatedGuideIds.length > 0) {
    const guideRows = await prisma.guide.findMany({
      where: {
        id: { in: row.relatedGuideIds },
        slug: { not: clean },
        ...publicGuideWhere(now),
      },
      select: { ...INDEX_SELECT, id: true },
    });
    // Preserve the admin-defined order from relatedGuideIds.
    const byId = new Map(guideRows.map((g) => [g.id, g]));
    relatedGuides = row.relatedGuideIds
      .map((id) => byId.get(id))
      .filter((g): g is NonNullable<typeof g> => Boolean(g))
      .map(toIndexItem);
  }

  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    platform: row.platform,
    icon: normalizeGuideIcon(row.icon) || "",
    heroImageUrl: row.heroImageUrl,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    content: normalizeGuideBlocks(row.content),
    faq: normalizeGuideFaq(row.faq),
    navigatorTip: normalizeGuideNavigatorTip(row.navigatorTip),
    relatedProducts,
    hasSellableProduct: coverage.hasSellableProduct,
    relatedGuides,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    socialImageUrl: row.socialImageUrl,
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

/**
 * Minimal published-guide rows for the storefront search ranker. Returns only
 * customer-facing text (title/summary/platform/aliases) — never draft content.
 */
export async function getSearchableGuides(): Promise<
  {
    slug: string;
    title: string;
    summary: string;
    platform: string;
    icon: string;
    aliases: string[];
  }[]
> {
  await ensureDatabaseReady();
  return getSearchableGuidesCached();
}

const getSearchableGuidesCached = unstable_cache(
  async () => {
    const rows = await prisma.guide.findMany({
      where: publicGuideWhere(new Date()),
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
      select: {
        slug: true,
        title: true,
        summary: true,
        platform: true,
        icon: true,
        aliases: true,
      },
      take: 200,
    });
    return rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      platform: row.platform,
      icon: normalizeGuideIcon(row.icon) || "",
      aliases: row.aliases ?? [],
    }));
  },
  ["guides-search"],
  { tags: [GUIDES_TAG, CATALOG_TAG] },
);

// ── Admin reads/writes ───────────────────────────────────────────────────────

function toAdminDTO(
  row: Prisma.GuideGetPayload<object>,
  coverage: GuideCoverageSummary = summarizeCoverage([], []),
  productLinks: GuideProductLinkDTO[] = [],
): AdminGuideDTO {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    platform: row.platform,
    categoryId: row.categoryId,
    heroImageUrl: row.heroImageUrl ?? "",
    icon: normalizeGuideIcon(row.icon) || "",
    content: normalizeGuideBlocks(row.content),
    faq: normalizeGuideFaq(row.faq),
    navigatorTip: normalizeGuideNavigatorTip(row.navigatorTip),
    // Sourced from the GuideProduct relation when available (the legacy array
    // is kept in sync on write and only used as a fallback for stale rows).
    relatedProductIds:
      productLinks.length > 0
        ? Array.from(new Set(productLinks.map((l) => l.productId)))
        : row.relatedProductIds ?? [],
    productLinks,
    relatedGuideIds: row.relatedGuideIds ?? [],
    aliases: row.aliases ?? [],
    expectedProducts: row.expectedProducts ?? [],
    coverage,
    published: row.published,
    publiclyVisible: row.publiclyVisible,
    featured: row.featured,
    sortOrder: row.sortOrder,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    socialImageUrl: row.socialImageUrl ?? "",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Resolve every guide↔product link against the LIVE catalog and roll it into a
 * per-guide coverage summary. One batched query for all guides — availability is
 * derived, never stored, so a product going inactive is reflected immediately.
 * `guideIds` scopes the load; omit it to cover every guide.
 */
async function loadGuideCoverage(
  guideIds?: string[],
): Promise<Map<string, ProductCoverage[]>> {
  const settings = await getStoreSettings();
  const coverageSettings: CoverageSettings = {
    inventoryEnabled: isInventoryEnabled(settings),
    stockTracked: isStockTracked(settings),
  };

  const links = await prisma.guideProduct.findMany({
    where: guideIds ? { guideId: { in: guideIds } } : undefined,
    orderBy: [{ sortOrder: "asc" }],
    select: {
      guideId: true,
      productId: true,
      variantId: true,
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          active: true,
          region: true,
          categoryRecord: { select: { active: true } },
          variants: {
            select: {
              id: true,
              name: true,
              active: true,
              stockMode: true,
              region: true,
              manualFulfillmentAllowed: true,
              _count: {
                select: {
                  digitalCodes: { where: { status: "unused" } },
                  supplierMappings: { where: { enabled: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const byGuide = new Map<string, ProductCoverage[]>();
  for (const link of links) {
    const product = link.product
      ? {
          id: link.product.id,
          name: link.product.name,
          slug: link.product.slug,
          active: link.product.active,
          region: link.product.region,
          // A product with no (or a disabled) category record is not publicly
          // sellable — mirrors the getPublicParentCards category filter.
          categoryActive: link.product.categoryRecord?.active === true,
          variants: link.product.variants.map((v) => ({
            id: v.id,
            name: v.name,
            active: v.active,
            stockMode: v.stockMode,
            region: v.region,
            manualFulfillmentAllowed: v.manualFulfillmentAllowed,
            enabledSupplierMappings: v._count.supplierMappings,
            unusedCodes: v._count.digitalCodes,
          })),
        }
      : null;
    const coverage = computeProductCoverage(
      { productId: link.productId, variantId: link.variantId, product },
      coverageSettings,
    );
    const list = byGuide.get(link.guideId) ?? [];
    list.push(coverage);
    byGuide.set(link.guideId, list);
  }
  return byGuide;
}

/** Guides + their live product coverage, for the admin list. */
export async function getAdminGuides(): Promise<AdminGuideDTO[]> {
  await ensureDatabaseReady();
  const rows = await prisma.guide.findMany({
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    include: {
      products: {
        orderBy: { sortOrder: "asc" },
        select: { productId: true, variantId: true },
      },
    },
  });
  const coverageByGuide = await loadGuideCoverage(rows.map((r) => r.id));
  return rows.map((row) =>
    toAdminDTO(
      row,
      summarizeCoverage(coverageByGuide.get(row.id) ?? [], row.expectedProducts ?? []),
      row.products.map((p) => ({ productId: p.productId, variantId: p.variantId })),
    ),
  );
}

/** Compact guide options for the admin related-guides picker. */
export async function getGuideOptions(): Promise<GuideOptionDTO[]> {
  await ensureDatabaseReady();
  const rows = await prisma.guide.findMany({
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: { id: true, slug: true, title: true, platform: true, published: true },
  });
  return rows;
}

async function ensureUniqueSlug(
  desired: string,
  excludeId: string | null,
): Promise<string> {
  const base = slugifyGuide(desired) || "guide";
  let slug = base;
  let n = 2;
  // Bounded loop — appends -2, -3, ... until free. Slugs are unique-indexed.
  for (;;) {
    const clash = await prisma.guide.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!clash) return slug;
    slug = `${base}-${n++}`;
  }
}

/**
 * Create or update a guide. All content is normalized/sanitized through the
 * shared guide model before persistence, so unsafe or malformed JSON can never
 * be stored. `publishedAt` is stamped the first time a guide becomes published.
 */
export async function saveGuide(
  input: SaveGuideInput,
): Promise<ActionResult & { id?: string }> {
  await ensureDatabaseReady();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Le titre est requis." };

  const slug = await ensureUniqueSlug(input.slug || title, input.id ?? null);

  const existing = input.id
    ? await prisma.guide.findUnique({
        where: { id: input.id },
        select: { id: true, published: true, publishedAt: true },
      })
    : null;
  if (input.id && !existing) return { ok: false, error: "Guide introuvable." };

  // Validate the linked category exists (defensive against stale client ids).
  let categoryId: string | null = null;
  if (input.categoryId) {
    const cat = await prisma.category.findUnique({
      where: { id: input.categoryId },
      select: { id: true },
    });
    categoryId = cat?.id ?? null;
  }

  // Only link products that still exist — a stale client id must never break a
  // save (and the GuideProduct FK would reject it anyway).
  const requestedProductIds = Array.from(new Set(input.relatedProductIds)).slice(0, 24);
  const productIds =
    requestedProductIds.length > 0
      ? (
          await prisma.product.findMany({
            where: { id: { in: requestedProductIds } },
            select: { id: true },
          })
        ).map((p) => p.id)
      : [];

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const nowPublished = Boolean(input.published);
  // Stamp publishedAt the first time it goes live; keep the original afterwards.
  const publishedAt = nowPublished
    ? existing?.publishedAt ?? new Date()
    : existing?.published
      ? existing.publishedAt // keep prior stamp when unpublishing
      : null;

  const data = {
    slug,
    title,
    summary: input.summary.trim().slice(0, 300),
    platform: input.platform.trim().slice(0, 60),
    categoryId,
    heroImageUrl: input.heroImageUrl.trim() || null,
    icon: normalizeGuideIcon(input.icon) || "",
    content: normalizeGuideBlocks(input.content) as unknown as Prisma.InputJsonValue,
    faq: normalizeGuideFaq(input.faq) as unknown as Prisma.InputJsonValue,
    navigatorTip: normalizeGuideNavigatorTip(
      input.navigatorTip,
    ) as unknown as Prisma.InputJsonValue,
    // Legacy mirror of the GuideProduct relation, kept in sync for one release.
    relatedProductIds: productIds,
    relatedGuideIds: Array.from(
      new Set(input.relatedGuideIds.filter((id) => id !== input.id)),
    ).slice(0, 12),
    aliases: normalizeGuideAliases(input.aliases),
    expectedProducts: normalizeExpectedProducts(input.expectedProducts),
    published: nowPublished,
    // Default to visible for new guides so publishing behaves as expected.
    publiclyVisible: input.publiclyVisible !== false,
    featured: Boolean(input.featured),
    sortOrder: Number.isFinite(input.sortOrder) ? Math.trunc(input.sortOrder) : 0,
    scheduledAt,
    publishedAt,
    seoTitle: input.seoTitle.trim().slice(0, 70),
    seoDescription: input.seoDescription.trim().slice(0, 200),
    socialImageUrl: input.socialImageUrl.trim() || null,
  } satisfies Prisma.GuideUncheckedCreateInput;

  // Persist the guide and its product links together, so a partial write can
  // never leave the relation disagreeing with the legacy mirror.
  const saved = await prisma.$transaction(async (tx) => {
    const guide = input.id
      ? await tx.guide.update({ where: { id: input.id }, data })
      : await tx.guide.create({ data });
    await tx.guideProduct.deleteMany({ where: { guideId: guide.id } });
    if (productIds.length > 0) {
      await tx.guideProduct.createMany({
        data: productIds.map((productId, index) => ({
          guideId: guide.id,
          productId,
          variantId: null,
          sortOrder: index,
        })),
        skipDuplicates: true,
      });
    }
    return guide;
  });
  return { ok: true, id: saved.id };
}

/** Trim, cap and de-duplicate the admin-authored "Produits attendus" labels. */
function normalizeExpectedProducts(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const label = typeof entry === "string" ? entry.trim().slice(0, 120) : "";
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out.slice(0, 30);
}

/**
 * Flip a guide's public visibility without touching publication or archive
 * state. Returns the new value so the caller can reconcile optimistic UI.
 */
export async function setGuideVisibility(
  id: string,
  visible: boolean,
): Promise<ActionResult & { publiclyVisible?: boolean }> {
  await ensureDatabaseReady();
  const existing = await prisma.guide.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: "Guide introuvable." };
  const updated = await prisma.guide.update({
    where: { id },
    data: { publiclyVisible: visible },
    select: { publiclyVisible: true },
  });
  return { ok: true, publiclyVisible: updated.publiclyVisible };
}

export async function duplicateGuide(
  id: string,
): Promise<ActionResult & { id?: string }> {
  await ensureDatabaseReady();
  const source = await prisma.guide.findUnique({
    where: { id },
    include: {
      products: { orderBy: { sortOrder: "asc" }, select: { productId: true, variantId: true } },
    },
  });
  if (!source) return { ok: false, error: "Guide introuvable." };
  const slug = await ensureUniqueSlug(`${source.slug}-copie`, null);
  const count = await prisma.guide.count();
  const created = await prisma.guide.create({
    data: {
      // Carry over the product links and planning list so the copy keeps its
      // coverage. Visibility follows the default (true) but stays invisible in
      // practice because the duplicate starts unpublished.
      products: {
        create: source.products.map((p, index) => ({
          productId: p.productId,
          variantId: p.variantId,
          sortOrder: index,
        })),
      },
      expectedProducts: source.expectedProducts,
      slug,
      title: `${source.title} (copie)`,
      summary: source.summary,
      platform: source.platform,
      categoryId: source.categoryId,
      heroImageUrl: source.heroImageUrl,
      icon: source.icon,
      content: (source.content ?? undefined) as Prisma.InputJsonValue | undefined,
      faq: (source.faq ?? undefined) as Prisma.InputJsonValue | undefined,
      navigatorTip: (source.navigatorTip ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
      relatedProductIds: source.relatedProductIds,
      relatedGuideIds: source.relatedGuideIds,
      aliases: source.aliases,
      // A duplicate always starts as an unpublished draft.
      published: false,
      featured: false,
      sortOrder: count,
      seoTitle: source.seoTitle,
      seoDescription: source.seoDescription,
      socialImageUrl: source.socialImageUrl,
    },
  });
  return { ok: true, id: created.id };
}

export async function setGuideArchived(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  await ensureDatabaseReady();
  const existing = await prisma.guide.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: "Guide introuvable." };
  await prisma.guide.update({
    where: { id },
    data: {
      archivedAt: archived ? new Date() : null,
      // Archiving also removes it from public reads even if it was published.
      ...(archived ? { published: false } : {}),
    },
  });
  return { ok: true };
}

export async function reorderGuides(ids: string[]): Promise<ActionResult> {
  await ensureDatabaseReady();
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.guide.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
  return { ok: true };
}

export async function deleteGuide(id: string): Promise<ActionResult> {
  await ensureDatabaseReady();
  const existing = await prisma.guide.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: "Guide introuvable." };
  await prisma.guide.delete({ where: { id } });
  return { ok: true };
}

/**
 * Populate (or refresh) the standard activation-guide library — the platforms we
 * sell plus the popular ones customers ask about. Idempotent: upserts by slug, so
 * re-running restores the canonical content without creating duplicates. Related
 * products + brand categories are matched against the LIVE catalog at run time,
 * so links resolve whatever database this runs against. Sibling guides are
 * cross-linked by family (icon) in a second pass. The caller revalidates.
 */
export async function seedActivationGuides(): Promise<
  ActionResult & { created?: number; updated?: number; total?: number }
> {
  await ensureDatabaseReady();

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, name: true, brand: true, category: true, slug: true },
    }),
    prisma.category.findMany({ select: { id: true, slug: true, name: true } }),
  ]);

  const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const productHay = products.map((p) => ({
    id: p.id,
    hay: norm(`${p.name} ${p.brand ?? ""} ${p.category} ${p.slug}`),
  }));
  const categoryHay = categories.map((c) => ({ id: c.id, hay: norm(`${c.id} ${c.slug} ${c.name}`) }));

  const now = new Date();
  let created = 0;
  let updated = 0;

  for (const [index, spec] of ACTIVATION_GUIDE_SPECS.entries()) {
    const keywords = activationMatchKeywords(spec)
      .map(norm)
      .filter((k) => k.length >= 4);
    const relatedProductIds = productHay
      .filter((p) => keywords.some((k) => p.hay.includes(k)))
      .map((p) => p.id)
      .slice(0, 3);
    const categoryId = categoryHay.find((c) => keywords.some((k) => c.hay.includes(k)))?.id ?? null;

    const existing = await prisma.guide.findUnique({
      where: { slug: spec.slug },
      select: { id: true, publishedAt: true },
    });

    const data = {
      title: spec.title,
      summary: spec.summary,
      platform: spec.platform,
      categoryId,
      icon: spec.icon,
      content: normalizeGuideBlocks(buildActivationBlocks(spec)) as unknown as Prisma.InputJsonValue,
      faq: normalizeGuideFaq(buildActivationFaq(spec)) as unknown as Prisma.InputJsonValue,
      navigatorTip: normalizeGuideNavigatorTip({
        enabled: true,
        ...spec.tip,
      }) as unknown as Prisma.InputJsonValue,
      relatedProductIds,
      aliases: normalizeGuideAliases(spec.aliases),
      published: true,
      featured: Boolean(spec.featured),
      sortOrder: index + 1,
      publishedAt: existing?.publishedAt ?? now,
      scheduledAt: null,
      archivedAt: null,
      seoTitle: spec.seoTitle,
      seoDescription: spec.seoDescription,
    };

    const guide = existing
      ? await prisma.guide.update({ where: { slug: spec.slug }, data, select: { id: true } })
      : await prisma.guide.create({ data: { slug: spec.slug, ...data }, select: { id: true } });
    if (existing) updated += 1;
    else created += 1;

    // Mirror the matched products into the real relation (authoritative).
    await prisma.guideProduct.deleteMany({ where: { guideId: guide.id } });
    if (relatedProductIds.length > 0) {
      await prisma.guideProduct.createMany({
        data: relatedProductIds.map((productId, index) => ({
          guideId: guide.id,
          productId,
          variantId: null,
          sortOrder: index,
        })),
        skipDuplicates: true,
      });
    }
  }

  // Cross-link siblings sharing a family (icon), up to 4 each.
  const rows = await prisma.guide.findMany({
    where: { slug: { in: ACTIVATION_GUIDE_SPECS.map((s) => s.slug) } },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(rows.map((r) => [r.slug, r.id]));
  const familyBySlug = new Map(ACTIVATION_GUIDE_SPECS.map((s) => [s.slug, s.icon]));
  for (const spec of ACTIVATION_GUIDE_SPECS) {
    const relatedGuideIds = ACTIVATION_GUIDE_SPECS.filter(
      (o) => o.slug !== spec.slug && familyBySlug.get(o.slug) === spec.icon,
    )
      .slice(0, 4)
      .map((o) => idBySlug.get(o.slug))
      .filter((id): id is string => Boolean(id));
    await prisma.guide.update({ where: { slug: spec.slug }, data: { relatedGuideIds } });
  }

  return { ok: true, created, updated, total: ACTIVATION_GUIDE_SPECS.length };
}

/** Convenience re-export so link sites can import from one place. */
export { guideHref, defaultGuideNavigatorTip };
