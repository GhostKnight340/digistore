/**
 * Analytics consent.
 *
 * Ghost.ma previously loaded GA4 unconditionally in production. The rule these
 * tests pin is that no provider may load until the visitor actively grants
 * consent, and that every ambiguous state — undecided, corrupt storage, an older
 * consent version — fails CLOSED. Failing open would mean tracking someone who
 * never agreed, which is the whole thing we are avoiding.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CONSENT_VERSION,
  mayLoadProvider,
  parseStoredConsent,
  serializeConsent,
  shouldLogAnalyticsToConsole,
  type AnalyticsGateInput,
} from "../../src/lib/analytics/consent";

const GRANTED = parseStoredConsent(serializeConsent("granted"));
const DENIED = parseStoredConsent(serializeConsent("denied"));

/** A configuration where analytics is allowed to run — one field flipped per test. */
function gate(overrides: Partial<AnalyticsGateInput> = {}): AnalyticsGateInput {
  return {
    isProduction: true,
    providerId: "G-TEST123",
    consent: GRANTED,
    globallyEnabled: true,
    debug: false,
    ...overrides,
  };
}

// ── Storage round-trip ───────────────────────────────────────────────────────

test("a serialized decision round-trips", () => {
  const stored = parseStoredConsent(serializeConsent("granted"));
  assert.equal(stored?.decision, "granted");
  assert.equal(stored?.version, CONSENT_VERSION);
  assert.ok(stored?.decidedAt);
});

test("unreadable storage reads as undecided, never as consent", () => {
  for (const raw of [null, undefined, "", "not json", "{}", "[]", "null"]) {
    assert.equal(parseStoredConsent(raw), null, `expected undecided for ${JSON.stringify(raw)}`);
  }
});

test("an unknown decision value is rejected", () => {
  const forged = JSON.stringify({ decision: "yes", version: CONSENT_VERSION, decidedAt: "x" });
  assert.equal(parseStoredConsent(forged), null);
});

test("a decision from an older consent version is treated as undecided", () => {
  // The visitor agreed to a different set of providers; ask again.
  const old = JSON.stringify({
    decision: "granted",
    version: CONSENT_VERSION - 1,
    decidedAt: new Date().toISOString(),
  });
  assert.equal(parseStoredConsent(old), null);
});

// ── The gate ─────────────────────────────────────────────────────────────────

test("granted consent in production with an id loads the provider", () => {
  assert.equal(mayLoadProvider(gate()), true);
});

test("undecided does NOT load the provider", () => {
  // The core rule: silence until the visitor chooses.
  assert.equal(mayLoadProvider(gate({ consent: null })), false);
});

test("refused does NOT load the provider", () => {
  assert.equal(mayLoadProvider(gate({ consent: DENIED })), false);
});

test("consent alone is not enough — every other condition still applies", () => {
  // Staging must never pollute the live property, even with consent.
  assert.equal(mayLoadProvider(gate({ isProduction: false })), false);
  // No id means nothing to send to; never fall back to a baked-in property.
  assert.equal(mayLoadProvider(gate({ providerId: null })), false);
  assert.equal(mayLoadProvider(gate({ providerId: "" })), false);
  // The kill switch overrides consent.
  assert.equal(mayLoadProvider(gate({ globallyEnabled: false })), false);
});

test("debug mode never relaxes the consent rule", () => {
  // Debug makes events inspectable; it must not make them sendable.
  assert.equal(mayLoadProvider(gate({ debug: true, consent: null })), false);
  assert.equal(mayLoadProvider(gate({ debug: true, consent: DENIED })), false);
  assert.equal(mayLoadProvider(gate({ debug: true, isProduction: false })), false);
});

// ── Debug logging ────────────────────────────────────────────────────────────

test("debug logging is on only outside production, and only when asked", () => {
  assert.equal(shouldLogAnalyticsToConsole({ isProduction: false, debug: true }), true);
  assert.equal(shouldLogAnalyticsToConsole({ isProduction: false, debug: false }), false);
  // Never in production: it would add console noise, never a new data flow.
  assert.equal(shouldLogAnalyticsToConsole({ isProduction: true, debug: true }), false);
});
