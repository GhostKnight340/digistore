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
import type {
  ActionResult,
  AdminCollectionDTO,
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
