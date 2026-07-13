"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { CATALOG_TAG } from "@/lib/cacheTags";
import { requireAdminCustomer } from "@/lib/auth";
import {
  deleteCollection,
  duplicateCollection,
  getAdminCollections,
  getCollectionProductOptions,
  reorderCollections,
  saveCollection,
} from "@/lib/db/collections";
import {
  getSeedCatalog,
  getPopularParentIds,
  seedCollectionBySlug,
} from "@/lib/db/collectionsSeed";
import { buildCollectionPlans } from "@/lib/collections/autobuild";
import type {
  ActionResult,
  AdminCollectionDTO,
  AutoCollectionResultDTO,
  CollectionProductOptionDTO,
  SaveCollectionInput,
} from "@/lib/dto";

/**
 * Refresh every surface a collection change can touch: the CATALOG_TAG data
 * cache (grouped search reads collections), the ISR homepage, the collection
 * pages, the sitemap, and the admin panel.
 */
function revalidateCollections() {
  revalidateTag(CATALOG_TAG);
  revalidatePath("/", "layout");
  revalidatePath("/", "page");
  revalidatePath("/collections/[slug]", "page");
  revalidatePath("/sitemap.xml");
  revalidatePath("/admin");
}

export async function getAdminCollectionsAction(): Promise<AdminCollectionDTO[]> {
  await requireAdminCustomer();
  return getAdminCollections();
}

export async function getCollectionProductOptionsAction(): Promise<
  CollectionProductOptionDTO[]
> {
  await requireAdminCustomer();
  return getCollectionProductOptions();
}

export async function saveCollectionAction(
  input: SaveCollectionInput,
): Promise<ActionResult & { id?: string }> {
  await requireAdminCustomer();
  const result = await saveCollection(input);
  if (result.ok) revalidateCollections();
  return result;
}

export async function duplicateCollectionAction(
  id: string,
): Promise<ActionResult & { id?: string }> {
  await requireAdminCustomer();
  const result = await duplicateCollection(id);
  if (result.ok) revalidateCollections();
  return result;
}

export async function reorderCollectionsAction(ids: string[]): Promise<ActionResult> {
  await requireAdminCustomer();
  const result = await reorderCollections(ids);
  if (result.ok) revalidateCollections();
  return result;
}

export async function deleteCollectionAction(id: string): Promise<ActionResult> {
  await requireAdminCustomer();
  const result = await deleteCollection(id);
  if (result.ok) revalidateCollections();
  return result;
}

/**
 * Generate the curated collections from the REAL catalogue. With `apply=false`
 * it only previews (no writes). With `apply=true` it idempotently upserts each
 * non-skipped collection by slug (never deleting existing ones). Same logic as
 * the `npm run seed:collections` CLI, exposed as the admin "Générer depuis le
 * catalogue" button.
 */
export async function generateCollectionsAction(
  apply: boolean,
): Promise<AutoCollectionResultDTO> {
  await requireAdminCustomer();
  const [catalog, popularIds] = await Promise.all([
    getSeedCatalog(),
    getPopularParentIds(),
  ]);
  const eligible = catalog.filter((product) => product.eligible);
  const ineligibleCount = catalog.length - eligible.length;
  const plans = buildCollectionPlans(eligible, popularIds);

  const summary = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
  const result: AutoCollectionResultDTO = {
    applied: apply,
    plans: [],
    ineligibleCount,
    summary,
  };

  for (const plan of plans) {
    if (plan.skipped) {
      summary.skipped += 1;
      result.plans.push({
        slug: plan.meta.slug,
        name: plan.meta.name,
        productCount: plan.products.length,
        productNames: plan.products.map((p) => p.name),
        showOnHomepage: plan.meta.showOnHomepage,
        sortOrder: plan.meta.sortOrder,
        skipped: true,
        reason: plan.reason,
      });
      continue;
    }

    let status: "created" | "updated" | "unchanged" | undefined;
    if (apply) {
      const { key: _key, ...meta } = plan.meta;
      void _key;
      const saved = await seedCollectionBySlug({
        ...meta,
        productIds: plan.products.map((p) => p.id),
      });
      status = saved.status;
      summary[saved.status] += 1;
    }

    result.plans.push({
      slug: plan.meta.slug,
      name: plan.meta.name,
      productCount: plan.products.length,
      productNames: plan.products.map((p) => p.name),
      showOnHomepage: plan.meta.showOnHomepage,
      sortOrder: plan.meta.sortOrder,
      skipped: false,
      status,
    });
  }

  if (apply) revalidateCollections();
  return result;
}
