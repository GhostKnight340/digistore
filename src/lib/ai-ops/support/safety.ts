/**
 * Automatic safety pause evaluator (Phase C) — PURE.
 *
 * Decides whether outgoing AI activity should be paused based on signals the
 * sweep can actually observe: a burst of failures in one cycle, or a run of
 * consecutive low-confidence classifications. (Other spec triggers — integration
 * disconnect, duplicate sends, detected misinformation — are surfaced by their
 * own detectors as they are built; this evaluator owns the counter-based ones.)
 * Pure so the thresholds are unit-testable without a DB.
 */

export const AUTOPAUSE_FAILURES_PER_SWEEP = 3;
export const AUTOPAUSE_CONSECUTIVE_LOW = 3;

export interface AutoPauseSignals {
  failedThisSweep: number;
  consecutiveLowConfidence: number;
}

export interface AutoPauseDecision {
  pause: boolean;
  reason?: string;
}

export function evaluateAutoPause(signals: AutoPauseSignals): AutoPauseDecision {
  if (signals.failedThisSweep >= AUTOPAUSE_FAILURES_PER_SWEEP) {
    return { pause: true, reason: `Trop d'échecs (${signals.failedThisSweep}) sur un seul cycle de traitement.` };
  }
  if (signals.consecutiveLowConfidence >= AUTOPAUSE_CONSECUTIVE_LOW) {
    return { pause: true, reason: `${signals.consecutiveLowConfidence} classifications à faible confiance consécutives.` };
  }
  return { pause: false };
}
