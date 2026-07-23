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
import { blobConfigured, uploadPublicMedia } from "@/lib/storage/blob";
import { publishContentItem } from "@/lib/composio/instagram/publishFlow";
import {
  cancelScheduled,
  claimForPublish,
  createContentItem,
  deleteContentItem,
  getContentItem,
  scheduleItem,
  toContentDTO,
  updateDraft,
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
    return { ok: false, error: "Le stockage média n’est pas configuré (jeton Vercel Blob manquant)." };
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

interface SaveDraftInput {
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

interface PublishNowInput {
  format: StudioFormat;
  caption: string;
  hashtags: string[];
  media: StudioMediaDescriptor[];
  token: string;
}

/**
 * Publishes the composer to Instagram immediately. Only a single "Publication"
 * image is publishable today; other formats are rejected with a clear message.
 * Creates the row (claimed as `publishing`) then delegates to the shared
 * publish flow so the composer, the queue and the cron all publish identically.
 */
export async function publishNowAction(
  input: PublishNowInput,
): Promise<InstagramActionResult<StudioContentItemDTO>> {
  const actor = await admin();
  const format: StudioFormat = input?.format ?? "post";
  if (format !== "post") {
    return { ok: false, error: "Ce format ne peut pas encore être publié depuis Ghost.ma." };
  }
  const media = sanitizeDescriptors(input?.media);
  if (!media.some((m) => m.type === "image")) return { ok: false, error: "Ajoutez une image à publier." };

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
    const res = await publishContentItem(row, actor);
    revalidate();
    return res.ok ? { ok: true, data: res.item } : { ok: false, error: res.error };
  } catch (error) {
    const norm = normalizeComposioError(error);
    // eslint-disable-next-line no-console
    console.error("[instagram-studio] publishNow", norm.logHint);
    return { ok: false, error: norm.message };
  }
}

// ── Queue row actions (Phase 8) ──────────────────────────────────────────────

interface UpdateDraftActionInput {
  id: string;
  format: StudioFormat;
  caption: string;
  hashtags: string[];
  media: StudioMediaDescriptor[];
  reelCoverIndex?: number;
}

/** Overwrites an existing draft (the composer's "Modifier" → re-save path). */
export async function updateDraftAction(
  input: UpdateDraftActionInput,
): Promise<InstagramActionResult<StudioContentItemDTO>> {
  await admin();
  const id = (input?.id ?? "").trim();
  if (!id) return { ok: false, error: "Élément introuvable." };
  try {
    const existing = await getContentItem(id);
    if (!existing) return { ok: false, error: "Élément introuvable." };
    if (existing.status !== "draft" && existing.status !== "failed") {
      return { ok: false, error: "Seuls les brouillons peuvent être modifiés." };
    }
    const row = await updateDraft(id, {
      format: input?.format ?? "post",
      caption: (input?.caption ?? "").slice(0, MAX_CAPTION),
      hashtags: Array.isArray(input?.hashtags) ? input.hashtags.slice(0, 30) : [],
      media: sanitizeDescriptors(input?.media),
      reelCoverIndex: input?.reelCoverIndex ?? 0,
    });
    revalidate();
    return { ok: true, data: toContentDTO(row) };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[instagram-studio] updateDraft", error);
    return { ok: false, error: "Mise à jour impossible." };
  }
}

/** Duplicates any item into a fresh draft. */
export async function duplicateItemAction(id: string): Promise<InstagramActionResult<StudioContentItemDTO>> {
  const actor = await admin();
  const src = (id ?? "").trim();
  if (!src) return { ok: false, error: "Élément introuvable." };
  try {
    const existing = await getContentItem(src);
    if (!existing) return { ok: false, error: "Élément introuvable." };
    const row = await createContentItem({
      format: existing.format as StudioFormat,
      status: "draft",
      caption: existing.caption,
      hashtags: existing.hashtags,
      media: sanitizeDescriptors(existing.media),
      reelCoverIndex: existing.reelCoverIndex,
      accountId: existing.accountId,
      createdByAdminId: actor.id,
      createdByAdminName: actor.name,
    });
    revalidate();
    return { ok: true, data: toContentDTO(row) };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[instagram-studio] duplicate", error);
    return { ok: false, error: "Duplication impossible." };
  }
}

/** Permanently removes a queue item. */
export async function deleteItemAction(id: string): Promise<InstagramActionResult> {
  await admin();
  const target = (id ?? "").trim();
  if (!target) return { ok: false, error: "Élément introuvable." };
  try {
    await deleteContentItem(target);
    revalidate();
    return { ok: true };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[instagram-studio] delete", error);
    return { ok: false, error: "Suppression impossible." };
  }
}

/** Cancels a scheduled item (kept as history, not re-published). */
export async function cancelScheduledAction(id: string): Promise<InstagramActionResult> {
  await admin();
  const target = (id ?? "").trim();
  if (!target) return { ok: false, error: "Élément introuvable." };
  try {
    await cancelScheduled(target);
    revalidate();
    return { ok: true };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[instagram-studio] cancel", error);
    return { ok: false, error: "Annulation impossible." };
  }
}

const CASABLANCA_TZ = "Africa/Casablanca";

/**
 * Schedules (or reschedules) an item for a future time. The client sends the
 * wall-clock date + time the admin picked in Africa/Casablanca (fixed GMT+1),
 * which we anchor to a real UTC instant. The /api/cron/instagram-publish sweep
 * publishes it when due.
 */
export async function scheduleItemAction(input: {
  id: string;
  date: string;
  time: string;
}): Promise<InstagramActionResult<StudioContentItemDTO>> {
  await admin();
  const id = (input?.id ?? "").trim();
  if (!id) return { ok: false, error: "Élément introuvable." };
  if (!input?.date || !input?.time) return { ok: false, error: "Choisissez une date et une heure." };

  const when = new Date(`${input.date}T${input.time}:00+01:00`);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "Date invalide." };
  if (when.getTime() < Date.now() + 60_000) return { ok: false, error: "Choisissez une date dans le futur." };

  try {
    await scheduleItem(id, when, CASABLANCA_TZ);
    const row = await getContentItem(id);
    if (!row) return { ok: false, error: "Élément introuvable." };
    revalidate();
    return { ok: true, data: toContentDTO(row) };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[instagram-studio] schedule", error);
    return { ok: false, error: "Programmation impossible." };
  }
}

/**
 * Publishes an existing queue item now (queue "Publier maintenant" and failed
 * "Réessayer"). Claims the row atomically so a second click / the cron can't
 * double-post, then runs the shared publish flow.
 */
export async function publishExistingAction(id: string): Promise<InstagramActionResult<StudioContentItemDTO>> {
  const actor = await admin();
  const target = (id ?? "").trim();
  if (!target) return { ok: false, error: "Élément introuvable." };
  try {
    const row = await claimForPublish(target, ["draft", "scheduled", "failed"]);
    if (!row) return { ok: false, error: "Cet élément est déjà en cours de publication." };
    const res = await publishContentItem(row, actor);
    revalidate();
    return res.ok ? { ok: true, data: res.item } : { ok: false, error: res.error };
  } catch (error) {
    const norm = normalizeComposioError(error);
    // eslint-disable-next-line no-console
    console.error("[instagram-studio] publishExisting", norm.logHint);
    return { ok: false, error: norm.message };
  }
}
