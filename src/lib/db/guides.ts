import "server-only";

import { unstable_cache } from "next/cache";
import { ensureDatabaseReady, prisma } from "./prisma";
import { getPublicParentCards } from "./catalog";
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
import type { Prisma } from "@prisma/client";
import type {
  AdminGuideDTO,
  GuideOptionDTO,
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
export async function getGuideBySlug(slug: string): Promise<GuideDetail | null> {
  await ensureDatabaseReady();
  const clean = slug.trim().toLowerCase();
  if (!clean) return null;
  const now = new Date();
  const row = await prisma.guide.findFirst({
    where: { slug: clean, ...publicGuideWhere(now) },
    include: { category: { select: { name: true } } },
  });
  if (!row) return null;

  const productMap = await getPublicParentCards(row.relatedProductIds);
  const relatedProducts = row.relatedProductIds
    .map((id) => productMap.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

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

function toAdminDTO(row: Prisma.GuideGetPayload<object>): AdminGuideDTO {
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
    relatedProductIds: row.relatedProductIds ?? [],
    relatedGuideIds: row.relatedGuideIds ?? [],
    aliases: row.aliases ?? [],
    published: row.published,
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

export async function getAdminGuides(): Promise<AdminGuideDTO[]> {
  await ensureDatabaseReady();
  const rows = await prisma.guide.findMany({
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
  });
  return rows.map(toAdminDTO);
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
    relatedProductIds: Array.from(new Set(input.relatedProductIds)).slice(0, 12),
    relatedGuideIds: Array.from(
      new Set(input.relatedGuideIds.filter((id) => id !== input.id)),
    ).slice(0, 12),
    aliases: normalizeGuideAliases(input.aliases),
    published: nowPublished,
    featured: Boolean(input.featured),
    sortOrder: Number.isFinite(input.sortOrder) ? Math.trunc(input.sortOrder) : 0,
    scheduledAt,
    publishedAt,
    seoTitle: input.seoTitle.trim().slice(0, 70),
    seoDescription: input.seoDescription.trim().slice(0, 200),
    socialImageUrl: input.socialImageUrl.trim() || null,
  } satisfies Prisma.GuideUncheckedCreateInput;

  const saved = input.id
    ? await prisma.guide.update({ where: { id: input.id }, data })
    : await prisma.guide.create({ data });
  return { ok: true, id: saved.id };
}

export async function duplicateGuide(
  id: string,
): Promise<ActionResult & { id?: string }> {
  await ensureDatabaseReady();
  const source = await prisma.guide.findUnique({ where: { id } });
  if (!source) return { ok: false, error: "Guide introuvable." };
  const slug = await ensureUniqueSlug(`${source.slug}-copie`, null);
  const count = await prisma.guide.count();
  const created = await prisma.guide.create({
    data: {
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

/** Convenience re-export so link sites can import from one place. */
export { guideHref, defaultGuideNavigatorTip };
