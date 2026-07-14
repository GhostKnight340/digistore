import "server-only";
import { prisma } from "./prisma";

/**
 * Maps the bundled collection artwork (public/collections/*.webp) onto
 * collections BY SLUG. Multiple slugs may point at the same asset so naming
 * variants are caught (e.g. a France/EUR collection whether it is slugged
 * "europe-eur", "france", or "france-eur"). Shared by the CLI script
 * (scripts/assign-collection-images.ts) and the admin button so there is one
 * source of truth for the mapping and the update rules.
 */
export const COLLECTION_IMAGE_BY_SLUG: Record<string, string> = {
  gaming: "/collections/gaming.webp",
  "cartes-cadeaux": "/collections/cartes-cadeaux.webp",
  "abonnements-et-divertissement": "/collections/abonnements.webp",
  abonnements: "/collections/abonnements.webp",
  logiciels: "/collections/logiciels.webp",
  nouveautes: "/collections/nouveautes.webp",
  "produits-populaires": "/collections/populaires.webp",
  populaires: "/collections/populaires.webp",
  "selection-du-navigator": "/collections/navigator.webp",
  navigator: "/collections/navigator.webp",
  global: "/collections/global.webp",
  // Europe / France (Eiffel + FR artwork)
  "europe-eur": "/collections/france.webp",
  europe: "/collections/france.webp",
  france: "/collections/france.webp",
  "france-eur": "/collections/france.webp",
  // Morocco (arch + MA artwork)
  maroc: "/collections/maroc.webp",
  "maroc-mad": "/collections/maroc.webp",
  morocco: "/collections/maroc.webp",
};

export interface AssignImagesResult {
  /** Slugs whose imageUrl was set (or would be, in a dry run). */
  set: string[];
  /** Slugs already pointing at the target image. */
  unchanged: string[];
  /** Slugs with a different image, left untouched (no force). */
  kept: string[];
  /** Mapped slugs that don't exist as collections. */
  missing: string[];
}

/**
 * Assign artwork to collections by slug. Non-destructive: only sets `imageUrl`
 * on existing, mapped collections; never creates/deletes/reorders and never
 * touches memberships or any other field. A collection that already has a
 * DIFFERENT image is kept unless `force`. Idempotent. Pass `apply: false` for a
 * dry-run preview (no writes).
 */
export async function assignCollectionImages(
  opts: { apply: boolean; force?: boolean } = { apply: false },
): Promise<AssignImagesResult> {
  const { apply, force = false } = opts;
  const slugs = Object.keys(COLLECTION_IMAGE_BY_SLUG);
  const rows = await prisma.collection.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, imageUrl: true },
  });
  const bySlug = new Map(rows.map((row) => [row.slug, row]));

  const result: AssignImagesResult = { set: [], unchanged: [], kept: [], missing: [] };
  const updates: { id: string; imageUrl: string }[] = [];

  for (const slug of slugs) {
    const target = COLLECTION_IMAGE_BY_SLUG[slug];
    const row = bySlug.get(slug);
    if (!row) {
      result.missing.push(slug);
      continue;
    }
    if (row.imageUrl === target) {
      result.unchanged.push(slug);
      continue;
    }
    if (row.imageUrl && !force) {
      result.kept.push(slug);
      continue;
    }
    result.set.push(slug);
    updates.push({ id: row.id, imageUrl: target });
  }

  if (apply && updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.collection.update({ where: { id: u.id }, data: { imageUrl: u.imageUrl } }),
      ),
    );
  }

  return result;
}
