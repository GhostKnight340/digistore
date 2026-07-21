/**
 * Message idempotency + execution locking (spec §5).
 *
 * The Discord message id claims a unique key. The first caller inserts it
 * ("processing") and proceeds; concurrent or redelivered messages see the row
 * and are told to skip (no duplicate reply, provider call, execution, or log).
 * A completed answer is cached so a retry returns it verbatim. Stale claims
 * (expired) can be re-taken so a crashed run never wedges a message forever.
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";

export type ClaimState = "claimed" | "duplicate_done" | "duplicate_processing";

export interface ClaimResult {
  state: ClaimState;
  /** The cached answer when state is "duplicate_done". */
  result?: string | null;
}

/** Try to claim a key. Never throws; fails OPEN (claims) on a DB error. */
export async function claimIdempotency(
  key: string,
  ttlMs: number,
  now: number = Date.now(),
): Promise<ClaimResult> {
  const expiresAt = new Date(now + ttlMs);
  try {
    await prisma.aiIdempotencyKey.create({ data: { key, status: "processing", expiresAt } });
    return { state: "claimed" };
  } catch {
    // Unique violation (or a race) — inspect the existing row.
    const existing = await prisma.aiIdempotencyKey.findUnique({ where: { key } }).catch(() => null);
    if (!existing) return { state: "claimed" };
    if (existing.expiresAt.getTime() <= now) {
      // Stale claim from a crashed/slow run — re-take it.
      await prisma.aiIdempotencyKey
        .update({ where: { key }, data: { status: "processing", result: null, reason: null, expiresAt } })
        .catch(() => {});
      return { state: "claimed" };
    }
    if (existing.status === "done") return { state: "duplicate_done", result: existing.result };
    return { state: "duplicate_processing" };
  }
}

export async function completeIdempotency(key: string, result: string): Promise<void> {
  await prisma.aiIdempotencyKey
    .update({ where: { key }, data: { status: "done", result } })
    .catch(() => {});
}

export async function failIdempotency(key: string, reason: string): Promise<void> {
  // Failures don't cache a result; the row expires so a later retry can run.
  await prisma.aiIdempotencyKey
    .update({ where: { key }, data: { status: "failed", reason: reason.slice(0, 100) } })
    .catch(() => {});
}
