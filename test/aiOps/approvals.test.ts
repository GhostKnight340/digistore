// AI Operations — approval queue state machine (spec §7). Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canTransition,
  assertTransition,
  isTerminalStatus,
  isExpired,
} from "../../src/lib/ai-ops/approvals";

test("legal PENDING transitions", () => {
  for (const to of ["APPROVED", "REJECTED", "EXPIRED", "CANCELLED"] as const) {
    assert.equal(canTransition("PENDING", to), true, `PENDING→${to}`);
  }
});

test("APPROVED can start executing then complete or fail", () => {
  assert.equal(canTransition("APPROVED", "EXECUTING"), true);
  assert.equal(canTransition("EXECUTING", "COMPLETED"), true);
  assert.equal(canTransition("EXECUTING", "FAILED"), true);
});

test("terminal states allow no further transitions", () => {
  for (const s of ["REJECTED", "EXPIRED", "COMPLETED", "FAILED", "CANCELLED"] as const) {
    assert.equal(isTerminalStatus(s), true);
    assert.equal(canTransition(s, "PENDING"), false);
    assert.equal(canTransition(s, "APPROVED"), false);
  }
});

test("illegal transitions are rejected", () => {
  assert.equal(canTransition("PENDING", "COMPLETED"), false);
  assert.equal(canTransition("PENDING", "EXECUTING"), false);
  assert.equal(canTransition("REJECTED", "APPROVED"), false);
  assert.equal(canTransition("PENDING", "PENDING"), false);
});

test("assertTransition throws on an illegal move", () => {
  assert.throws(() => assertTransition("PENDING", "COMPLETED"));
  assert.equal(assertTransition("PENDING", "APPROVED"), "APPROVED");
});

test("only PENDING items with a passed expiry are expired", () => {
  const past = new Date("2020-01-01T00:00:00Z");
  const future = new Date("2999-01-01T00:00:00Z");
  const now = new Date("2026-07-21T00:00:00Z");
  assert.equal(isExpired("PENDING", past, now), true);
  assert.equal(isExpired("PENDING", future, now), false);
  assert.equal(isExpired("PENDING", null, now), false);
  // A non-PENDING item never "expires" even with a past expiry.
  assert.equal(isExpired("APPROVED", past, now), false);
});
