import "server-only";

import { randomUUID } from "crypto";
import type { InstagramContentItem } from "@prisma/client";

import { writeAuditLog } from "@/lib/db/adminAudit";
import { normalizeComposioError } from "@/lib/composio/server";
import * as instagram from "./service";
import { deriveIdempotencyKey, validatePublish } from "./validation";
import { markFailed, markPublished, toContentDTO } from "./contentStore";
import type { StudioContentItemDTO, StudioMediaDescriptor } from "./types";

/**
 * The single push-to-Instagram code path, shared by the composer's "Publier
 * maintenant", the queue's publish-now/retry, and the scheduling cron. Callers
 * must have already claimed the row (created it as `publishing`, or flipped it
 * via claimForPublish) so this never races into a double-post; publishMedia's
 * idempotency ledger is a second backstop.
 *
 * Phase 8: only single-image "post" is publishable. Other formats fail with a
 * clear message rather than a raw error (see Phase 5 for real carousel/reel).
 */
export interface PublishActor {
  id: string;
  name: string;
}

function media(row: InstagramContentItem): StudioMediaDescriptor[] {
  const raw = row.media;
  if (!Array.isArray(raw)) return [];
  const out: StudioMediaDescriptor[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const m = entry as Record<string, unknown>;
    if (typeof m.url !== "string") continue;
    out.push({
      id: typeof m.id === "string" ? m.id : "",
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

function composeCaption(caption: string, hashtags: string[]): string {
  const tags = hashtags.map((t) => t.trim()).filter(Boolean);
  const body = caption.trim();
  if (!tags.length) return body;
  return body ? `${body}\n\n${tags.join(" ")}` : tags.join(" ");
}

export async function publishContentItem(
  row: InstagramContentItem,
  actor: PublishActor,
): Promise<{ ok: boolean; error?: string; item?: StudioContentItemDTO }> {
  if (row.format !== "post") {
    const msg = "Seules les publications simples (image) peuvent être publiées pour le moment.";
    await markFailed(row.id, msg);
    return { ok: false, error: msg };
  }
  const image = media(row).find((m) => m.type === "image");
  if (!image) {
    const msg = "Aucune image à publier.";
    await markFailed(row.id, msg);
    return { ok: false, error: msg };
  }

  const finalCaption = composeCaption(row.caption, row.hashtags);
  const valid = validatePublish({ imageUrl: image.url, caption: finalCaption });
  if (!valid.ok) {
    await markFailed(row.id, valid.error ?? "Publication invalide.");
    return { ok: false, error: valid.error };
  }

  // Reuse a prior idempotency key on retry so a genuine duplicate collapses.
  const idempotencyKey =
    row.idempotencyKey ?? deriveIdempotencyKey(actor.id, ["publish", row.id, image.url, finalCaption], randomUUID());

  try {
    const result = await instagram.publishMedia({
      imageUrl: image.url,
      caption: finalCaption,
      adminId: actor.id,
      adminName: actor.name,
      idempotencyKey,
    });
    if (result.ok) {
      await markPublished(row.id, { instagramMediaId: result.mediaId ?? null, instagramPermalink: null, idempotencyKey });
      await writeAuditLog({
        adminId: actor.id,
        adminName: actor.name,
        action: "instagram.post_published",
        metadata: { itemId: row.id, mediaId: result.mediaId ?? null },
      });
      return { ok: true, item: { ...toContentDTO(row), status: "published" } };
    }
    await markFailed(row.id, result.message ?? "La publication a échoué.");
    await writeAuditLog({
      adminId: actor.id,
      adminName: actor.name,
      action: "instagram.action_failed",
      metadata: { itemId: row.id },
    });
    return { ok: false, error: result.message ?? "La publication a échoué." };
  } catch (error) {
    const norm = normalizeComposioError(error);
    // eslint-disable-next-line no-console
    console.error("[instagram-publish]", norm.logHint);
    await markFailed(row.id, norm.message).catch(() => {});
    return { ok: false, error: norm.message };
  }
}
