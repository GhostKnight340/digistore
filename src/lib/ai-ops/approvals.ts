/**
 * Approval queue — the pure state machine.
 *
 * The reusable approval workflow that future modules (starting with the Support
 * Assistant) use to draft an action and wait for a human. This file is the pure
 * transition table: which status may follow which, and what an expiry check
 * looks like. No DB, so it is unit-testable directly. The persistence wrapper is
 * in src/lib/ai-ops/approvalStore.ts.
 *
 *   PENDING   ─ approve ─▶ APPROVED ─ start ─▶ EXECUTING ─▶ COMPLETED | FAILED
 *      │
 *      ├─ reject  ─▶ REJECTED
 *      ├─ expire  ─▶ EXPIRED
 *      └─ cancel  ─▶ CANCELLED
 *
 * Terminal states (REJECTED, EXPIRED, COMPLETED, FAILED, CANCELLED) allow no
 * further transitions.
 */

import type { ApprovalStatus } from "./types";

/** For each status, the set of statuses it may legally move to. */
const TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  PENDING: ["APPROVED", "REJECTED", "EXPIRED", "CANCELLED"],
  APPROVED: ["EXECUTING", "CANCELLED"],
  EXECUTING: ["COMPLETED", "FAILED"],
  // Terminal.
  REJECTED: [],
  EXPIRED: [],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

const TERMINAL: ReadonlySet<ApprovalStatus> = new Set<ApprovalStatus>([
  "REJECTED",
  "EXPIRED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export function isTerminalStatus(status: ApprovalStatus): boolean {
  return TERMINAL.has(status);
}

/** Is `from → to` a legal transition? Pure. */
export function canTransition(
  from: ApprovalStatus,
  to: ApprovalStatus,
): boolean {
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

/**
 * Applies a transition, returning the next status, or throwing on an illegal
 * one. Callers that want a soft check should use {@link canTransition} first.
 */
export function assertTransition(
  from: ApprovalStatus,
  to: ApprovalStatus,
): ApprovalStatus {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal approval transition: ${from} → ${to}`);
  }
  return to;
}

/**
 * Should a PENDING item be treated as expired at `now`? Only PENDING items can
 * expire; an item with no expiry never does. Pure so the expiry sweep is
 * testable without a clock or a DB.
 */
export function isExpired(
  status: ApprovalStatus,
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (status !== "PENDING") return false;
  if (!expiresAt) return false;
  return now.getTime() >= expiresAt.getTime();
}
