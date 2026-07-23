import "server-only";

import { randomBytes } from "crypto";
import { del, head, list, put } from "@vercel/blob";
import { extForMime, imageDimensions, validateImage } from "./imageValidation";

/**
 * Thin wrapper over Vercel Blob for media that must be fetchable by an *external*
 * service. The rest of Ghost.ma stores small artwork as `data:` URIs in Postgres
 * (see /api/upload), but Instagram/Composio fetches the media URL itself, so a
 * post's image has to live at a real public https URL — that is what Blob gives
 * us. The Instagram store is connected with the `INSTAGRAM` env prefix (a
 * dedicated store, so it doesn't collide with the project's other Blob stores),
 * giving INSTAGRAM_READ_WRITE_TOKEN; we fall back to the default
 * BLOB_READ_WRITE_TOKEN if a store is ever wired without a prefix. The store
 * MUST be created with Public access so Instagram can fetch the URL unauthenticated.
 */

export interface BlobUploadResult {
  url: string;
  pathname: string;
}

/** The read-write token for the Instagram Blob store (prefixed, else default). */
function blobToken(): string | undefined {
  return process.env.INSTAGRAM_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
}

/** Whether a Blob token is present. Publishing an uploaded file needs this. */
export function blobConfigured(): boolean {
  return Boolean(blobToken());
}

/**
 * Uploads bytes to a public Blob path and returns its https URL. The pathname
 * keeps the file extension so the resulting URL ends in `.jpg`/`.png`/… — some
 * consumers (and our own publish validation) key off that.
 */
export async function uploadPublicMedia(input: {
  buffer: Buffer;
  contentType: string;
  ext: string;
  prefix?: string;
}): Promise<BlobUploadResult> {
  const token = blobToken();
  if (!token) throw new Error("Instagram Blob token is not configured (INSTAGRAM_READ_WRITE_TOKEN).");

  const key = `${input.prefix ?? "instagram"}/${randomBytes(8).toString("hex")}.${input.ext}`;
  const blob = await put(key, input.buffer, {
    access: "public",
    contentType: input.contentType,
    token,
  });
  return { url: blob.url, pathname: blob.pathname };
}

// ── Product media store ──────────────────────────────────────────────────────
//
// Product images live in their OWN Vercel Blob store, connected with the
// PRODUCT_MEDIA env prefix, so its token is completely separate from the
// Instagram / payment-proof stores. Staging and production each hold their own
// store token, scoped per Vercel environment — the staging token is never
// configured in Production and vice-versa, so development can never touch the
// production Blob store. All product media is written under the `product-media/`
// path prefix so the strict next/image remotePattern and orphan detection have a
// single namespace to key off.

export const PRODUCT_MEDIA_PREFIX = "product-media";

/** Read-write token for the dedicated product-media Blob store. No fallback to
 * the default BLOB_READ_WRITE_TOKEN: a missing token must mean "not configured"
 * (dev falls back to /uploads) rather than silently writing to another store. */
export function productMediaBlobToken(): string | undefined {
  return process.env.PRODUCT_MEDIA_READ_WRITE_TOKEN;
}

/** Whether the product-media Blob store is wired for this environment. */
export function productMediaBlobConfigured(): boolean {
  return Boolean(productMediaBlobToken());
}

export interface ProductMediaUpload {
  url: string;
  pathname: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
}

/**
 * Validate + upload one product image to the product-media Blob store and return
 * the URL, key and metadata to persist. `addRandomSuffix` makes every write land
 * at a fresh key, so a retried upload after a crash never overwrites or races a
 * previous object — the migration relies on this for safe partial-failure
 * recovery. Throws on an unconfigured store or invalid image; callers must treat
 * a throw as "leave the existing record untouched".
 */
export async function uploadProductMedia(input: {
  buffer: Buffer;
  /** Browser/legacy-declared MIME, cross-checked against the bytes. */
  declaredType?: string | null;
}): Promise<ProductMediaUpload> {
  const token = productMediaBlobToken();
  if (!token) {
    throw new Error("Product-media Blob store is not configured (PRODUCT_MEDIA_READ_WRITE_TOKEN).");
  }

  const validation = validateImage(input.buffer, input.declaredType);
  if (!validation.ok) throw new Error(validation.error);

  const dims = imageDimensions(input.buffer);
  const key = `${PRODUCT_MEDIA_PREFIX}/${randomBytes(8).toString("hex")}.${validation.ext}`;
  const blob = await put(key, input.buffer, {
    access: "public",
    contentType: validation.mimeType,
    addRandomSuffix: true,
    token,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    mimeType: validation.mimeType,
    fileSize: validation.size,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
  };
}

/**
 * Delete one object from the product-media store by pathname. Never throws on a
 * missing object (idempotent). Callers MUST first confirm no other DB row
 * references the pathname — see productMediaBlobReferenceCount usage in the
 * editor/save path.
 */
export async function deleteProductMediaBlob(pathname: string): Promise<void> {
  const token = productMediaBlobToken();
  if (!token || !pathname) return;
  try {
    await del(pathname, { token });
  } catch {
    // Best-effort: a Blob that is already gone is not an error for our purposes.
  }
}

/** True when the object still exists in the store. Used by the verification
 * report to flag broken/missing Blob URLs. */
export async function productMediaBlobExists(url: string): Promise<boolean> {
  const token = productMediaBlobToken();
  if (!token) return false;
  try {
    await head(url, { token });
    return true;
  } catch {
    return false;
  }
}

/** List every object key under the product-media prefix (paginated). Used only
 * by orphan detection in the migration script. */
export async function listProductMediaBlobs(): Promise<string[]> {
  const token = productMediaBlobToken();
  if (!token) return [];
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `${PRODUCT_MEDIA_PREFIX}/`, cursor, token });
    for (const b of page.blobs) keys.push(b.pathname);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

// Re-export the pure validator/ext helpers so callers have one import surface.
export { extForMime, validateImage } from "./imageValidation";
