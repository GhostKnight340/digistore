// Least-privilege display masking for the admin customer area. Pure — no DB.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { maskPhone, maskEmail, maskReference, maskIp } from "../../src/lib/privacyMask";

test("maskPhone keeps only the last two digits (test 4)", () => {
  const masked = maskPhone("+212 612 345 678");
  assert.ok(masked.endsWith("78"));
  assert.ok(masked.startsWith("+"));
  assert.ok(!masked.includes("612"), "middle digits must be hidden");
  assert.equal(maskPhone(""), "");
  assert.equal(maskPhone(null), "");
});

test("maskEmail preserves the domain, hides the local part", () => {
  const masked = maskEmail("zakariya@gmail.com");
  assert.ok(masked.endsWith("@gmail.com"));
  assert.ok(masked.startsWith("za"));
  assert.ok(!masked.includes("zakariya"));
});

test("maskReference keeps a short tail only (test 8 — no full tokens)", () => {
  const masked = maskReference("PAYID-1AB2C3D4E5F6");
  assert.ok(masked.endsWith("E5F6"));
  assert.ok(!masked.includes("PAYID-1AB2C3D4"));
  assert.equal(maskReference(null), "");
});

test("maskIp keeps only the first segment", () => {
  assert.equal(maskIp("192.168.1.42").startsWith("192."), true);
  assert.ok(!maskIp("192.168.1.42").includes("168"));
});
