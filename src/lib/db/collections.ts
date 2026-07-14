import "server-only";

import { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "./prisma";
import { getEligibleParentIds, getPublicParentCards } from "./catalog";
import { collectionState, isCollectionPublic } from "@/lib/collections/schedule";
import {
  slugifyCollection as slugify,
  clampHomepageLimit as clampLimit,
  normalizeCollectionAliases as normalizeAliases,
} from "@/lib/collections/normalize";
import {
  normalizeAccentColor,
  normalizeCollectionIcon,
  resolveCollectionIcon,
} from "@/lib/collections/icons";
import type {
  ActionResult,
  AdminCollectionDTO,
  CollectionProductOptionDTO,
  CollectionProductRefDTO,
  SaveCollectionInput,
} from "@/lib/dto";
import type {
  HomepageCollectionCard,
  Product,
  StorefrontCollection,
} from "@/lib/types";

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

type CollectionRowWithItems = Prisma.CollectionGetPayload<{
  include: { items: true };
}>;

/**
 * Live product context for the admin editor: name, category, region, starting
 * price, and whether the product is currently eligible to render on the
 * storefront (active product + active category + at least one active variant).
 */
async function productContext(
  ids: string[],
): Promise<Map<string, CollectionProductRefDTO>> {
  const map = new Map<string, CollectionProductRefDTO>();
  if (ids.length === 0) return map;
  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      slug: true,
      name: true,
      category: true,
      region: true,
      active: true,
      categoryRecord: { select: { name: true, active: true } },
      variants: { where: { active: true }, select: { priceMad: true } },
    },
  });
  for (const row of rows) {
    const prices = row.variants.map((variant) => variant.priceMad);
    const eligible =
      row.active && (row.categoryRecord?.active ?? false) && prices.length > 0;
    map.set(row.id, {
      productId: row.id,
      slug: row.slug,
      name: row.name,
      category: row.category,
      categoryName: row.categoryRecord?.name ?? row.category,
      region: row.region,
      priceFrom: prices.length > 0 ? Math.min(...prices) : null,
      active: row.active,
      eligible,
    });
  }
  return map;
}

function toDTO(
  row: CollectionRowWithItems,
  context: Map<string, CollectionProductRefDTO>,
  now: Date,
): AdminCollectionDTO {
  const items = [...row.items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => context.get(item.productId))
    .filter((ref): ref is CollectionProductRefDTO => Boolean(ref));
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.shortDescription,
    longDescription: row.longDescription,
    imageUrl: row.imageUrl,
    active: row.active,
    sortOrder: row.sortOrder,
    startAt: row.startAt ? row.startAt.toISOString() : null,
    endAt: row.endAt ? row.endAt.toISOString() : null,
    showOnHomepage: row.showOnHomepage,
    homepageTitle: row.homepageTitle,
    homepageLimit: row.homepageLimit,
    ctaLabel: row.ctaLabel,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    socialImageUrl: row.socialImageUrl,
    aliases: row.aliases,
    icon: normalizeCollectionIcon(row.icon),
    accentColor: row.accentColor,
    productCount: items.length,
    state: collectionState(row, now),
    items,
  };
}

// ── Admin CRUD ───────────────────────────────────────────────────────────────

export async function getAdminCollections(): Promise<AdminCollectionDTO[]> {
  await ensureDatabaseReady();
  const rows = await prisma.collection.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { items: true },
  });
  const allIds = [...new Set(rows.flatMap((row) => row.items.map((item) => item.productId)))];
  const context = await productContext(allIds);
  const now = new Date();
  return rows.map((row) => toDTO(row, context, now));
}

/** Lightweight, parent-level product options for the collection picker. Narrow
 *  projection so the whole catalogue is never shipped to the browser. */
export async function getCollectionProductOptions(): Promise<CollectionProductOptionDTO[]> {
  await ensureDatabaseReady();
  const rows = await prisma.product.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: 500,
    select: {
      id: true,
      slug: true,
      name: true,
      category: true,
      region: true,
      active: true,
      categoryRecord: { select: { name: true } },
      variants: { where: { active: true }, select: { priceMad: true } },
    },
  });
  return rows.map((row) => ({
    productId: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    categoryName: row.categoryRecord?.name ?? row.category,
    region: row.region,
    active: row.active,
    priceFrom: row.variants.length > 0 ? Math.min(...row.variants.map((v) => v.priceMad)) : null,
  }));
}

function buildData(input: SaveCollectionInput) {
  return {
    slug: slugify(input.slug || input.name),
    name: input.name.trim(),
    shortDescription: input.shortDescription.trim(),
    longDescription: input.longDescription.trim(),
    imageUrl: input.imageUrl?.trim() || null,
    active: input.active,
    sortOrder: input.sortOrder,
    startAt: parseDate(input.startAt),
    endAt: parseDate(input.endAt),
    showOnHomepage: input.showOnHomepage,
    homepageTitle: input.homepageTitle.trim(),
    homepageLimit: clampLimit(input.homepageLimit),
    ctaLabel: input.ctaLabel.trim(),
    seoTitle: input.seoTitle.trim(),
    seoDescription: input.seoDescription.trim(),
    socialImageUrl: input.socialImageUrl?.trim() || null,
    aliases: normalizeAliases(input.aliases),
    icon: normalizeCollectionIcon(input.icon),
    accentColor: normalizeAccentColor(input.accentColor),
  };
}

export async function saveCollection(
  input: SaveCollectionInput,
): Promise<ActionResult & { id?: string }> {
  await ensureDatabaseReady();
  const data = buildData(input);
  if (!data.name || !data.slug) {
    return { ok: false, error: "Le nom et le slug sont obligatoires." };
  }
  // Prevent duplicate membership; preserve the admin's chosen order.
  const productIds = [...new Set(input.productIds.filter(Boolean))];

  try {
    const id = await prisma.$transaction(async (tx) => {
      let collectionId = input.originalId;
      if (!collectionId) {
        const created = await tx.collection.create({ data });
        collectionId = created.id;
      } else {
        await tx.collection.update({ where: { id: collectionId }, data });
        await tx.collectionProduct.deleteMany({ where: { collectionId } });
      }
      if (productIds.length > 0) {
        await tx.collectionProduct.createMany({
          data: productIds.map((productId, index) => ({
            collectionId: collectionId as string,
            productId,
            sortOrder: index,
          })),
          skipDuplicates: true,
        });
      }
      return collectionId as string;
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return { ok: false, error: "Ce slug est déjà utilisé." };
      if (error.code === "P2003")
        return { ok: false, error: "Un produit sélectionné n'existe plus." };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Enregistrement impossible.",
    };
  }
}

export async function duplicateCollection(
  id: string,
): Promise<ActionResult & { id?: string }> {
  await ensureDatabaseReady();
  const source = await prisma.collection.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) return { ok: false, error: "Collection introuvable." };

  const base = slugify(`${source.slug}-copie`) || `${source.slug}-copie`;
  let slug = base;
  for (let attempt = 2; attempt <= 50; attempt += 1) {
    const clash = await prisma.collection.findUnique({ where: { slug }, select: { id: true } });
    if (!clash) break;
    slug = `${base}-${attempt}`;
  }
  const count = await prisma.collection.count();

  const created = await prisma.collection.create({
    data: {
      slug,
      name: `${source.name} (copie)`,
      shortDescription: source.shortDescription,
      longDescription: source.longDescription,
      imageUrl: source.imageUrl,
      // A duplicate starts inactive so it is never accidentally published.
      active: false,
      sortOrder: count,
      startAt: source.startAt,
      endAt: source.endAt,
      showOnHomepage: false,
      homepageTitle: source.homepageTitle,
      homepageLimit: source.homepageLimit,
      ctaLabel: source.ctaLabel,
      seoTitle: source.seoTitle,
      seoDescription: source.seoDescription,
      socialImageUrl: source.socialImageUrl,
      aliases: source.aliases,
      icon: source.icon,
      accentColor: source.accentColor,
      items: {
        create: source.items.map((item) => ({
          productId: item.productId,
          sortOrder: item.sortOrder,
        })),
      },
    },
  });
  return { ok: true, id: created.id };
}

export async function reorderCollections(ids: string[]): Promise<ActionResult> {
  await ensureDatabaseReady();
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.collection.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
  return { ok: true };
}

export async function deleteCollection(id: string): Promise<ActionResult> {
  await ensureDatabaseReady();
  const existing = await prisma.collection.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: "Collection introuvable." };
  // Membership rows cascade-delete; no product/category data is touched.
  await prisma.collection.delete({ where: { id } });
  return { ok: true };
}

// ── Storefront reads (uncached; rely on page ISR / force-dynamic so the
//    schedule window is evaluated per render without a cron). ────────────────

function toStorefront(
  row: CollectionRowWithItems,
  products: Product[],
): StorefrontCollection {
  return {
    slug: row.slug,
    name: row.name,
    shortDescription: row.shortDescription,
    longDescription: row.longDescription,
    imageUrl: row.imageUrl,
    ctaLabel: row.ctaLabel,
    homepageTitle: row.homepageTitle.trim() || row.name,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    socialImageUrl: row.socialImageUrl,
    products,
  };
}

/**
 * Build compact collection cards from already-fetched rows (metadata + an
 * efficient eligible parent-product count — NO resolved product cards). One
 * lightweight count query is shared across all rows (no N+1, no per-collection
 * product fetch). Collections with zero eligible products are dropped.
 */
async function buildCards(
  rows: CollectionRowWithItems[],
): Promise<HomepageCollectionCard[]> {
  const allIds = [...new Set(rows.flatMap((row) => row.items.map((item) => item.productId)))];
  const eligible = await getEligibleParentIds(allIds);
  const out: HomepageCollectionCard[] = [];
  for (const row of rows) {
    const productCount = row.items.filter((item) => eligible.has(item.productId)).length;
    if (productCount === 0) continue;
    out.push({
      slug: row.slug,
      title: row.homepageTitle.trim() || row.name,
      shortDescription: row.shortDescription,
      imageUrl: row.imageUrl,
      icon: resolveCollectionIcon(row.icon, row.name, row.aliases),
      accentColor: normalizeAccentColor(row.accentColor),
      ctaLabel: row.ctaLabel,
      productCount,
    });
  }
  return out;
}

/**
 * Compact cards for the homepage "Explorer les collections" section: active,
 * in-window collections flagged `showOnHomepage`, each with an eligible
 * parent-product count. Replaces the old per-collection product-grid feeder —
 * the homepage no longer resolves any product cards for collections.
 */
export async function getHomepageCollectionCards(): Promise<HomepageCollectionCard[]> {
  await ensureDatabaseReady();
  const now = new Date();
  const rows = await prisma.collection.findMany({
    where: { active: true, showOnHomepage: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  const live = rows.filter((row) => isCollectionPublic(row, now));
  return buildCards(live);
}

/** A single public collection (active + within its window) with all its live
 *  parent product cards. Returns null for missing, inactive, future, or expired
 *  collections — the page turns that into the normal not-found behavior. */
export async function getCollectionBySlug(
  slug: string,
): Promise<StorefrontCollection | null> {
  await ensureDatabaseReady();
  const key = slug.trim();
  if (!key) return null;
  const now = new Date();
  const row = await prisma.collection.findUnique({
    where: { slug: key },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!row || !isCollectionPublic(row, now)) return null;
  const cards = await getPublicParentCards(row.items.map((item) => item.productId));
  const products = row.items
    .map((item) => cards.get(item.productId))
    .filter((product): product is Product => Boolean(product));
  return toStorefront(row, products);
}

/** Compact cards for every public, non-empty collection — the /collections index
 *  page. Same light metadata + eligible count as the homepage cards. */
export async function getPublicCollectionCards(): Promise<HomepageCollectionCard[]> {
  await ensureDatabaseReady();
  const now = new Date();
  const rows = await prisma.collection.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  const live = rows.filter((row) => isCollectionPublic(row, now));
  return buildCards(live);
}

/** Slugs of public collections that currently have at least one eligible
 *  product — for the sitemap. Excludes inactive, future, expired, and empty.
 *  Uses the light eligible-id counter (no full card hydration). */
export async function getActiveCollectionSlugs(): Promise<string[]> {
  await ensureDatabaseReady();
  const now = new Date();
  const rows = await prisma.collection.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  const live = rows.filter((row) => isCollectionPublic(row, now));
  const allIds = [...new Set(live.flatMap((row) => row.items.map((item) => item.productId)))];
  const eligible = await getEligibleParentIds(allIds);
  return live
    .filter((row) => row.items.some((item) => eligible.has(item.productId)))
    .map((row) => row.slug);
}
