/**
 * Collection scheduling / visibility state. Pure and client-safe (no DB, no
 * `server-only`) so both the storefront reads and the admin editor compute the
 * exact same state, and so it is unit-testable without a database.
 *
 * Visibility is derived at render/query time from `active` + the optional
 * start/end window vs. "now" — no cron is required. The start/end bounds are
 * absolute instants (a `DateTime` column / ISO string); comparing instants is
 * timezone-independent, so the gate is correct regardless of where it runs. The
 * business timezone (settings.expenses.businessTimezone) only governs how the
 * admin *displays* those instants, not the comparison itself.
 */
export type CollectionState = "inactive" | "upcoming" | "live" | "expired";

type SchedulableCollection = {
  active: boolean;
  startAt: Date | string | null;
  endAt: Date | string | null;
};

function toTime(value: Date | string | null): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Resolve a collection's lifecycle state:
 *  - inactive : not activated (draft / turned off) — never public.
 *  - upcoming : active but its start date is still in the future.
 *  - expired  : active but its end date has passed.
 *  - live     : active and within its window (or no window) — publicly visible.
 */
export function collectionState(
  collection: SchedulableCollection,
  now: Date = new Date(),
): CollectionState {
  if (!collection.active) return "inactive";
  const nowMs = now.getTime();
  const start = toTime(collection.startAt);
  const end = toTime(collection.endAt);
  if (start !== null && start > nowMs) return "upcoming";
  if (end !== null && end < nowMs) return "expired";
  return "live";
}

/** True only when the collection may be shown publicly (homepage, page, sitemap,
 *  search): active and currently within its schedule window. */
export function isCollectionPublic(
  collection: SchedulableCollection,
  now: Date = new Date(),
): boolean {
  return collectionState(collection, now) === "live";
}

/** French label for an admin status badge. */
export function collectionStateLabel(state: CollectionState): string {
  switch (state) {
    case "live":
      return "En ligne";
    case "upcoming":
      return "Programmée";
    case "expired":
      return "Expirée";
    case "inactive":
      return "Inactive";
  }
}
