/**
 * Absolute site origin for canonical URLs, Open Graph, sitemap and robots.
 * Reads NEXT_PUBLIC_SITE_URL (then SITE_URL / APP_URL), trailing slash stripped,
 * falling back to the production origin. Mirrors the resolver pattern in
 * src/lib/auth.ts. Safe on both server and client.
 */
const FALLBACK = "https://ghost.ma";

export function getSiteUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.APP_URL ||
    FALLBACK;
  return configured.replace(/\/+$/, "");
}

/** Build an absolute URL from a site-relative path. */
export function absoluteUrl(path: string): string {
  return `${getSiteUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
}
