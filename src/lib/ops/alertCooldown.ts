import "server-only";

import { prisma } from "@/lib/db/prisma";
import { log } from "./log";

/**
 * Durable alert deduplication.
 *
 * Replaces the per-process `Map` in src/lib/discord/supplierAlerts.ts. That
 * module's own comment defends the in-memory choice as "loud beats lost" — the
 * worry being that a DB write on the alert path could swallow an alert. The
 * worry is right; the conclusion was wrong on serverless, where processes
 * recycle constantly. In practice a persistently failing integration re-alerted
 * on every cold start, which trains the team to mute the channel — the failure
 * mode the cooldown existed to prevent.
 *
 * This keeps the original safety property by construction: **any failure to
 * read or write the cooldown row results in the alert being SENT.** Losing the
 * cooldown is noisy; losing the alert is dangerous. The database is allowed to
 * make us noisy, never silent.
 */

export type AlertSeverity = "critical" | "warning" | "info";

export interface CooldownDecision {
  /** True when the caller should actually send the alert. */
  shouldSend: boolean;
  /** How many times this key has fired before (0 on first ever). */
  previousFires: number;
  /** How many sends have been suppressed since the last one went out. */
  suppressedSinceLastSend: number;
}

/**
 * Claims the right to send an alert for `key`, or reports that it is cooling
 * down. Records the attempt either way, so the dashboard can distinguish
 * "recovered" from "still failing, currently muted".
 *
 * Never throws.
 */
export async function claimAlertSlot(
  key: string,
  severity: AlertSeverity,
  cooldownMs: number,
  now: Date = new Date(),
): Promise<CooldownDecision> {
  try {
    const existing = await prisma.alertCooldown.findUnique({ where: { key } });

    if (!existing) {
      await prisma.alertCooldown.create({
        data: { key, severity, lastFiredAt: now, firedCount: 1, suppressedCount: 0 },
      });
      return { shouldSend: true, previousFires: 0, suppressedSinceLastSend: 0 };
    }

    const elapsed = now.getTime() - existing.lastFiredAt.getTime();
    if (elapsed < cooldownMs) {
      // Still cooling down. Record the suppression so a persistently failing
      // integration is visibly muted rather than looking recovered.
      await prisma.alertCooldown.update({
        where: { key },
        data: {
          suppressedCount: { increment: 1 },
          lastSuppressedAt: now,
          // Severity can escalate while muted (warning → critical); keep the
          // most recent so the dashboard reflects the current state.
          severity,
        },
      });
      return {
        shouldSend: false,
        previousFires: existing.firedCount,
        suppressedSinceLastSend: existing.suppressedCount + 1,
      };
    }

    await prisma.alertCooldown.update({
      where: { key },
      data: {
        lastFiredAt: now,
        firedCount: { increment: 1 },
        suppressedCount: 0,
        severity,
      },
    });
    return {
      shouldSend: true,
      previousFires: existing.firedCount,
      suppressedSinceLastSend: existing.suppressedCount,
    };
  } catch (error) {
    // FAIL OPEN. If the cooldown store is unreachable we would rather send a
    // duplicate alert than drop a real one — the database must never be able to
    // silence monitoring.
    log.exception(error, {
      operation: "alert.cooldown",
      result: "failed",
      code: "cooldown_store_unavailable",
      alertKey: key,
    });
    return { shouldSend: true, previousFires: 0, suppressedSinceLastSend: 0 };
  }
}

/** Clears a key's cooldown so the next occurrence alerts immediately. */
export async function resetAlertCooldown(key: string): Promise<void> {
  try {
    await prisma.alertCooldown.deleteMany({ where: { key } });
  } catch {
    // Best-effort.
  }
}

/** Recently-fired alerts for the admin dashboard, most recent first. */
export async function recentAlerts(limit = 8) {
  try {
    return await prisma.alertCooldown.findMany({
      orderBy: { lastFiredAt: "desc" },
      take: limit,
      select: {
        key: true,
        severity: true,
        lastFiredAt: true,
        firedCount: true,
        suppressedCount: true,
        lastSuppressedAt: true,
      },
    });
  } catch {
    return [];
  }
}
