// Abandoned-order credit release — pure unit tests for the idempotency keys and
// expiry-decision rules the DB layer relies on. The transactional restore /
// anti-avoidance behaviour (restore-then-expire when the wallet already lapsed)
// requires a real Postgres connection and is covered by the staging concurrency
// suite (see test/integration/README + docs/wallet-audit.md).
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  orderExpiryReleaseKey,
  orderExpiryCreditExpiredKey,
  computeExpiryDecision,
} from "../../src/lib/promo/ledgerMath";

// ── canonical keys (one per order, stable) ───────────────────────────────────
test("orderExpiryReleaseKey is stable and namespaced per order", () => {
  assert.equal(orderExpiryReleaseKey("ord_1"), "order-expiry-credit-release:ord_1");
  assert.equal(orderExpiryReleaseKey("ord_1"), orderExpiryReleaseKey("ord_1"));
  assert.notEqual(orderExpiryReleaseKey("ord_1"), orderExpiryReleaseKey("ord_2"));
});

test("orderExpiryCreditExpiredKey is distinct from the release key", () => {
  assert.equal(orderExpiryCreditExpiredKey("ord_1"), "order-expiry-credit-expired:ord_1");
  assert.notEqual(orderExpiryReleaseKey("ord_1"), orderExpiryCreditExpiredKey("ord_1"));
});

// ── restored credit must never re-arm the 180-day timer ──────────────────────
test("restoration (resetsExpiration=false) never marks qualifying or resets a live deadline", () => {
  const now = new Date("2026-07-14T00:00:00.000Z");
  const liveDeadline = new Date("2026-09-01T00:00:00.000Z");
  const decision = computeExpiryDecision({
    resetsExpiration: false,
    currentExpiresAt: liveDeadline,
    now,
    inactivityDays: 180,
  });
  assert.equal(decision.markQualifying, false);
  assert.equal(decision.changeExpiry, false);
  assert.equal(decision.newExpiresAt, null);
});

test("restoration onto a wallet with no deadline seeds one but stays non-qualifying", () => {
  const now = new Date("2026-07-14T00:00:00.000Z");
  const decision = computeExpiryDecision({
    resetsExpiration: false,
    currentExpiresAt: null,
    now,
    inactivityDays: 180,
  });
  assert.equal(decision.markQualifying, false);
  assert.equal(decision.changeExpiry, true);
  assert.equal(
    decision.newExpiresAt?.getTime(),
    now.getTime() + 180 * 24 * 60 * 60 * 1000,
  );
});
