import "server-only";

/**
 * Static configuration for the Composio Instagram integration.
 *
 * Instagram tool *slugs* are NOT hardcoded as the single source of truth — the
 * installed Composio toolkit version decides the real slugs, so the service
 * discovers the toolkit's actual tools at runtime and matches them against the
 * capability patterns below (see `capabilities.ts`). The candidate lists here are
 * only ordered fallbacks used when discovery is unavailable.
 */

/** Composio toolkit slug for Instagram. */
export const INSTAGRAM_TOOLKIT_SLUG = "instagram";

/** Provider key stored on the SocialIntegration row (schema `provider`). */
export const INSTAGRAM_PROVIDER = "INSTAGRAM";

/**
 * Stable Composio "user"/entity id representing the Ghost.ma business. Using one
 * fixed id (rather than a per-request id) keeps a single connected account for
 * the whole store and avoids creating a new entity on every request.
 */
export const GHOST_MA_COMPOSIO_USER_ID = "ghost-ma-admin";

/** Deep link to the connected profile on instagram.com. */
export function instagramProfileUrl(username: string | null | undefined): string | null {
  const handle = (username ?? "").trim().replace(/^@/, "");
  if (!handle) return null;
  return `https://www.instagram.com/${encodeURIComponent(handle)}/`;
}
