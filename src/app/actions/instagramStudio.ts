"use server";

/**
 * Server actions for the Instagram Content Studio (drafts, uploads, publish-now).
 *
 * Mirrors the guarantees of src/app/actions/instagram.ts: every action needs an
 * admin session, no Composio secret ever crosses the boundary, and the single
 * public write (publish) is idempotent + validated before Composio is called.
 * Uploaded media is pushed to Vercel Blob so Instagram can fetch a real https
 * URL — a `data:` URI (how the rest of Ghost.ma stores artwork) is not fetchable.
 */

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

import { requireAdminCustomer } from "@/lib/auth";
import { writeAuditLog } from "@/lib/db/adminAudit";
import * as instagram from "@/lib/composio/instagram/service";
import { normalizeComposioError } from "@/lib/composio/server";
import { deriveIdempotencyKey, validatePublish } from "@/lib/composio/instagram/validation";
import { blobConfigured, uploadPublicMedia } from "@/lib/storage/blob";
import {
  createContentItem,
  markFailed,
  markPublished,
  toContentDTO,
} from "@/lib/composio/instagram/contentStore";
import type {
  InstagramActionResult,
  StudioContentItemDTO,
  StudioFormat,
  StudioMediaDescriptor,
} from "@/lib/composio/instagram/types";

const ADMIN_PATH = "/admin/integrations/instagram";
const MAX_CAPTION = 2200;
const UPLOAD_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
};
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB — matches the "Publication" hint.

type Actor = { id: string; name: string };

async function admin(): Promise<Actor> {
  const a = await requireAdminCustomer();
  return { id: a.id, name: a.name };
}

function revalidate() {
  revalidatePath(ADMIN_PATH);
}

/** Combines the caption and hashtag chips into the single string Instagram takes. */
function composeCaption(caption: string, hashtags: string[]): string {
  const tags = hashtags.map((t) => t.trim()).filter(Boolean);
  const body = caption.trim();
  if (!tags.length) return body;
  return body ? `${body}\n\n${tags.join(" ")}` : tags.join(" ");
}

function sanitizeDescriptors(input: unknown): StudioMediaDescriptor[] {
  if (!Array.isArray(input)) return [];
  const out: StudioMediaDescriptor[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as Record<string, unknown>;
    if (typeof m.url !== "string" || !m.url) continue;
    out.push({
      id: typeof m.id === "string" && m.id ? m.id : randomUUID(),
      type: m.type === "video" ? "video" : "image",
      url: m.url,
      name: typeof m.name === "string" ? m.name : null,
      size: typeof m.size === "number" ? m.size : null,
      width: typeof m.width === "number" ? m.width : null,
      height: typeof m.height === "number" ? m.height : null,
      duration: typeof m.duration === "number" ? m.duration : null,
    });
  }
  return out;
}

/**
 * Uploads one composer file to public Blob storage and returns its https URL.
 * The browser reads dimensions itself; here we only persist the bytes.
 */
export async function uploadInstagramMediaAction(
  formData: FormData,
): Promise<InstagramActionResult<{ url: string }>> {
  await admin();
  if (!blobConfigured()) {
    return { ok: false, error: "Le stockage média n’est pas configuré (BLOB_READ_WRITE_TOKEN)." };
  }
  const file = formData.get("file");
  if (!file || typeof file === "string") return { ok: false, error: "Aucun fichier fourni." };

  const ext = UPLOAD_TYPES[file.type];
  if (!ext) return { ok: false, error: "Format non supporté. Utilisez une image JPG ou PNG." };

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "Le fichier dépasse la limite de 8 Mo." };
  }

  try {
    const { url } = await uploadPublicMedia({
      buffer: Buffer.from(bytes),
      contentType: file.type === "image/jpg" ? "image/jpeg" : file.type,
      ext,
    });
    return { ok: true, data: { url } };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[instagram-studio] upload", error);
    return { ok: false, error: "Import du média impossible." };
  }
}

export interface SaveDraftInput {
  format: StudioFormat;
  caption: string;
  hashtags: string[];
  media: StudioMediaDescriptor[];
  reelCoverIndex?: number;
}

/** Persists the composer as a reusable draft in the queue. */
export async function saveDraftAction(
  input: SaveDraftInput,
): Promise<InstagramActionResult<StudioContentItemDTO>> {
  const actor = await admin();
  const caption = (input?.caption ?? "").slice(0, MAX_CAPTION);
  const hashtags = Array.isArray(input?.hashtags) ? input.hashtags.slice(0, 30) : [];
  const media = sanitizeDescriptors(input?.media);
  const format: StudioFormat = input?.format ?? "post";

  try {
    const status = await instagram.getStatusSafe();
    const row = await createContentItem({
      format,
      status: "draft",
      caption,
      hashtags,
      media,
      reelCoverIndex: input?.reelCoverIndex ?? 0,
      accountId: status.accountId,
      createdByAdminId: actor.id,
      createdByAdminName: actor.name,
    });
    await writeAuditLog({
      adminId: actor.id,
      adminName: actor.name,
      action: "instagram.draft_saved",
      metadata: { itemId: row.id, format },
    });
    revalidate();
    return { ok: true, data: toContentDTO(row) };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[instagram-studio] saveDraft", error);
    return { ok: false, error: "Enregistrement du brouillon impossible." };
  }
}

export interface PublishNowInput {
  format: StudioFormat;
  caption: string;
  hashtags: string[];
  media: StudioMediaDescriptor[];
  token: string;
}

/**
 * Publishes the composer to Instagram immediately. Phase 2 supports a single
 * "Publication" image (the only format the publish tool handles today); other
 * formats surface a clear "not yet supported" message rather than failing raw.
 */
export async function publishNowAction(
  input: PublishNowInput,
): Promise<InstagramActionResult<StudioContentItemDTO>> {
  const actor = await admin();
  const format: StudioFormat = input?.format ?? "post";
  if (format !== "post") {
    return { ok: false, error: "Seules les publications simples (image) peuvent être publiées pour le moment." };
  }
  const media = sanitizeDescriptors(input?.media);
  const image = media.find((m) => m.type === "image");
  if (!image) return { ok: false, error: "Ajoutez une image à publier." };

  const finalCaption = composeCaption(input?.caption ?? "", input?.hashtags ?? []);
  const valid = validatePublish({ imageUrl: image.url, caption: finalCaption });
  if (!valid.ok) return { ok: false, error: valid.error };

  const token = (input?.token ?? "").trim() || randomUUID();
  const idempotencyKey = deriveIdempotencyKey(actor.id, ["publish", image.url, finalCaption], token);

  let itemId: string | null = null;
  try {
    const status = await instagram.getStatusSafe();
    const row = await createContentItem({
      format,
      status: "publishing",
      caption: input?.caption ?? "",
      hashtags: input?.hashtags ?? [],
      media,
      reelCoverIndex: 0,
      accountId: status.accountId,
      createdByAdminId: actor.id,
      createdByAdminName: actor.name,
    });
    itemId = row.id;

    const result = await instagram.publishMedia({
      imageUrl: image.url,
      caption: finalCaption,
      adminId: actor.id,
      adminName: actor.name,
      idempotencyKey,
    });

    if (result.ok) {
      await markPublished(row.id, {
        instagramMediaId: result.mediaId ?? null,
        instagramPermalink: null,
        idempotencyKey,
      });
      await writeAuditLog({
        adminId: actor.id,
        adminName: actor.name,
        action: "instagram.post_published",
        metadata: { itemId: row.id, mediaId: result.mediaId ?? null },
      });
      revalidate();
      const published = { ...toContentDTO(row), status: "published" as const, instagramMediaId: undefined };
      return { ok: true, data: { ...published } };
    }

    await markFailed(row.id, result.message ?? "La publication a échoué.");
    await writeAuditLog({
      adminId: actor.id,
      adminName: actor.name,
      action: "instagram.action_failed",
      metadata: { itemId: row.id },
    });
    revalidate();
    return { ok: false, error: result.message ?? "La publication a échoué." };
  } catch (error) {
    const norm = normalizeComposioError(error);
    // eslint-disable-next-line no-console
    console.error("[instagram-studio] publishNow", norm.logHint);
    if (itemId) await markFailed(itemId, norm.message).catch(() => {});
    revalidate();
    return { ok: false, error: norm.message };
  }
}
