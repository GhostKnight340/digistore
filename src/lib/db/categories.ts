import "server-only";

import { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "./prisma";
import type { ActionResult, AdminCategoryDTO, SaveCategoryInput } from "@/lib/dto";
import { normalizeCategoryLanding, hasLandingContent } from "@/lib/categoryLanding";
import { canonicalBrandKey } from "@/lib/brandAssets";
import { CONTENT, buildLanding, resolveContentKey } from "@/lib/categoryLandingContent";

const FALLBACK_ACCENTS: Record<string, string> = {
  steam: "#2a475e",
  playstation: "#0a6bff",
  xbox: "#16c60c",
  nintendo: "#ff4554",
  roblox: "#5a5a5a",
  valorant: "#ff4655",
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : "#3e7bfa";
}

function toDTO(row: {
  id: string;
  slug: string | null;
  name: string;
  description: string;
  tagline: string;
  icon: string;
  iconUrl: string | null;
  coverImageUrl: string | null;
  accentColor: string;
  active: boolean;
  sortOrder: number;
  landing?: unknown;
  _count?: { products: number };
}): AdminCategoryDTO {
  return {
    id: row.id,
    slug: row.slug || row.id,
    name: row.name,
    description: row.description || row.tagline,
    icon: row.icon,
    iconUrl: row.iconUrl,
    coverImageUrl: row.coverImageUrl,
    accentColor: row.accentColor || FALLBACK_ACCENTS[row.id] || "#3e7bfa",
    active: row.active,
    sortOrder: row.sortOrder,
    productCount: row._count?.products ?? 0,
    landing: normalizeCategoryLanding(row.landing),
  };
}

export async function getAdminCategories(): Promise<AdminCategoryDTO[]> {
  await ensureDatabaseReady();
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  return rows.map(toDTO);
}

export async function getCategoryOptions(): Promise<AdminCategoryDTO[]> {
  return getAdminCategories();
}

/**
 * Products in a category that carry a usable image, so the admin can reuse a
 * product's own media as the category cover (handy when a category holds a
 * single product). The URL is resolved the same way the storefront resolves a
 * product image (imageUrl, else the first media; data: URLs go through the
 * product-image route), so it renders identically on the category card.
 */
export async function getCategoryProductMedia(
  categoryId: string,
): Promise<{ id: string; name: string; imageUrl: string }[]> {
  await ensureDatabaseReady();
  if (!categoryId) return [];
  const products = await prisma.product.findMany({
    where: { category: categoryId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: 50,
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      media: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 1, select: { url: true } },
    },
  });
  const out: { id: string; name: string; imageUrl: string }[] = [];
  for (const p of products) {
    const raw = p.imageUrl ?? p.media[0]?.url ?? null;
    if (!raw) continue;
    const url = raw.startsWith("data:")
      ? `/api/product-image/${encodeURIComponent(p.slug)}`
      : raw;
    out.push({ id: p.id, name: p.name, imageUrl: url });
  }
  return out;
}

export async function createCategoryQuick(nameOrSlug: string): Promise<ActionResult & { category?: AdminCategoryDTO }> {
  await ensureDatabaseReady();
  const name = nameOrSlug.trim();
  const slug = slugify(name);
  if (!name || !slug) return { ok: false, error: "Nom de catégorie invalide." };

  const existing = await prisma.category.findFirst({
    where: { OR: [{ id: slug }, { slug }] },
    include: { _count: { select: { products: true } } },
  });
  if (existing) return { ok: true, category: toDTO(existing) };

  try {
    const count = await prisma.category.count();
    const created = await prisma.category.create({
      data: {
        id: slug,
        slug,
        name,
        description: "",
        tagline: "",
        icon: name.slice(0, 2).toUpperCase(),
        accentColor: "#3e7bfa",
        active: true,
        sortOrder: count,
      },
      include: { _count: { select: { products: true } } },
    });
    return { ok: true, category: toDTO(created) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.category.findFirst({
        where: { OR: [{ id: slug }, { slug }] },
        include: { _count: { select: { products: true } } },
      });
      if (raced) return { ok: true, category: toDTO(raced) };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Création impossible." };
  }
}

export async function ensureCategoryForProduct(value: string): Promise<ActionResult & { id?: string }> {
  await ensureDatabaseReady();
  const raw = value.trim();
  const slug = slugify(raw);
  if (!raw || !slug) return { ok: false, error: "Choisissez ou créez une catégorie." };

  const existing = await prisma.category.findFirst({
    where: { OR: [{ id: raw }, { slug: raw }, { id: slug }, { slug }] },
    select: { id: true },
  });
  if (existing) return { ok: true, id: existing.id };

  const created = await createCategoryQuick(raw);
  if (!created.ok || !created.category) {
    return { ok: false, error: created.error ?? "Création de la catégorie impossible." };
  }
  return { ok: true, id: created.category.id };
}

export async function saveCategory(input: SaveCategoryInput): Promise<ActionResult & { category?: AdminCategoryDTO }> {
  await ensureDatabaseReady();
  const slug = slugify(input.slug || input.name);
  const name = input.name.trim();
  if (!slug || !name) return { ok: false, error: "Le nom et le slug sont obligatoires." };

  const data = {
    slug,
    name,
    description: input.description.trim(),
    tagline: input.description.trim(),
    icon: input.icon.trim().slice(0, 8),
    iconUrl: input.iconUrl?.trim() || null,
    coverImageUrl: input.coverImageUrl?.trim() || null,
    accentColor: normalizeColor(input.accentColor),
    active: input.active,
    sortOrder: input.sortOrder,
    // Normalize on write so the persisted blob is always clean and bounded.
    landing: normalizeCategoryLanding(input.landing) as unknown as Prisma.InputJsonValue,
  };

  try {
    const saved = await prisma.$transaction(async (tx) => {
      if (!input.originalId) {
        return tx.category.create({
          data: { id: slug, ...data },
          include: { _count: { select: { products: true } } },
        });
      }

      const existing = await tx.category.findUnique({ where: { id: input.originalId } });
      if (!existing) throw new Error("Catégorie introuvable.");

      if (input.originalId === slug) {
        return tx.category.update({
          where: { id: input.originalId },
          data,
          include: { _count: { select: { products: true } } },
        });
      }

      const duplicate = await tx.category.findFirst({
        where: { OR: [{ id: slug }, { slug }] },
      });
      if (duplicate) throw new Error("Ce slug est déjà utilisé.");

      const created = await tx.category.create({
        data: {
          id: slug,
          createdAt: existing.createdAt,
          ...data,
        },
      });
      await tx.product.updateMany({
        where: { category: input.originalId },
        data: { category: slug },
      });
      await tx.category.delete({ where: { id: input.originalId } });
      return tx.category.findUniqueOrThrow({
        where: { id: created.id },
        include: { _count: { select: { products: true } } },
      });
    });
    return { ok: true, category: toDTO(saved) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "Ce slug est déjà utilisé." };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Enregistrement impossible." };
  }
}

/**
 * Populate the rich landing content for the known brand categories from the
 * predefined French copy (src/lib/categoryLandingContent). Updates ONLY the
 * `landing` column, ONLY for categories that already exist and match a brand
 * (by id/slug/alias). By default fills categories whose landing is currently
 * empty so admin edits are never clobbered; `force` overwrites. Related links
 * are resolved to real existing categories. Used by the admin "Remplir les
 * marques" button and the CLI seed script (same content source).
 */
export async function seedBrandLanding(
  options: { force?: boolean } = {},
): Promise<{ filled: string[]; skipped: string[]; unmatched: number }> {
  await ensureDatabaseReady();
  const categories = await prisma.category.findMany({
    select: { id: true, slug: true, name: true, landing: true },
  });

  // Map every existing category to a real id under several keys so both content
  // matching and related-link resolution work regardless of exact id/slug.
  const keyToId = new Map<string, string>();
  for (const c of categories) {
    keyToId.set(canonicalBrandKey(c.slug ?? c.id), c.id);
    keyToId.set(c.id.toLowerCase(), c.id);
    if (c.slug) keyToId.set(c.slug.toLowerCase(), c.id);
  }

  const filled: string[] = [];
  const skipped: string[] = [];
  let unmatched = 0;

  for (const category of categories) {
    const brandKey = canonicalBrandKey(category.slug ?? category.id);
    const content = resolveContentKey(brandKey, category.id, category.slug ?? "");
    if (!content) {
      unmatched++;
      continue;
    }
    if (!options.force && hasLandingContent(normalizeCategoryLanding(category.landing))) {
      skipped.push(category.id);
      continue;
    }

    const relatedContent = CONTENT[brandKey] ?? content;
    const relatedIds = Array.from(
      new Set(
        relatedContent.related
          .map((key) => keyToId.get(key))
          .filter((id): id is string => Boolean(id) && id !== category.id),
      ),
    );
    const landing = buildLanding(content, relatedIds);

    await prisma.category.update({
      where: { id: category.id },
      data: { landing: landing as unknown as Prisma.InputJsonValue },
    });
    filled.push(category.id);
  }

  return { filled, skipped, unmatched };
}

export async function reorderCategories(ids: string[]): Promise<ActionResult> {
  await ensureDatabaseReady();
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.category.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );
  return { ok: true };
}

export async function deleteCategory(
  id: string,
  reassignToId?: string | null,
): Promise<ActionResult> {
  await ensureDatabaseReady();
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!category) return { ok: false, error: "Catégorie introuvable." };

  if (category._count.products > 0) {
    // Category still holds products — Product.category is a required FK, so they
    // must be moved to another category before this one can go.
    if (!reassignToId) {
      return { ok: false, error: "Cette catégorie contient des produits. Déplacez-les avant suppression." };
    }
    if (reassignToId === id) {
      return { ok: false, error: "Choisissez une autre catégorie de destination." };
    }
    const target = await prisma.category.findUnique({ where: { id: reassignToId }, select: { id: true } });
    if (!target) return { ok: false, error: "Catégorie de destination introuvable." };

    // Reassign then delete atomically so a failure never leaves products
    // pointing at a category that's about to disappear.
    await prisma.$transaction([
      prisma.product.updateMany({ where: { category: id }, data: { category: reassignToId } }),
      prisma.category.delete({ where: { id } }),
    ]);
    return { ok: true };
  }

  await prisma.category.delete({ where: { id } });
  return { ok: true };
}
