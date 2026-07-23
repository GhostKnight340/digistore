// Pure fixed-window decision layer backing the durable Postgres fallback limiter.
// No DB. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  fixedWindowDecision,
  windowBucket,
  windowExpiry,
} from "../../src/lib/rateLimit/fixedWindow";
import type { RateLimitPolicy } from "../../src/lib/rateLimitCore";

const POLICY: RateLimitPolicy = { limit: 5, windowMs: 60_000 };

test("bucket key is deterministic within a window and rolls over at the boundary", () => {
  const base = 3 * 60_000; // start of a window
  // Same window → identical bucket (this is what makes the count SHARED across
  // serverless instances hitting the same DB row).
  assert.equal(windowBucket("k", 60_000, base + 10), windowBucket("k", 60_000, base + 59_000));
  // Next window → a different bucket.
  assert.notEqual(windowBucket("k", 60_000, base + 10), windowBucket("k", 60_000, base + 60_010));
  // Different keys never collide.
  assert.notEqual(windowBucket("a", 60_000, base), windowBucket("b", 60_000, base));
});

test("windowExpiry is the end of the current window", () => {
  assert.equal(windowExpiry(60_000, 3 * 60_000 + 25_000), 4 * 60_000);
});

test("fixedWindowDecision allows up to the limit then denies", () => {
  const now = 0;
  // counts 1..5 (post-increment) are allowed; remaining decreases.
  for (let count = 1; count <= POLICY.limit; count++) {
    const d = fixedWindowDecision(count, POLICY, POLICY.windowMs, now);
    assert.equal(d.allowed, true);
    assert.equal(d.remaining, POLICY.limit - count);
  }
  // The 6th attempt exceeds the limit → denied with a retry hint.
  const denied = fixedWindowDecision(POLICY.limit + 1, POLICY, POLICY.windowMs, now);
  assert.equal(denied.allowed, false);
  assert.equal(denied.remaining, 0);
  assert.ok(denied.retryAfterMs > 0);
});
