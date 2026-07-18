"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { CATALOG_TAG, GUIDES_TAG } from "@/lib/cacheTags";
import { requireAdminCustomer } from "@/lib/auth";
import {
  deleteGuide,
  duplicateGuide,
  getAdminGuides,
  getGuideOptions,
  reorderGuides,
  saveGuide,
  seedActivationGuides,
  setGuideArchived,
  setGuideVisibility,
} from "@/lib/db/guides";
import { getCollectionProductOptions } from "@/lib/db/collections";
import { getCategoryOptions } from "@/lib/db/categories";
import type {
  ActionResult,
  AdminGuideDTO,
  CollectionProductOptionDTO,
  GuideOptionDTO,
  SaveGuideInput,
} from "@/lib/dto";

/**
 * Refresh every surface a guide change can touch: the GUIDES_TAG (index/detail/
 * search reads), CATALOG_TAG (grouped search also reads guides), the guide pages,
 * the sitemap, and the admin panel.
 */
function revalidateGuides() {
  revalidateTag(GUIDES_TAG);
  revalidateTag(CATALOG_TAG);
  revalidatePath("/guides");
  revalidatePath("/guides/[slug]", "page");
  revalidatePath("/sitemap.xml");
  revalidatePath("/admin");
}

export async function getAdminGuidesAction(): Promise<AdminGuideDTO[]> {
  await requireAdminCustomer();
  return getAdminGuides();
}

/** Options for the related-guides, related-products, and category pickers. */
export async function getGuideEditorOptionsAction(): Promise<{
  guides: GuideOptionDTO[];
  products: CollectionProductOptionDTO[];
  categories: { id: string; name: string }[];
}> {
  await requireAdminCustomer();
  const [guides, products, categories] = await Promise.all([
    getGuideOptions(),
    getCollectionProductOptions(),
    getCategoryOptions(),
  ]);
  return {
    guides,
    products,
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
  };
}

export async function saveGuideAction(
  input: SaveGuideInput,
): Promise<ActionResult & { id?: string }> {
  await requireAdminCustomer();
  const result = await saveGuide(input);
  if (result.ok) revalidateGuides();
  return result;
}

export async function duplicateGuideAction(
  id: string,
): Promise<ActionResult & { id?: string }> {
  await requireAdminCustomer();
  const result = await duplicateGuide(id);
  if (result.ok) revalidateGuides();
  return result;
}

/**
 * Toggle a guide's public visibility. Independent of publication and archive
 * state; returns the persisted value so the client can reconcile (or roll back)
 * its optimistic toggle.
 */
export async function setGuideVisibilityAction(
  id: string,
  visible: boolean,
): Promise<ActionResult & { publiclyVisible?: boolean }> {
  await requireAdminCustomer();
  const result = await setGuideVisibility(id, visible);
  if (result.ok) revalidateGuides();
  return result;
}

/**
 * One-click populate: create/refresh the standard activation-guide library on
 * the database the app is connected to (staging on staging, prod on prod). Admin
 * only, idempotent, and revalidates the public surfaces on success.
 */
export async function seedActivationGuidesAction(): Promise<
  ActionResult & { created?: number; updated?: number; total?: number }
> {
  await requireAdminCustomer();
  const result = await seedActivationGuides();
  if (result.ok) revalidateGuides();
  return result;
}

export async function setGuideArchivedAction(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  await requireAdminCustomer();
  const result = await setGuideArchived(id, archived);
  if (result.ok) revalidateGuides();
  return result;
}

export async function reorderGuidesAction(ids: string[]): Promise<ActionResult> {
  await requireAdminCustomer();
  const result = await reorderGuides(ids);
  if (result.ok) revalidateGuides();
  return result;
}

export async function deleteGuideAction(id: string): Promise<ActionResult> {
  await requireAdminCustomer();
  const result = await deleteGuide(id);
  if (result.ok) revalidateGuides();
  return result;
}
