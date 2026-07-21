// AI Operations — scheduler idempotency, execution locking, retries (spec §8).
// Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isLockHeld,
  canClaimLock,
  evaluateDue,
  retriesExhausted,
  scheduledIdempotencyKey,
} from "../../src/lib/ai-ops/scheduler";

const NOW = new Date("2026-07-21T10:00:00Z");

test("EXECUTION LOCKING: a live lock is held; an expired one is not", () => {
  const live = { lockedAt: NOW, lockExpiresAt: new Date(NOW.getTime() + 60_000) };
  const expired = { lockedAt: NOW, lockExpiresAt: new Date(NOW.getTime() - 1) };
  assert.equal(isLockHeld(live, NOW), true);
  assert.equal(isLockHeld(expired, NOW), false);
  assert.equal(isLockHeld({ lockedAt: null, lockExpiresAt: null }, NOW), false);
});

test("a job with a live lock cannot be claimed; a free/expired one can", () => {
  assert.equal(canClaimLock({ lockedAt: NOW, lockExpiresAt: new Date(NOW.getTime() + 1000) }, NOW), false);
  assert.equal(canClaimLock({ lockedAt: null, lockExpiresAt: null }, NOW), true);
});

test("IDEMPOTENCY: the same key in the same bucket is a duplicate and is skipped", () => {
  const key = scheduledIdempotencyKey("daily_reports", "day", NOW);
  const decision = evaluateDue(
    { enabled: true, lastIdempotencyKey: key, lock: { lockedAt: null, lockExpiresAt: null } },
    key,
    NOW,
  );
  assert.equal(decision.shouldRun, false);
  assert.equal(decision.skipReason, "duplicate");
});

test("a fresh idempotency key runs", () => {
  const decision = evaluateDue(
    { enabled: true, lastIdempotencyKey: "daily_reports:20260720", lock: { lockedAt: null, lockExpiresAt: null } },
    "daily_reports:20260721",
    NOW,
  );
  assert.equal(decision.shouldRun, true);
});

test("a disabled job never runs", () => {
  const d = evaluateDue({ enabled: false, lastIdempotencyKey: null, lock: { lockedAt: null, lockExpiresAt: null } }, "k", NOW);
  assert.equal(d.shouldRun, false);
  assert.equal(d.skipReason, "disabled");
});

test("a locked job is skipped even if otherwise due", () => {
  const d = evaluateDue(
    { enabled: true, lastIdempotencyKey: null, lock: { lockedAt: NOW, lockExpiresAt: new Date(NOW.getTime() + 60_000) } },
    "k",
    NOW,
  );
  assert.equal(d.shouldRun, false);
  assert.equal(d.skipReason, "locked");
});

test("day-bucket idempotency keys are stable within a day, distinct across days", () => {
  const a = scheduledIdempotencyKey("j", "day", new Date("2026-07-21T01:00:00Z"));
  const b = scheduledIdempotencyKey("j", "day", new Date("2026-07-21T23:00:00Z"));
  const c = scheduledIdempotencyKey("j", "day", new Date("2026-07-22T00:00:00Z"));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("retry budget is exhausted only after maxRetries+1 consecutive failures", () => {
  assert.equal(retriesExhausted(0, 2), false);
  assert.equal(retriesExhausted(2, 2), false);
  assert.equal(retriesExhausted(3, 2), true);
});
