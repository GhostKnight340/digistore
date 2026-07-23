import "server-only";

import { prisma } from "@/lib/db/prisma";
import { deleteProductMediaBlob } from "./blob";
import { isVercelBlobUrl } from "./imageValidation";

/** Blob object key for a stored Blob URL (path minus the leading slash). */
function pathnameOf(blobUrl: string): string | null {
  try {
    return new URL(blobUrl).pathname.replace(/^\/+/, "");
  } catch {
    return null;
  }
}

/**
 * Delete the Blob behind `blobUrl` — but ONLY when no ProductMedia or Product
 * row still references it. Call this AFTER the referencing row has already been
 * updated/removed, e.g. when an admin replaces a product's image: the old image
 * is deleted only if it is now genuinely unused, so a Blob shared by another
 * record (or by a not-yet-saved draft) is never destroyed.
 *
 * Best-effort and non-throwing: a failure here must never fail the save that
 * triggered it, and a not-yet-deleted Blob is caught later by orphan cleanup.
 * No-ops on a non-Blob URL (legacy base64 / external / dev /uploads).
 */
export async function deleteProductBlobIfUnreferenced(blobUrl: string | null | undefined): Promise<void> {
  if (!blobUrl || !isVercelBlobUrl(blobUrl)) return;
  const pathname = pathnameOf(blobUrl);
  if (!pathname) return;

  try {
    const [mediaRefs, productRefs] = await Promise.all([
      prisma.productMedia.count({ where: { OR: [{ blobUrl }, { pathname }] } }),
      prisma.product.count({ where: { imageUrl: blobUrl } }),
    ]);
    if (mediaRefs + productRefs > 0) return; // still referenced — keep it
    await deleteProductMediaBlob(pathname);
  } catch {
    // Swallow: never let cleanup break the operation that requested it.
  }
}
