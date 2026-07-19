/**
 * Supplier admin alerts, with deduplication.
 *
 * Supplier problems are persistent by nature: a low balance stays low, a stuck
 * order stays stuck, an expired subscription stays expired. Firing on every
 * cron tick would produce dozens of identical messages an hour and train the
 * team to ignore the channel — which is worse than not alerting at all.
 *
 * So each alert key gets a cooldown. The first occurrence goes out immediately;
 * repeats are suppressed until the cooldown lapses.
 *
 * The cooldown is in-memory. That is a deliberate trade-off rather than an
 * oversight: on serverless the process may recycle between ticks, so worst case
 * an alert repeats sooner than intended — noisier, never silent. Persisting it
 * would mean a DB write on the alert path, where a failure could swallow the
 * alert entirely. Loud beats lost.
 */
import "server-only";
import { notifySystemAlert } from "./notify";

export type SupplierAlertKey =
  | "auth_failed"
  | "subscription_inactive"
  | "plan_expiring"
  | "balance_low"
  | "balance_critical"
  | "catalog_sync_failed"
  | "purchase_failures"
  | "purchase_uncertain"
  | "reconciliation_required"
  | "mapping_invalid"
  | "webhook_invalid_signature"
  | "order_stuck"
  | "health_failed";

/** Cooldown per key, in minutes. Tuned to how fast each condition can change. */
const COOLDOWN_MINUTES: Record<SupplierAlertKey, number> = {
  auth_failed: 30,
  subscription_inactive: 60,
  plan_expiring: 60 * 24,
  balance_low: 60 * 6,
  balance_critical: 60,
  catalog_sync_failed: 60,
  purchase_failures: 15,
  // Money may be at stake — the shortest cooldown of the set.
  purchase_uncertain: 5,
  reconciliation_required: 30,
  mapping_invalid: 60 * 6,
  webhook_invalid_signature: 30,
  order_stuck: 30,
  health_failed: 30,
};

const lastSentAt = new Map<string, number>();

export type SupplierAlert = {
  key: SupplierAlertKey;
  supplier: string;
  title: string;
  detail: string;
  severity: "critical" | "warning" | "info";
  /** Extra safe context. Never codes, credentials or customer data. */
  context?: Record<string, string | number | boolean | null | undefined>;
};

/**
 * Sends an admin alert unless an identical one was sent recently.
 * Never throws — an alerting failure must not break a fulfillment path.
 */
export async function notifySupplierAlert(alert: SupplierAlert): Promise<void> {
  const dedupeKey = `${alert.supplier}:${alert.key}`;
  const cooldownMs = COOLDOWN_MINUTES[alert.key] * 60_000;
  const previous = lastSentAt.get(dedupeKey);
  const now = Date.now();

  if (previous != null && now - previous < cooldownMs) return;
  lastSentAt.set(dedupeKey, now);

  try {
    await notifySystemAlert({
      scope: `supplier:${alert.supplier}`,
      message: `**${alert.title}**\n${alert.detail}`,
      context: {
        severity: alert.severity,
        alert: alert.key,
        ...alert.context,
      },
    });
  } catch (error) {
    console.error("[supplier-alert]", dedupeKey, error);
  }
}

/** Test seam — clears the cooldown map. */
export function resetSupplierAlertCooldowns(): void {
  lastSentAt.clear();
}
