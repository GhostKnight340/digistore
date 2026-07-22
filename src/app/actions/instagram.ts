"use server";

/**
 * Server actions for the Instagram integration (/admin/intégrations/instagram).
 *
 * Every action requires an admin session (requireAdminCustomer redirects
 * otherwise). No Composio secret and no connected-account id is ever accepted
 * from or returned to the browser — the linked account is resolved server-side,
 * and discovery hands back only opaque refs. Public writes (comment replies,
 * publishing) are idempotent and always admin-confirmed. Same-origin protection
 * comes from Next server actions (sameSite=lax session cookie), matching the
 * rest of the admin.
 */

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

import { requireAdminCustomer } from "@/lib/auth";
import { absoluteUrl } from "@/lib/siteUrl";
import { writeAuditLog } from "@/lib/db/adminAudit";
import * as instagram from "@/lib/composio/instagram/service";
import { normalizeComposioError } from "@/lib/composio/server";
import { deriveIdempotencyKey, validatePublish, validateReply } from "@/lib/composio/instagram/validation";
import type {
  DiscoveredAccountDTO,
  InstagramCommentDTO,
  InstagramActionResult,
} from "@/lib/composio/instagram/types";

// NOTE: this is a "use server" file — Next.js only allows async-function exports
// from it (a non-function export throws "A 'use server' file can only export
// async functions" at runtime). These path constants must therefore stay
// module-local (they are only used here); do not `export` them.
const ADMIN_PATH = "/admin/integrations/instagram";
const INSTAGRAM_CALLBACK_PATH = `${ADMIN_PATH}/callback`;

type Actor = { id: string; name: string };

async function admin(): Promise<Actor> {
  const a = await requireAdminCustomer();
  return { id: a.id, name: a.name };
}

function revalidate() {
  revalidatePath(ADMIN_PATH);
}

/** Wraps a Composio-touching action so a raw SDK error never reaches the UI. */
async function guard<T>(fn: () => Promise<InstagramActionResult<T>>): Promise<InstagramActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    const norm = normalizeComposioError(error);
    // eslint-disable-next-line no-console
    console.error("[instagram-action]", norm.logHint);
    return { ok: false, error: norm.message };
  }
}

// ── Connection lifecycle ───────────────────────────────────────────────────

/** Flow B: begin Composio Managed OAuth; returns the redirect URL for the admin. */
export async function connectInstagramAction(): Promise<InstagramActionResult<{ redirectUrl: string }>> {
  await admin();
  return guard(async () => {
    const { redirectUrl } = await instagram.startConnect(absoluteUrl(INSTAGRAM_CALLBACK_PATH));
    return { ok: true, data: { redirectUrl } };
  });
}

/** Reconnect uses the same managed-OAuth entry point. Declared as a function
 *  (not a const alias) so the "use server" export is unambiguously async. */
export async function reconnectInstagramAction(): Promise<InstagramActionResult<{ redirectUrl: string }>> {
  return connectInstagramAction();
}

/** Flow A: list Instagram accounts already connected in Composio (opaque refs). */
export async function discoverInstagramAccountsAction(): Promise<InstagramActionResult<DiscoveredAccountDTO[]>> {
  await admin();
  return guard(async () => {
    const accounts = await instagram.discoverAccounts();
    return { ok: true, data: accounts };
  });
}

/** Flow A: link a discovered account (by opaque ref) and verify it. */
export async function linkInstagramAccountAction(ref: string): Promise<InstagramActionResult> {
  const actor = await admin();
  if (typeof ref !== "string" || !ref.trim()) return { ok: false, error: "Référence de compte manquante." };
  return guard(async () => {
    const result = await instagram.linkAccount(ref);
    await writeAuditLog({
      adminId: actor.id,
      adminName: actor.name,
      action: result.ok ? "instagram.connected" : "instagram.action_failed",
      metadata: { flow: "link_existing", status: result.status, username: result.username },
    });
    revalidate();
    return { ok: result.ok, error: result.ok ? undefined : result.message };
  });
}

/** "Tester la connexion". */
export async function testInstagramConnectionAction(): Promise<InstagramActionResult> {
  const actor = await admin();
  return guard(async () => {
    const result = await instagram.verifyConnection();
    await writeAuditLog({
      adminId: actor.id,
      adminName: actor.name,
      action: "instagram.verified",
      metadata: { status: result.status, ok: result.ok },
    });
    revalidate();
    return { ok: result.ok, error: result.ok ? undefined : result.message };
  });
}

/** "Synchroniser maintenant". */
export async function syncInstagramAction(): Promise<InstagramActionResult> {
  const actor = await admin();
  return guard(async () => {
    const result = await instagram.syncNow();
    await writeAuditLog({
      adminId: actor.id,
      adminName: actor.name,
      action: "instagram.synced",
      metadata: { status: result.status, ok: result.ok },
    });
    revalidate();
    return { ok: result.ok, error: result.ok ? undefined : result.message };
  });
}

/** "Déconnecter" — unlink from Ghost.ma only (Composio connection preserved). */
export async function unlinkInstagramAction(): Promise<InstagramActionResult> {
  const actor = await admin();
  return guard(async () => {
    const result = await instagram.disconnectOrUnlink(false);
    await writeAuditLog({
      adminId: actor.id,
      adminName: actor.name,
      action: "instagram.unlinked",
      metadata: { revoked: false },
    });
    revalidate();
    return { ok: result.ok, error: result.ok ? undefined : result.message };
  });
}

/** Explicit revoke — also deletes the Composio connection (Instagram access). */
export async function revokeInstagramAction(): Promise<InstagramActionResult> {
  const actor = await admin();
  return guard(async () => {
    const result = await instagram.disconnectOrUnlink(true);
    await writeAuditLog({
      adminId: actor.id,
      adminName: actor.name,
      action: "instagram.unlinked",
      metadata: { revoked: true },
    });
    revalidate();
    return { ok: result.ok, error: result.ok ? undefined : result.message };
  });
}

// ── Operational reads ──────────────────────────────────────────────────────

/** Loads comments for one post (used by the reply composer). */
export async function loadInstagramCommentsAction(
  mediaId: string,
): Promise<InstagramActionResult<InstagramCommentDTO[]>> {
  await admin();
  if (typeof mediaId !== "string" || !mediaId.trim()) return { ok: false, error: "Publication invalide." };
  return guard(async () => {
    const comments = await instagram.getComments(mediaId);
    return { ok: true, data: comments };
  });
}

// ── Public writes (idempotent, confirmed) ──────────────────────────────────

export async function replyToInstagramCommentAction(input: {
  commentId: string;
  message: string;
  token: string;
}): Promise<InstagramActionResult<{ resultId: string | null }>> {
  const actor = await admin();
  const commentId = (input?.commentId ?? "").trim();
  const message = (input?.message ?? "").trim();
  const token = (input?.token ?? "").trim() || randomUUID();
  const valid = validateReply({ commentId, message });
  if (!valid.ok) return { ok: false, error: valid.error };

  return guard(async () => {
    const result = await instagram.replyToComment({
      commentId,
      message,
      adminId: actor.id,
      adminName: actor.name,
      idempotencyKey: deriveIdempotencyKey(actor.id, ["reply", commentId, message], token),
    });
    await writeAuditLog({
      adminId: actor.id,
      adminName: actor.name,
      action: result.ok ? "instagram.comment_replied" : "instagram.action_failed",
      metadata: { commentId, resultId: result.resultId ?? null },
    });
    revalidate();
    return { ok: result.ok, error: result.ok ? undefined : result.message, data: { resultId: result.resultId ?? null } };
  });
}

export async function publishInstagramMediaAction(input: {
  imageUrl: string;
  caption: string;
  token: string;
}): Promise<InstagramActionResult<{ mediaId: string | null }>> {
  const actor = await admin();
  const imageUrl = (input?.imageUrl ?? "").trim();
  const caption = (input?.caption ?? "").trim();
  const token = (input?.token ?? "").trim() || randomUUID();

  // Validate BEFORE touching Composio (Instagram fetches the URL itself).
  const valid = validatePublish({ imageUrl, caption });
  if (!valid.ok) return { ok: false, error: valid.error };

  return guard(async () => {
    const result = await instagram.publishMedia({
      imageUrl,
      caption,
      adminId: actor.id,
      adminName: actor.name,
      idempotencyKey: deriveIdempotencyKey(actor.id, ["publish", imageUrl, caption], token),
    });
    await writeAuditLog({
      adminId: actor.id,
      adminName: actor.name,
      action: result.ok ? "instagram.post_published" : "instagram.action_failed",
      metadata: { mediaId: result.mediaId ?? null },
    });
    revalidate();
    return { ok: result.ok, error: result.ok ? undefined : result.message, data: { mediaId: result.mediaId ?? null } };
  });
}
