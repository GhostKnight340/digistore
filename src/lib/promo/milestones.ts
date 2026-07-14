/**
 * Pure spending-milestone logic — no I/O. Decides which milestones a customer
 * has newly crossed (to grant) and which granted milestones are no longer
 * qualified (to reverse after a refund). Money is whole MAD integers.
 *
 * Milestones are CUMULATIVE account-level thresholds ("spend X total → earn Y"),
 * granted once per customer per milestone. They are not points, not per-order
 * cashback, and not a single repeating threshold.
 */

export interface MilestoneRule {
  id: string;
  thresholdMad: number;
  rewardMad: number;
  active: boolean;
  archivedAt: Date | string | null;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
}

function toTime(value: Date | string | null): number | null {
  if (value == null) return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Whether a milestone is live (active, not archived, within its date window). */
export function isMilestoneLive(m: MilestoneRule, now: Date): boolean {
  if (!m.active || m.archivedAt) return false;
  const start = toTime(m.startsAt);
  const end = toTime(m.endsAt);
  if (start != null && now.getTime() < start) return false;
  if (end != null && now.getTime() > end) return false;
  return true;
}

/**
 * Milestones the customer has newly crossed: live, threshold reached by the
 * qualifying spend, and not already granted. Returned ascending by threshold so
 * the grants are applied lowest-first (and the final one stamps the new expiry).
 */
export function milestonesToGrant(
  milestones: MilestoneRule[],
  qualifyingSpendMad: number,
  alreadyGrantedIds: Set<string>,
  now: Date,
): MilestoneRule[] {
  return milestones
    .filter((m) => isMilestoneLive(m, now))
    .filter((m) => !alreadyGrantedIds.has(m.id))
    .filter((m) => qualifyingSpendMad >= m.thresholdMad)
    .sort((a, b) => a.thresholdMad - b.thresholdMad);
}

export interface GrantedMilestone {
  milestoneId: string;
  thresholdMad: number;
}

/**
 * Granted milestones no longer qualified after qualifying spend dropped (refund),
 * ordered HIGHEST threshold first so the top rewards are reversed before lower
 * ones (per the spec's example).
 */
export function milestonesToReverse(
  granted: GrantedMilestone[],
  qualifyingSpendMad: number,
): GrantedMilestone[] {
  return granted
    .filter((g) => g.thresholdMad > qualifyingSpendMad)
    .sort((a, b) => b.thresholdMad - a.thresholdMad);
}

export interface MilestoneProgress {
  qualifyingSpendMad: number;
  /** The next locked, live milestone (lowest threshold above current spend). */
  next: { id: string; thresholdMad: number; rewardMad: number; remainingMad: number } | null;
  /** Whether every currently live milestone is already unlocked. */
  allUnlocked: boolean;
}

/**
 * Customer-facing progress: the next live milestone still to unlock and how much
 * more qualifying spend is needed. `unlockedIds` are milestones already granted.
 */
export function computeMilestoneProgress(
  milestones: MilestoneRule[],
  qualifyingSpendMad: number,
  unlockedIds: Set<string>,
  now: Date,
): MilestoneProgress {
  const live = milestones.filter((m) => isMilestoneLive(m, now));
  const locked = live
    .filter((m) => !unlockedIds.has(m.id))
    .sort((a, b) => a.thresholdMad - b.thresholdMad);
  const next = locked[0] ?? null;
  return {
    qualifyingSpendMad,
    next: next
      ? {
          id: next.id,
          thresholdMad: next.thresholdMad,
          rewardMad: next.rewardMad,
          remainingMad: Math.max(0, next.thresholdMad - qualifyingSpendMad),
        }
      : null,
    allUnlocked: live.length > 0 && locked.length === 0,
  };
}
