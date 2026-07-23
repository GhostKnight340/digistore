import "server-only";

import type { InstagramContentItem, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type {
  StudioContentItemDTO,
  StudioFormat,
  StudioMediaDescriptor,
  StudioStatus,
} from "./types";

/**
 * Data-access for InstagramContentItem — the single table behind the Content
 * Studio's drafts, queue and publications. Shapes rows into browser-safe DTOs
 * and coerces the loosely-typed `media` JSON column into descriptors.
 */

const QUEUE_STATUSES: StudioStatus[] = ["draft", "scheduled", "publishing", "failed"];

function toMedia(raw: Prisma.JsonValue | null | undefined): StudioMediaDescriptor[] {
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

export function toContentDTO(row: InstagramContentItem): StudioContentItemDTO {
  return {
    id: row.id,
    format: row.format as StudioFormat,
    status: row.status as StudioStatus,
    caption: row.caption,
    hashtags: row.hashtags,
    media: toMedia(row.media),
    reelCoverIndex: row.reelCoverIndex,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    timezone: row.timezone,
    retryCount: row.retryCount,
    lastError: row.lastError,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    instagramPermalink: row.instagramPermalink,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface CreateContentInput {
  format: StudioFormat;
  status: StudioStatus;
  caption: string;
  hashtags: string[];
  media: StudioMediaDescriptor[];
  reelCoverIndex: number;
  scheduledFor?: Date | null;
  timezone?: string | null;
  accountId?: string | null;
  createdByAdminId: string;
  createdByAdminName: string;
}

export async function createContentItem(input: CreateContentInput): Promise<InstagramContentItem> {
  return prisma.instagramContentItem.create({
    data: {
      format: input.format,
      status: input.status,
      caption: input.caption,
      hashtags: input.hashtags,
      media: input.media as unknown as Prisma.InputJsonValue,
      reelCoverIndex: input.reelCoverIndex,
      scheduledFor: input.scheduledFor ?? null,
      timezone: input.timezone ?? null,
      accountId: input.accountId ?? null,
      createdByAdminId: input.createdByAdminId,
      createdByAdminName: input.createdByAdminName,
    },
  });
}

/** Marks a content item published with its Instagram result. */
export async function markPublished(
  id: string,
  result: { instagramMediaId: string | null; instagramPermalink: string | null; idempotencyKey: string },
): Promise<void> {
  await prisma.instagramContentItem.update({
    where: { id },
    data: {
      status: "published",
      publishedAt: new Date(),
      instagramMediaId: result.instagramMediaId,
      instagramPermalink: result.instagramPermalink,
      idempotencyKey: result.idempotencyKey,
      lastError: null,
    },
  });
}

/** Records a failed publish with a friendly message. */
export async function markFailed(id: string, message: string): Promise<void> {
  await prisma.instagramContentItem.update({
    where: { id },
    data: { status: "failed", lastError: message, retryCount: { increment: 1 } },
  });
}

/** Queue = everything not yet published/cancelled, soonest-scheduled first. */
export async function listQueue(): Promise<StudioContentItemDTO[]> {
  const rows = await prisma.instagramContentItem.findMany({
    where: { status: { in: QUEUE_STATUSES } },
    orderBy: [{ scheduledFor: "asc" }, { updatedAt: "desc" }],
    take: 100,
  });
  return rows.map(toContentDTO);
}

export function getContentItem(id: string): Promise<InstagramContentItem | null> {
  return prisma.instagramContentItem.findUnique({ where: { id } });
}

export interface UpdateDraftInput {
  caption: string;
  hashtags: string[];
  media: StudioMediaDescriptor[];
  format: StudioFormat;
  reelCoverIndex?: number;
}

/** Overwrites an existing draft with fresh composer content (failed → draft). */
export async function updateDraft(id: string, input: UpdateDraftInput): Promise<InstagramContentItem> {
  return prisma.instagramContentItem.update({
    where: { id },
    data: {
      status: "draft",
      format: input.format,
      caption: input.caption,
      hashtags: input.hashtags,
      media: input.media as unknown as Prisma.InputJsonValue,
      reelCoverIndex: input.reelCoverIndex ?? 0,
      lastError: null,
    },
  });
}

export async function deleteContentItem(id: string): Promise<void> {
  await prisma.instagramContentItem.delete({ where: { id } });
}

/** Flips a scheduled item to cancelled (kept in history, not re-published). */
export async function cancelScheduled(id: string): Promise<void> {
  await prisma.instagramContentItem.updateMany({
    where: { id, status: "scheduled" },
    data: { status: "cancelled", scheduledFor: null },
  });
}

/** Moves a draft/failed/scheduled item to scheduled at a new time. */
export async function scheduleItem(id: string, scheduledFor: Date, timezone: string): Promise<void> {
  await prisma.instagramContentItem.updateMany({
    where: { id, status: { in: ["draft", "failed", "scheduled", "cancelled"] } },
    data: { status: "scheduled", scheduledFor, timezone, lastError: null },
  });
}

/**
 * Atomically claims an item for publishing by flipping its status to
 * "publishing" only if it is still in an eligible state. Returns the row when
 * this caller won the claim, else null (another run / click already took it).
 * This is the double-publish guard shared by the cron and manual publish-now.
 */
export async function claimForPublish(
  id: string,
  from: StudioStatus[],
): Promise<InstagramContentItem | null> {
  const res = await prisma.instagramContentItem.updateMany({
    where: { id, status: { in: from } },
    data: { status: "publishing" },
  });
  if (res.count !== 1) return null;
  return prisma.instagramContentItem.findUnique({ where: { id } });
}

/** Due scheduled items (scheduledFor <= now), oldest first. */
export async function listDueScheduled(now: Date, limit = 10): Promise<InstagramContentItem[]> {
  return prisma.instagramContentItem.findMany({
    where: { status: "scheduled", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: limit,
  });
}

/** Publications history = published items, most recent first. */
export async function listPublications(): Promise<StudioContentItemDTO[]> {
  const rows = await prisma.instagramContentItem.findMany({
    where: { status: "published" },
    orderBy: { publishedAt: "desc" },
    take: 60,
  });
  return rows.map(toContentDTO);
}
