import "server-only";

import { getStoreSettings } from "@/lib/db/catalog";
import { isOrderingEnabled, ORDERS_UNAVAILABLE_COPY } from "@/lib/storeSettings";

/**
 * Server-side source of truth for whether customers may currently create or pay
 * for orders. Every order-creation / payment entry point (server actions, DB
 * mutations) must consult this so a disabled state cannot be bypassed by a
 * crafted request — disabling the frontend buttons alone is not enough.
 *
 * Fails CLOSED: if settings can't be read we treat ordering as disabled, so a
 * transient error never accidentally exposes payment while pre-launch mode is
 * intended to be on. (The default settings blob is OFF anyway.)
 */
export async function isOrderingCurrentlyEnabled(): Promise<boolean> {
  try {
    const settings = await getStoreSettings();
    return isOrderingEnabled(settings);
  } catch {
    return false;
  }
}

/** Standard rejection payload for `ActionResult`-shaped server actions. */
export const ORDERING_DISABLED_RESULT = {
  ok: false as const,
  error: ORDERS_UNAVAILABLE_COPY.title,
};
