import "server-only";

import { randomBytes } from "crypto";
import { put } from "@vercel/blob";

/**
 * Thin wrapper over Vercel Blob for media that must be fetchable by an *external*
 * service. The rest of Ghost.ma stores small artwork as `data:` URIs in Postgres
 * (see /api/upload), but Instagram/Composio fetches the media URL itself, so a
 * post's image has to live at a real public https URL — that is what Blob gives
 * us. Requires BLOB_READ_WRITE_TOKEN (set automatically when a Vercel Blob store
 * is attached to the project; add it locally to test uploads in dev).
 */

export interface BlobUploadResult {
  url: string;
  pathname: string;
}

/** Whether a Blob token is present. Publishing an uploaded file needs this. */
export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
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
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");

  const key = `${input.prefix ?? "instagram"}/${randomBytes(8).toString("hex")}.${input.ext}`;
  const blob = await put(key, input.buffer, {
    access: "public",
    contentType: input.contentType,
    token,
  });
  return { url: blob.url, pathname: blob.pathname };
}
