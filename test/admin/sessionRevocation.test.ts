// Stateless-session revocation logic (force logout / disable). Pure — no DB.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { isSessionActive } from "../../src/lib/sessionRevocation";

test("no revocation anchor → every session is active", () => {
  assert.equal(isSessionActive(1000, null), true);
  assert.equal(isSessionActive(undefined, null), true);
  assert.equal(isSessionActive(undefined, undefined), true);
});

test("session issued after the anchor stays active", () => {
  const anchor = new Date(2000);
  assert.equal(isSessionActive(2001, anchor), true);
  assert.equal(isSessionActive(2000, anchor), true); // equal boundary = valid
});

test("session issued before the anchor is revoked (test 7)", () => {
  const anchor = new Date(5000);
  assert.equal(isSessionActive(4999, anchor), false);
});

test("legacy cookie without an issued-at fails closed once revoked", () => {
  const anchor = new Date(5000);
  assert.equal(isSessionActive(undefined, anchor), false);
  assert.equal(isSessionActive(NaN, anchor), false);
});
