/**
 * Resolve a post-auth redirect target that is guaranteed to stay on this site.
 *
 * A candidate is honoured only when it is a plain internal path:
 *   - starts with a single "/" (site-root relative)
 *   - is not protocol-relative ("//host") or a Windows/back-slash variant
 *   - contains no control characters
 *
 * Anything else (absolute URLs, external hosts, empty/invalid values) is
 * rejected so a logged-in visitor can never be bounced to an external site.
 */
export function safeInternalPath(candidate: unknown): string | null {
  const value = Array.isArray(candidate) ? candidate[0] : candidate;
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path.startsWith("/")) return null; // must be root-relative
  if (path.startsWith("//") || path.startsWith("/\\")) return null; // protocol-relative
  if (path.includes("\\")) return null; // back-slash tricks
  for (let i = 0; i < path.length; i += 1) {
    if (path.charCodeAt(i) < 0x20) return null; // reject control characters
  }
  return path;
}

/** Common query keys used to carry a post-auth callback URL. */
const REDIRECT_KEYS = ["callbackUrl", "redirect", "redirectTo", "next", "returnTo"];

/**
 * Pick the first safe internal redirect from a search-params object, falling
 * back to `/account` when none is present or all candidates are unsafe.
 */
export function resolveAuthedRedirect(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  fallback = "/account",
): string {
  if (searchParams) {
    for (const key of REDIRECT_KEYS) {
      const safe = safeInternalPath(searchParams[key]);
      if (safe) return safe;
    }
  }
  return fallback;
}
