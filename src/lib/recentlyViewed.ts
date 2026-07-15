/**
 * Client-side "Consultés récemment" history. Guests AND logged-in customers use
 * localStorage at launch (the RecentlyViewedProduct table exists so account-level
 * cross-device sync can be switched on later without a migration). Only PARENT
 * product slugs are stored — never a variant, never any personal data — so a
 * product family appears once regardless of which denomination was viewed.
 *
 * Entries are newest-first and de-duplicated: re-viewing a product moves it to
 * the front and refreshes its timestamp. The list is capped (default 12).
 */

const KEY = "ghost.recentlyViewed.v1";
export const DEFAULT_RECENT_MAX = 12;

export interface RecentEntry {
  slug: string;
  viewedAt: number;
}

function read(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentEntry =>
        Boolean(e) &&
        typeof (e as RecentEntry).slug === "string" &&
        typeof (e as RecentEntry).viewedAt === "number",
    );
  } catch {
    return [];
  }
}

function write(entries: RecentEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable */
  }
}

/** Ordered slugs, newest-first. */
export function getRecentSlugs(): string[] {
  return read()
    .sort((a, b) => b.viewedAt - a.viewedAt)
    .map((e) => e.slug);
}

/**
 * Record a product view (by parent slug). Moves an existing entry to the front
 * and refreshes its timestamp; caps the list. `now` is injectable for tests.
 */
export function recordView(
  slug: string,
  max = DEFAULT_RECENT_MAX,
  now = Date.now(),
): void {
  const clean = slug.trim();
  if (!clean) return;
  const next = read().filter((e) => e.slug !== clean);
  next.unshift({ slug: clean, viewedAt: now });
  write(next.sort((a, b) => b.viewedAt - a.viewedAt).slice(0, Math.max(1, max)));
}

/** Clear the entire history. */
export function clearRecent(): void {
  write([]);
}
