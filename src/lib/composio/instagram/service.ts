import "server-only";

import { getComposio, isComposioConfigured, normalizeComposioError } from "../server";
import {
  GHOST_MA_COMPOSIO_USER_ID,
  INSTAGRAM_TOOLKIT_SLUG,
  instagramProfileUrl,
} from "./constants";
import {
  INSTAGRAM_CAPABILITIES,
  READ_CAPABILITIES,
  capabilityLabel,
  resolveCapabilitySlugs,
  type InstagramCapability,
} from "./capabilities";
import { mapComposioStatus, statusLabel, type SocialIntegrationStatus } from "./status";
import {
  accountRef,
  claimAction,
  getInstagramRow,
  matchAccountRef,
  recordAction,
  writeConnection,
  writeError,
  writeProfile,
  writeUnlink,
  type InstagramActionKind,
} from "./store";
import type {
  DiscoveredAccountDTO,
  InstagramCommentDTO,
  InstagramMediaDTO,
  InstagramStatusDTO,
  VerifyResult,
} from "./types";

/**
 * Typed Instagram integration service. All Composio-specific details (tool
 * slugs, execution, response shapes, error normalization) live here; actions and
 * UI never touch the SDK directly. Every method is server-only and resolves the
 * connected account from the DB — never from a browser-supplied id.
 */

interface ExecResult {
  ok: boolean;
  data: Record<string, unknown>;
  code?: string;
  message?: string;
}

interface ActiveConnection {
  connectedAccountId: string;
  composioUserId: string;
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

/** Loads the linked connection from the DB, or null when not connected. */
async function activeConnection(): Promise<ActiveConnection | null> {
  const row = await getInstagramRow();
  if (!row?.connectedAccountId) return null;
  return {
    connectedAccountId: row.connectedAccountId,
    composioUserId: row.composioUserId ?? GHOST_MA_COMPOSIO_USER_ID,
  };
}

/**
 * Lists the Instagram toolkit's actual tool slugs (for capability resolution).
 *
 * Uses `getRawComposioTools` — which returns the RAW `Tool[]` (each carrying a
 * real `.slug`) — NOT `tools.get(userId, …)`, which returns provider-WRAPPED,
 * execution-ready tools whose shape has no reliable `.slug`/`.name`. The wrapped
 * form silently produced an empty slug list, so every capability (incl. profile)
 * resolved to nothing and verification failed with "aucune action de profil".
 */
async function discoverToolkitSlugs(): Promise<string[]> {
  const composio = getComposio();
  const tools = await composio.tools.getRawComposioTools({
    toolkits: [INSTAGRAM_TOOLKIT_SLUG],
    limit: 200,
  });
  const list = Array.isArray(tools) ? tools : [];
  const slugs = list
    .map((t) => (typeof t?.slug === "string" ? t.slug : null))
    .filter((s): s is string => Boolean(s));
  // Tool slugs are non-sensitive names. Logged so that, if capability matching
  // ever comes up empty, the real toolkit slugs are visible in the server logs
  // (to tune the matchers in capabilities.ts).
  // eslint-disable-next-line no-console
  console.log("[instagram] toolkit slugs", { count: slugs.length, slugs });
  return slugs;
}

/** Resolves the capability→slug map from the live toolkit (empty on failure). */
async function resolveSlugs(): Promise<Partial<Record<InstagramCapability, string>>> {
  try {
    const slugs = await discoverToolkitSlugs();
    return resolveCapabilitySlugs(slugs);
  } catch {
    return {};
  }
}

/** Executes one Instagram tool against the linked connection, normalized. */
async function execTool(
  slug: string,
  conn: ActiveConnection,
  args: Record<string, unknown>,
): Promise<ExecResult> {
  try {
    const composio = getComposio();
    const res = await composio.tools.execute(slug, {
      userId: conn.composioUserId,
      connectedAccountId: conn.connectedAccountId,
      arguments: args,
      // We do not pin toolkit versions, so "latest" must be allowed explicitly.
      dangerouslySkipVersionCheck: true,
    });
    if (!res.successful) {
      // The tool ran but Instagram/Composio rejected it. `res.error` may echo
      // arguments, so we don't surface it — only a coarse category.
      const code = /permission|scope|oauth|token|auth/i.test(res.error ?? "")
        ? "permission_denied"
        : "provider_error";
      return { ok: false, data: {}, code, message: res.error ?? undefined };
    }
    return { ok: true, data: (res.data ?? {}) as Record<string, unknown> };
  } catch (error) {
    const norm = normalizeComposioError(error);
    // eslint-disable-next-line no-console
    console.error(`[instagram] ${slug} failed`, norm.logHint);
    return { ok: false, data: {}, code: norm.code, message: norm.message };
  }
}

// ---------------------------------------------------------------------------
// Response extraction (defensive — Graph API field names vary by tool version)
// ---------------------------------------------------------------------------

function unwrap(data: Record<string, unknown>): Record<string, unknown> {
  // Composio tools sometimes nest the payload under data/response/response_data.
  for (const key of ["data", "response_data", "response", "result"]) {
    const inner = data[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return inner as Record<string, unknown>;
    }
  }
  return data;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function pickArray(data: Record<string, unknown>): Record<string, unknown>[] {
  const candidates = [data["data"], data["items"], data["media"], data["comments"], unwrap(data)["data"]];
  for (const c of candidates) {
    if (Array.isArray(c)) return c.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  }
  return [];
}

interface ProfileFields {
  accountId: string | null;
  username: string | null;
  profileName: string | null;
  profilePictureUrl: string | null;
  accountType: string | null;
  facebookPageId: string | null;
  facebookPageName: string | null;
}

function extractProfile(data: Record<string, unknown>): ProfileFields {
  const o = unwrap(data);
  return {
    accountId: pickString(o, ["id", "ig_id", "instagram_business_account_id", "user_id", "account_id"]),
    username: pickString(o, ["username", "handle"]),
    profileName: pickString(o, ["name", "full_name", "display_name"]),
    profilePictureUrl: pickString(o, ["profile_picture_url", "profile_pic_url", "profile_picture"]),
    accountType: pickString(o, ["account_type", "type"]),
    facebookPageId: pickString(o, ["facebook_page_id", "page_id", "connected_page_id"]),
    facebookPageName: pickString(o, ["facebook_page_name", "page_name"]),
  };
}

function extractMedia(item: Record<string, unknown>): InstagramMediaDTO {
  return {
    id: pickString(item, ["id", "media_id"]) ?? "",
    caption: pickString(item, ["caption", "text"]),
    mediaType: pickString(item, ["media_type", "type"]),
    mediaUrl: pickString(item, ["media_url", "url"]),
    thumbnailUrl: pickString(item, ["thumbnail_url", "thumbnail"]),
    permalink: pickString(item, ["permalink", "permalink_url", "link"]),
    timestamp: pickString(item, ["timestamp", "created_time", "created_at"]),
    commentsCount: pickNumber(item, ["comments_count", "comment_count"]),
    likeCount: pickNumber(item, ["like_count", "likes_count", "likes"]),
  };
}

function extractComment(item: Record<string, unknown>): InstagramCommentDTO {
  const replies = item["replies"];
  const replied =
    (replies && typeof replies === "object" && Array.isArray((replies as Record<string, unknown>)["data"])
      ? ((replies as Record<string, unknown>)["data"] as unknown[]).length > 0
      : false) || Boolean(item["has_replied"]);
  return {
    id: pickString(item, ["id", "comment_id"]) ?? "",
    username: pickString(item, ["username", "from_username", "user"]),
    text: pickString(item, ["text", "message"]),
    timestamp: pickString(item, ["timestamp", "created_time", "created_at"]),
    mediaId: pickString(item, ["media_id", "media"]),
    replied,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Whether Composio is configured on this server (no secret leaked). */
export function isConfigured(): boolean {
  return isComposioConfigured();
}

/** Builds the browser-safe status DTO from the DB row (no Composio ids). */
export async function getStatus(): Promise<InstagramStatusDTO> {
  const row = await getInstagramRow();
  const status = (row?.status ?? "DISCONNECTED") as SocialIntegrationStatus;
  const available = new Set(row?.capabilities ?? []);
  return {
    configured: isComposioConfigured(),
    connected: status === "CONNECTED",
    status,
    statusLabel: statusLabel(status),
    username: row?.username ?? null,
    profileName: row?.profileName ?? null,
    profilePictureUrl: row?.profilePictureUrl ?? null,
    accountId: row?.accountId ?? null,
    accountType: row?.accountType ?? null,
    facebookPageId: row?.facebookPageId ?? null,
    facebookPageName: row?.facebookPageName ?? null,
    profileUrl: instagramProfileUrl(row?.username),
    capabilities: INSTAGRAM_CAPABILITIES.map((key) => ({
      key,
      ...capabilityLabel(key),
      available: available.has(key),
    })),
    connectedAt: row?.connectedAt?.toISOString() ?? null,
    lastVerifiedAt: row?.lastVerifiedAt?.toISOString() ?? null,
    lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
    lastError: row?.lastErrorMessage ? { message: row.lastErrorMessage } : null,
  };
}

/**
 * Page-safe variant of getStatus(): a failure to read the integration row (e.g.
 * the table missing on a mis-migrated environment, or a transient DB error) must
 * NOT error-boundary the whole admin section. Returns a degraded ERROR status so
 * the panel renders an "unavailable" state, and logs the cause server-side.
 */
export async function getStatusSafe(): Promise<InstagramStatusDTO> {
  try {
    return await getStatus();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[instagram] getStatus failed", normalizeComposioError(error).logHint);
    return {
      configured: isComposioConfigured(),
      connected: false,
      status: "ERROR",
      statusLabel: statusLabel("ERROR"),
      username: null,
      profileName: null,
      profilePictureUrl: null,
      accountId: null,
      accountType: null,
      facebookPageId: null,
      facebookPageName: null,
      profileUrl: null,
      capabilities: INSTAGRAM_CAPABILITIES.map((key) => ({
        key,
        ...capabilityLabel(key),
        available: false,
      })),
      connectedAt: null,
      lastVerifiedAt: null,
      lastSyncAt: null,
      lastError: { message: "Statut indisponible pour le moment." },
    };
  }
}

/**
 * Flow A — discover Instagram accounts already connected inside Composio and
 * return SAFE metadata + a signed ref (never the raw connected-account id).
 */
export async function discoverAccounts(): Promise<DiscoveredAccountDTO[]> {
  const composio = getComposio();
  const res = await composio.connectedAccounts.list({ toolkitSlugs: [INSTAGRAM_TOOLKIT_SLUG] });
  const items = Array.isArray(res.items) ? res.items : [];
  return items.map((acc) => ({
    ref: accountRef(acc.id),
    status: acc.status,
    username: null, // profile is fetched only after linking (one execution)
    createdAt: acc.createdAt ?? null,
  }));
}

/**
 * Flow A — link a discovered Composio account to Ghost.ma. The browser passes a
 * signed ref; a forged/arbitrary id fails HMAC verification and is rejected. The
 * account is then verified so the row is populated with real profile data.
 */
export async function linkAccount(ref: string): Promise<VerifyResult> {
  const composio = getComposio();
  // Recover the id ONLY by matching the ref against the server's own account
  // list — a forged/arbitrary id from the browser has no matching ref.
  const list = await composio.connectedAccounts.list({ toolkitSlugs: [INSTAGRAM_TOOLKIT_SLUG] });
  const candidateIds = (Array.isArray(list.items) ? list.items : []).map((a) => a.id);
  const connectedAccountId = matchAccountRef(ref, candidateIds);
  if (!connectedAccountId) {
    return { ok: false, status: "ERROR", message: "Référence de compte invalide.", username: null, capabilities: [] };
  }
  const account = await composio.connectedAccounts.get(connectedAccountId);
  const status = mapComposioStatus(account.status);
  await writeConnection({
    connectedAccountId,
    authConfigId: account.authConfig?.id ?? null,
    composioUserId: GHOST_MA_COMPOSIO_USER_ID,
    status,
  });
  return verifyConnection();
}

/**
 * Flow B — start a Composio Managed OAuth connection. Returns the redirect URL
 * the admin is sent to. `callbackUrl` is where Composio returns the admin after
 * consent. Reuses the Instagram auth config already configured in Composio.
 */
export async function startConnect(callbackUrl: string): Promise<{ redirectUrl: string }> {
  const composio = getComposio();
  const userId = GHOST_MA_COMPOSIO_USER_ID;

  // Prefer an explicit auth config (the one already set up for managed OAuth);
  // fall back to toolkits.authorize which creates/uses one automatically.
  let authConfigId: string | null = null;
  try {
    const configs = await composio.authConfigs.list({ toolkit: INSTAGRAM_TOOLKIT_SLUG });
    authConfigId = configs.items?.[0]?.id ?? null;
  } catch {
    authConfigId = null;
  }

  const request = authConfigId
    ? await composio.connectedAccounts.link(userId, authConfigId, { callbackUrl })
    : await composio.toolkits.authorize(userId, INSTAGRAM_TOOLKIT_SLUG);

  if (!request.redirectUrl) {
    throw new Error("Composio did not return a redirect URL for Instagram OAuth.");
  }
  // Persist the pending connected-account id so the callback can finalize it.
  await writeConnection({
    connectedAccountId: request.id,
    authConfigId,
    composioUserId: userId,
    status: "DISCONNECTED",
  });
  return { redirectUrl: request.redirectUrl };
}

/**
 * Flow B — finalize after the OAuth callback. Confirms the connection became
 * ACTIVE, then verifies to populate profile + capabilities.
 */
export async function completeConnect(): Promise<VerifyResult> {
  const conn = await activeConnection();
  if (!conn) {
    return { ok: false, status: "ERROR", message: "Aucune connexion en attente.", username: null, capabilities: [] };
  }
  const composio = getComposio();
  try {
    await composio.connectedAccounts.waitForConnection(conn.connectedAccountId, 30_000);
  } catch {
    // Not yet active — surface reauth state rather than throwing.
  }
  return verifyConnection();
}

/**
 * "Test connection" — runs a harmless read (the business profile), resolves
 * capabilities from the live toolkit, and updates status + profile + last error.
 * Never creates a post.
 */
export async function verifyConnection(): Promise<VerifyResult> {
  const conn = await activeConnection();
  if (!conn) {
    return { ok: false, status: "DISCONNECTED", message: "Aucun compte Instagram lié.", username: null, capabilities: [] };
  }

  const slugMap = await resolveSlugs();
  const available = INSTAGRAM_CAPABILITIES.filter((c) => slugMap[c]);
  const profileSlug = slugMap.profile;

  if (!profileSlug) {
    await writeProfile({
      status: "ERROR",
      capabilities: available,
      verifiedAt: true,
      error: { code: "unsupported_action", message: "Aucune action de profil disponible dans Composio." },
    });
    return {
      ok: false,
      status: "ERROR",
      message: "La connexion fonctionne, mais aucune action de profil n’est disponible.",
      username: null,
      capabilities: available,
    };
  }

  const res = await execTool(profileSlug, conn, {});
  if (!res.ok) {
    const reauth = res.code === "permission_denied" || res.code === "account_not_found";
    const status: SocialIntegrationStatus = reauth ? "REAUTH_REQUIRED" : "ERROR";
    await writeProfile({
      status,
      capabilities: available,
      verifiedAt: true,
      error: { code: res.code ?? "unknown", message: res.message ?? "Échec de la vérification." },
    });
    return {
      ok: false,
      status,
      message: reauth
        ? "La connexion Instagram doit être renouvelée."
        : "La vérification de la connexion Instagram a échoué.",
      username: null,
      capabilities: available,
    };
  }

  const profile = extractProfile(res.data);
  // "Working but missing some permissions": profile read succeeds but writes are absent.
  const missingWrites = !slugMap.commentReply && !slugMap.publish;
  await writeProfile({
    status: "CONNECTED",
    ...profile,
    capabilities: available,
    verifiedAt: true,
    error: null,
  });
  return {
    ok: true,
    status: "CONNECTED",
    message: missingWrites
      ? "La connexion fonctionne, mais certaines autorisations Instagram sont manquantes."
      : "Connexion Instagram vérifiée avec succès.",
    username: profile.username,
    capabilities: available,
  };
}

/** Refreshes profile metadata + lastSyncAt (read-only). */
export async function syncNow(): Promise<VerifyResult> {
  const result = await verifyConnection();
  if (result.ok) {
    await writeProfile({ status: "CONNECTED", capabilities: result.capabilities, syncedAt: true });
  }
  return result;
}

/** Reads the connected business profile (fresh from Instagram). */
export async function getProfile(): Promise<ProfileFields | null> {
  const conn = await activeConnection();
  if (!conn) return null;
  const slugMap = await resolveSlugs();
  if (!slugMap.profile) return null;
  const res = await execTool(slugMap.profile, conn, {});
  return res.ok ? extractProfile(res.data) : null;
}

/** Recent media/posts for the connected account. */
export async function getRecentMedia(limit = 12): Promise<InstagramMediaDTO[]> {
  const conn = await activeConnection();
  if (!conn) return [];
  const slugMap = await resolveSlugs();
  if (!slugMap.media) return [];
  const res = await execTool(slugMap.media, conn, { limit });
  if (!res.ok) return [];
  return pickArray(res.data).map(extractMedia).filter((m) => m.id);
}

/** Details for a single media object. */
export async function getMediaDetails(mediaId: string): Promise<InstagramMediaDTO | null> {
  const conn = await activeConnection();
  if (!conn || !mediaId) return null;
  const slugMap = await resolveSlugs();
  const slug = slugMap.mediaDetails ?? slugMap.media;
  if (!slug) return null;
  const res = await execTool(slug, conn, { media_id: mediaId });
  return res.ok ? extractMedia(unwrap(res.data)) : null;
}

/** Comments for a media object. */
export async function getComments(mediaId: string): Promise<InstagramCommentDTO[]> {
  const conn = await activeConnection();
  if (!conn || !mediaId) return [];
  const slugMap = await resolveSlugs();
  if (!slugMap.comments) return [];
  const res = await execTool(slugMap.comments, conn, { media_id: mediaId });
  if (!res.ok) return [];
  return pickArray(res.data).map(extractComment).filter((c) => c.id);
}

/**
 * Replies to a comment. Idempotent: a repeated `idempotencyKey` that already
 * succeeded is a no-op returning the prior result. Every reply is admin-driven
 * (confirmed in the UI) — never automatic.
 */
export async function replyToComment(input: {
  commentId: string;
  message: string;
  adminId: string;
  adminName: string;
  idempotencyKey: string;
}): Promise<{ ok: boolean; code?: string; message?: string; resultId?: string | null }> {
  const conn = await activeConnection();
  if (!conn) return { ok: false, code: "account_not_found", message: "Aucun compte Instagram lié." };
  const slugMap = await resolveSlugs();
  if (!slugMap.commentReply) {
    return { ok: false, code: "unsupported_action", message: "Les réponses aux commentaires ne sont pas disponibles." };
  }
  const claim = await claimAction({
    kind: "COMMENT_REPLY",
    idempotencyKey: input.idempotencyKey,
    adminId: input.adminId,
    adminName: input.adminName,
    targetId: input.commentId,
    caption: input.message.slice(0, 500),
  });
  if (!claim.claimed) {
    return claim.status === "SUCCESS"
      ? { ok: true, resultId: claim.resultId, message: "Réponse déjà envoyée." }
      : { ok: false, code: "in_progress", message: "Cette réponse est déjà en cours d’envoi." };
  }

  const res = await execTool(slugMap.commentReply, conn, {
    comment_id: input.commentId,
    message: input.message,
  });
  const resultId = res.ok ? pickString(unwrap(res.data), ["id", "comment_id"]) : null;
  await recordAction({
    kind: "COMMENT_REPLY" satisfies InstagramActionKind,
    idempotencyKey: input.idempotencyKey,
    adminId: input.adminId,
    adminName: input.adminName,
    status: res.ok ? "SUCCESS" : "FAILED",
    targetId: input.commentId,
    resultId,
    caption: input.message.slice(0, 500),
    errorMessage: res.ok ? null : res.message ?? null,
  });
  return { ok: res.ok, code: res.code, message: res.message, resultId };
}

/**
 * Publishes a single image to Instagram. Idempotent on `idempotencyKey`. The
 * media URL must be a publicly reachable https URL (Instagram fetches it).
 */
export async function publishMedia(input: {
  imageUrl: string;
  caption: string;
  adminId: string;
  adminName: string;
  idempotencyKey: string;
}): Promise<{ ok: boolean; code?: string; message?: string; mediaId?: string | null }> {
  const conn = await activeConnection();
  if (!conn) return { ok: false, code: "account_not_found", message: "Aucun compte Instagram lié." };
  const slugMap = await resolveSlugs();
  if (!slugMap.publish) {
    return { ok: false, code: "unsupported_action", message: "La publication n’est pas disponible." };
  }
  const claim = await claimAction({
    kind: "PUBLISH_MEDIA",
    idempotencyKey: input.idempotencyKey,
    adminId: input.adminId,
    adminName: input.adminName,
    caption: input.caption.slice(0, 500),
  });
  if (!claim.claimed) {
    return claim.status === "SUCCESS"
      ? { ok: true, mediaId: claim.resultId, message: "Publication déjà effectuée." }
      : { ok: false, code: "in_progress", message: "Cette publication est déjà en cours d’envoi." };
  }

  const res = await execTool(slugMap.publish, conn, {
    image_url: input.imageUrl,
    caption: input.caption,
    media_type: "IMAGE",
  });
  const mediaId = res.ok ? pickString(unwrap(res.data), ["id", "media_id", "creation_id"]) : null;
  await recordAction({
    kind: "PUBLISH_MEDIA" satisfies InstagramActionKind,
    idempotencyKey: input.idempotencyKey,
    adminId: input.adminId,
    adminName: input.adminName,
    status: res.ok ? "SUCCESS" : "FAILED",
    targetId: null,
    resultId: mediaId,
    caption: input.caption.slice(0, 500),
    errorMessage: res.ok ? null : res.message ?? null,
  });
  return { ok: res.ok, code: res.code, message: res.message, mediaId };
}

/**
 * Unlinks the connection from Ghost.ma. `revoke` additionally deletes the
 * Composio connection (revoking Instagram access); the default only unlinks
 * locally and leaves the Composio connection intact.
 */
export async function disconnectOrUnlink(revoke: boolean): Promise<{ ok: boolean; message?: string }> {
  if (revoke) {
    const conn = await activeConnection();
    if (conn) {
      try {
        await getComposio().connectedAccounts.delete(conn.connectedAccountId);
      } catch (error) {
        const norm = normalizeComposioError(error);
        // eslint-disable-next-line no-console
        console.error("[instagram] revoke failed", norm.logHint);
        return { ok: false, message: norm.message };
      }
    }
  }
  await writeUnlink();
  return { ok: true };
}

/** Resolves the live capability→availability map (for AI tools / diagnostics). */
export async function getAvailableCapabilities(): Promise<InstagramCapability[]> {
  const conn = await activeConnection();
  if (!conn) return [];
  const slugMap = await resolveSlugs();
  return INSTAGRAM_CAPABILITIES.filter((c) => slugMap[c]);
}

export { READ_CAPABILITIES };
