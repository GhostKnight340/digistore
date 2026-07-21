// AI Operations — cross-instance rate limiting + idempotency wiring (spec §4–5).
// The bucket/policy core is pure and tested directly; the DB stores + endpoint
// wiring are asserted at the source level (no local DB). Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  RATE_POLICIES,
  rateBucket,
  windowEnd,
  overLimit,
} from "../../src/lib/ai-ops/rateLimitBuckets";

test("policies cover all five dimensions with positive ceilings", () => {
  const dims = RATE_POLICIES.map((p) => p.dimension).sort();
  assert.deepEqual(dims, ["global", "guild", "module", "provider", "user"]);
  for (const p of RATE_POLICIES) {
    assert.ok(p.limit > 0 && p.windowMs > 0, `${p.dimension} needs positive limit/window`);
  }
});

test("bucket keys are deterministic → the same key across instances (shared count)", () => {
  const now = Date.UTC(2026, 6, 21, 12, 0, 30);
  // Two "instances" computing the bucket for the same user+window agree exactly.
  assert.equal(rateBucket("user", "u1", 60_000, now), rateBucket("user", "u1", 60_000, now));
  // Different users / dimensions never collide.
  assert.notEqual(rateBucket("user", "u1", 60_000, now), rateBucket("user", "u2", 60_000, now));
  assert.notEqual(rateBucket("user", "u1", 60_000, now), rateBucket("guild", "u1", 60_000, now));
});

test("bucket rolls over at the window boundary", () => {
  const w = 60_000;
  const base = w * 100; // window-aligned start
  const a = rateBucket("global", "all", w, base);
  const sameWindow = rateBucket("global", "all", w, base + 59_000);
  const nextWindow = rateBucket("global", "all", w, base + 61_000);
  assert.equal(a, sameWindow, "same window → same bucket");
  assert.notEqual(a, nextWindow, "next window → new bucket");
});

test("windowEnd and overLimit behave as fixed-window counters", () => {
  const w = 60_000;
  const now = 1_000_000 + 10_000;
  assert.equal(windowEnd(w, now), Math.ceil(now / w) * w);
  assert.equal(overLimit(5, 5), false); // at the limit is allowed
  assert.equal(overLimit(6, 5), true); // over the limit denied
});

// ── Source-level guards for the DB store + endpoint/worker wiring ─────────────

test("the rate limiter increments atomically per dimension", () => {
  const src = readFileSync("src/lib/ai-ops/rateLimitStore.ts", "utf8");
  assert.ok(/aiRateCounter\.upsert/.test(src), "must upsert-increment the counter row");
  assert.ok(/increment:\s*1/.test(src), "must atomically increment");
});

test("idempotency claims a unique key and caches the completed answer", () => {
  const src = readFileSync("src/lib/ai-ops/idempotencyStore.ts", "utf8");
  assert.ok(/aiIdempotencyKey\.create/.test(src), "claim inserts a unique key");
  assert.ok(/duplicate_processing/.test(src) && /duplicate_done/.test(src), "distinguishes states");
});

test("the endpoint enforces rate limit + idempotency around processing", () => {
  const src = readFileSync("src/app/api/discord/assistant/route.ts", "utf8");
  assert.ok(/consumeRateLimit\(/.test(src), "rate limit applied");
  assert.ok(/claimIdempotency\(/.test(src) && /completeIdempotency\(/.test(src), "idempotency claim + complete");
  assert.ok(/messageId/.test(src), "keyed on the Discord message id");
});

test("the worker sends the message id and stays silent on duplicates", () => {
  const src = readFileSync("scripts/discord-assistant-worker.ts", "utf8");
  assert.ok(/messageId:\s*message\.id/.test(src), "sends the Discord message id");
  assert.ok(/"duplicate"/.test(src), "handles the duplicate status");
});
