// Health-check deadline wrapper. Run: npm test
//
// The point of this wrapper is that a hung Neon connection can no longer freeze
// the server-rendered admin dashboard, and that a check nobody could complete
// reports "unknown" rather than a comforting fake "healthy".
import { test } from "node:test";
import assert from "node:assert/strict";

import { withHealthTimeout } from "../../src/lib/monitoring/healthTimeout";
import type { HealthResult } from "../../src/lib/ops/types";

function healthy(key: string): HealthResult {
  return {
    key,
    label: key,
    status: "healthy",
    message: "ok",
    checkedAt: new Date().toISOString(),
    responseTimeMs: 1,
  };
}

test("passes a fast check through untouched", async () => {
  const result = await withHealthTimeout("database", "DB", async () => healthy("database"), 200);
  assert.equal(result.status, "healthy");
  assert.equal(result.message, "ok");
});

test("a hung check resolves as unknown instead of hanging forever", async () => {
  const startedAt = Date.now();
  const result = await withHealthTimeout(
    "database",
    "Base de données",
    () => new Promise<HealthResult>(() => {}), // never settles
    50,
  );
  assert.equal(result.status, "unknown");
  assert.equal(result.key, "database");
  assert.equal(result.label, "Base de données");
  // Crucially NOT "healthy" — an unverifiable check must never look green.
  assert.notEqual(result.status, "healthy");
  assert.ok(Date.now() - startedAt < 2000, "must not wait on the hung check");
  assert.equal(result.responseTimeMs, 50);
});

test("a throwing check resolves as unknown and never rejects", async () => {
  const result = await withHealthTimeout(
    "email",
    "E-mails",
    async () => {
      throw new Error("connection refused");
    },
    200,
  );
  assert.equal(result.status, "unknown");
  // The underlying error text must not leak into an admin-facing message.
  assert.ok(!result.message.includes("connection refused"));
});

test("a synchronously throwing check is also contained", async () => {
  const result = await withHealthTimeout(
    "discord",
    "Discord",
    () => {
      throw new Error("boom");
    },
    200,
  );
  assert.equal(result.status, "unknown");
});

test("one slow check does not delay the others running in parallel", async () => {
  const startedAt = Date.now();
  const results = await Promise.all([
    withHealthTimeout("a", "a", async () => healthy("a"), 50),
    withHealthTimeout("b", "b", () => new Promise<HealthResult>(() => {}), 50),
    withHealthTimeout("c", "c", async () => healthy("c"), 50),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    ["healthy", "unknown", "healthy"],
  );
  assert.ok(Date.now() - startedAt < 1000);
});
