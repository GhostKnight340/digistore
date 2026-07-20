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
 * The cooldown is DURABLE (see lib/ops/alertCooldown). It used to be an
 * in-memory Map, defended as "loud beats lost" — the worry being that a DB write
 * on the alert path could swallow an alert. The worry was right, the conclusion
 * wrong on serverless: processes recycle constantly, so a persistently failing
 * integration re-alerted on every cold start and trained the team to mute the
 * channel, which is the exact failure the cooldown existed to prevent.
 *
 * The safety property is preserved by construction: any failure to read or write
 * the cooldown row results in the alert being SENT. The database can make us
 * noisy; it can never make us silent.
 */
import "server-only";
import { claimAlertSlot, resetAlertCooldown } from "@/lib/ops/alertCooldown";
import { log } from "@/lib/ops/log";
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

  const slot = await claimAlertSlot(dedupeKey, alert.severity, cooldownMs);
  if (!slot.shouldSend) return;

  try {
    await notifySystemAlert({
      scope: `supplier:${alert.supplier}`,
      message: `**${alert.title}**\n${alert.detail}`,
      context: {
        severity: alert.severity,
        alert: alert.key,
        // Surfaced so a recurring problem reads as recurring rather than new.
        ...(slot.suppressedSinceLastSend > 0
          ? { repeats_suppressed: slot.suppressedSinceLastSend }
          : {}),
        ...alert.context,
      },
    });
  } catch (error) {
    log.exception(error, {
      operation: "supplier.alert",
      integration: alert.supplier,
      result: "failed",
      code: alert.key,
    });
  }
}

/** Test seam — clears a supplier alert's cooldown so the next one fires now. */
export async function resetSupplierAlertCooldowns(
  supplier?: string,
  key?: SupplierAlertKey,
): Promise<void> {
  if (supplier && key) await resetAlertCooldown(`${supplier}:${key}`);
}
