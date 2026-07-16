// Checkout email-verification core logic. Run: npm test
//
// These exercise the pure, security-critical decision layer (no DB/Next needed):
// code hashing, format validation, the confirm classifier (expiry, attempt cap,
// single-use, timing-safe match, idempotent re-verify) and the proof window.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_ATTEMPTS,
  PROOF_TTL_MS,
  classifyConfirm,
  formatCode,
  hashCode,
  isValidEmail,
  proofIsValid,
  type VerificationRow,
} from "../../src/lib/checkout/verificationLogic";

const EMAIL = "buyer@example.com";
const CODE = "482913";

function row(overrides: Partial<VerificationRow> = {}): VerificationRow {
  return {
    codeHash: hashCode(EMAIL, CODE),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    attemptCount: 0,
    verifiedAt: null,
    consumedAt: null,
    ...overrides,
  };
}

test("isValidEmail accepts well-formed and rejects malformed addresses", () => {
  assert.equal(isValidEmail("a@b.co"), true);
  assert.equal(isValidEmail("bad"), false);
  assert.equal(isValidEmail("no@domain"), false);
  assert.equal(isValidEmail(""), false);
});

test("formatCode always yields six digits", () => {
  assert.equal(formatCode(0), "000000");
  assert.equal(formatCode(42), "000042");
  assert.equal(formatCode(482913), "482913");
  assert.match(formatCode(999999), /^\d{6}$/);
});

test("hashCode is deterministic and binds the code to the email", () => {
  assert.equal(hashCode(EMAIL, CODE), hashCode(EMAIL, CODE));
  assert.notEqual(hashCode(EMAIL, CODE), hashCode(EMAIL, "000000"));
  // Same code, different email → different hash (email binding).
  assert.notEqual(hashCode(EMAIL, CODE), hashCode("other@example.com", CODE));
});

test("a valid email can be verified with the correct code", () => {
  const result = classifyConfirm(row(), EMAIL, CODE, new Date());
  assert.equal(result.status, "verified");
  assert.equal(result.matched, true);
});

test("an incorrect code is rejected and decrements the remaining attempts", () => {
  const result = classifyConfirm(row({ attemptCount: 1 }), EMAIL, "000000", new Date());
  assert.equal(result.status, "incorrect");
  assert.equal(result.matched, false);
  assert.equal(result.attemptsLeft, MAX_ATTEMPTS - 2);
});

test("the final wrong guess locks the code (too_many_attempts)", () => {
  const result = classifyConfirm(row({ attemptCount: MAX_ATTEMPTS - 1 }), EMAIL, "000000", new Date());
  assert.equal(result.status, "too_many_attempts");
  assert.equal(result.matched, false);
});

test("once the attempt cap is reached even the right code is refused", () => {
  const result = classifyConfirm(row({ attemptCount: MAX_ATTEMPTS }), EMAIL, CODE, new Date());
  assert.equal(result.status, "too_many_attempts");
});

test("an expired code cannot be confirmed", () => {
  const expired = row({ expiresAt: new Date(Date.now() - 1000) });
  assert.equal(classifyConfirm(expired, EMAIL, CODE, new Date()).status, "expired");
});

test("a consumed code cannot be reused", () => {
  const consumed = row({ verifiedAt: new Date(), consumedAt: new Date() });
  assert.equal(classifyConfirm(consumed, EMAIL, CODE, new Date()).status, "expired");
});

test("a previously verified code is idempotently accepted within the proof window", () => {
  const verified = row({ verifiedAt: new Date(), expiresAt: new Date(Date.now() - 1000) });
  // Even with an empty code and a past code-expiry, the standing proof wins.
  assert.equal(classifyConfirm(verified, EMAIL, "", new Date()).status, "verified");
});

test("no active row is indistinguishable from expiry (no user enumeration)", () => {
  assert.equal(classifyConfirm(null, EMAIL, CODE, new Date()).status, "expired");
});

test("proofIsValid holds only for a fresh, unconsumed verification", () => {
  const now = new Date();
  assert.equal(proofIsValid({ verifiedAt: now, consumedAt: null }, now), true);
  assert.equal(proofIsValid({ verifiedAt: null, consumedAt: null }, now), false);
  assert.equal(proofIsValid({ verifiedAt: now, consumedAt: now }, now), false);
  const stale = new Date(now.getTime() - PROOF_TTL_MS - 1000);
  assert.equal(proofIsValid({ verifiedAt: stale, consumedAt: null }, now), false);
});
