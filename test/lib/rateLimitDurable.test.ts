// Durable, cross-instance public rate limiter. The pure decision layer is tested
// directly (see fixedWindow.test.ts); the Redis + Postgres wiring is asserted at
// the source level, matching the repo convention for DB-integration code (no live
// Redis/DB in unit tests). Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const orchestrator = readFileSync("src/lib/rateLimit.ts", "utf8");
const redisSrc = readFileSync("src/lib/rateLimit/redis.ts", "utf8");
const dbSrc = readFileSync("src/lib/rateLimit/dbCounter.ts", "utf8");

test("consume is async and layered: Redis primary → Postgres fallback → fail closed", () => {
  assert.match(orchestrator, /export async function consume/);
  assert.match(orchestrator, /redisConsume/);
  assert.match(orchestrator, /dbConsume/);
  // Fail-closed branch: on total durable-store outage it DENIES rather than
  // allowing an unlimited request.
  assert.match(orchestrator, /failing closed/i);
  assert.match(orchestrator, /allowed:\s*false/);
});

test("primary backend uses Upstash @upstash/ratelimit sliding window", () => {
  assert.match(redisSrc, /@upstash\/ratelimit/);
  assert.match(redisSrc, /slidingWindow/);
  // A read (getRemaining) pass precedes charging, preserving all-or-nothing.
  assert.match(redisSrc, /getRemaining/);
});

test("fallback backend is a SHARED Postgres counter (RateLimitCounter upsert)", () => {
  assert.match(dbSrc, /prisma\.rateLimitCounter\.upsert/);
  assert.match(dbSrc, /increment/);
  // Read pass before charge → a deny on one dimension doesn't burn the others.
  assert.match(dbSrc, /findMany/);
});

test("POLICIES define escalating failure budgets for lookup and login", () => {
  for (const name of ["orderLookupFailIp", "orderLookupFailEmail", "loginFailIp"]) {
    assert.match(orchestrator, new RegExp(`${name}:\\s*\\{`), `missing policy ${name}`);
  }
  // The failure window (60 MIN) is longer than the per-attempt window (10 MIN) —
  // a genuine escalation, not just a second copy of the same budget.
  assert.match(orchestrator, /orderLookupFailIp:\s*\{ limit: \d+, windowMs: 60 \* MIN \}/);
  assert.match(orchestrator, /orderLookupIp:\s*\{ limit: \d+, windowMs: 10 \* MIN \}/);
});
