// AI Operations — sensitive-data redaction for AI context & logs (spec §4/§9).
// Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  redactForAiContext,
  findLeakedSensitiveKeys,
  isSensitiveKey,
  REDACTED,
} from "../../src/lib/ai-ops/redaction";

test("shared sensitive keys are redacted", () => {
  const out = redactForAiContext({ password: "hunter2", token: "abc", email: "a@b.com", ok: "keep" }) as Record<string, unknown>;
  assert.equal(out.password, REDACTED);
  assert.equal(out.token, REDACTED);
  assert.equal(out.email, REDACTED);
  assert.equal(out.ok, "keep");
});

test("AI-extra keys (supplier/payment/env) are redacted", () => {
  const out = redactForAiContext({
    supplierSecret: "s",
    reloadlyClientSecret: "r",
    iban: "MA00",
    accountNumber: "123",
    databaseUrl: "postgres://x",
    privateKey: "-----",
  }) as Record<string, unknown>;
  for (const k of Object.keys(out)) assert.equal(out[k], REDACTED, `${k} leaked`);
});

test("nested and arrayed secrets are redacted recursively", () => {
  const out = redactForAiContext({
    order: { customerEmail: "a@b.com", items: [{ giftCode: "XYZ", qty: 2 }] },
  });
  assert.deepEqual(findLeakedSensitiveKeys(out), []);
});

test("findLeakedSensitiveKeys flags an un-redacted secret", () => {
  const leaks = findLeakedSensitiveKeys({ apiKey: "raw-value" });
  assert.ok(leaks.includes("apiKey"));
});

test("non-sensitive business fields survive redaction", () => {
  const out = redactForAiContext({ status: "delivered", totalMad: 240, count: 3 }) as Record<string, unknown>;
  assert.equal(out.status, "delivered");
  assert.equal(out.totalMad, 240);
  assert.equal(out.count, 3);
});

test("isSensitiveKey covers both shared and AI-extra patterns", () => {
  assert.ok(isSensitiveKey("password"));
  assert.ok(isSensitiveKey("supplier_token"));
  assert.ok(isSensitiveKey("cvv"));
  assert.ok(!isSensitiveKey("status"));
});

test("redaction never mutates the input", () => {
  const input = { token: "secret" };
  redactForAiContext(input);
  assert.equal(input.token, "secret");
});
