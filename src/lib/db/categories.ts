import "server-only";

import { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "./prisma";
import type { ActionResult, AdminCategoryDTO, SaveCategoryInput } from "@/lib/dto";

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
