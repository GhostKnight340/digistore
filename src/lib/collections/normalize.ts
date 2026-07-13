/**
 * Pure, client-safe helpers shared by the collections service layer and the
 * seed script. No DB, no `server-only`, so both the Next server modules and the
 * standalone tsx seed script can import them without pulling in `next/cache`.
 */

/** URL-safe slug: strip accents, lowercase, collapse to hyphens, cap length. */
export function slugifyCollection(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Clamp the homepage item limit to a sane bound. */
export function clampHomepageLimit(value: number): number {
  if (!Number.isFinite(value)) return 8;
  return Math.min(24, Math.max(1, Math.round(value)));
}

/** Trim, lowercase, drop empties, and de-duplicate aliases on one record. */
export function normalizeCollectionAliases(aliases: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of aliases) {
    const value = raw.trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
