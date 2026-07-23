import "server-only";

import { randomBytes } from "crypto";
import { put } from "@vercel/blob";

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
