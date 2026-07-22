// Support — forwarded-sender resolution. Pure, security-sensitive. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveOriginalSender, parseAddresses, isGhostAddress } from "../../src/lib/support/senderResolution";

/** Build a case-insensitive header getter from a plain map. */
function hdr(map: Record<string, string>): (n: string) => string | null {
  const lower = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return (n) => lower.get(n.toLowerCase()) ?? null;
}

test("original From preserved when external", () => {
  const r = resolveOriginalSender("buyer@example.com", hdr({}));
  assert.equal(r.originalSender, "buyer@example.com");
  assert.equal(r.source, "from");
  assert.equal(r.confidence, "high");
  assert.equal(r.envelopeSender, "buyer@example.com");
});

test("Zoho forwarding address in From → falls through to Resent-From", () => {
  const r = resolveOriginalSender("support@ghost.ma", hdr({ "Resent-From": "Real Customer <real@client.com>" }));
  assert.equal(r.originalSender, "real@client.com");
  assert.equal(r.source, "resent-from");
  assert.equal(r.confidence, "high");
  assert.equal(r.envelopeSender, "support@ghost.ma");
});

test("Reply-To carries the original sender (single external)", () => {
  const r = resolveOriginalSender("support@ghost.ma", hdr({ "Reply-To": "customer@buyer.com" }));
  assert.equal(r.originalSender, "customer@buyer.com");
  assert.equal(r.source, "reply-to");
  assert.equal(r.confidence, "medium");
});

test("multiple Reply-To addresses are NOT trusted", () => {
  const r = resolveOriginalSender("support@ghost.ma", hdr({ "Reply-To": "a@x.com, b@y.com" }));
  assert.equal(r.originalSender, null);
  assert.equal(r.source, "none");
});

test("malformed / spoofed headers are ignored (incl. X-Forwarded-For)", () => {
  const r = resolveOriginalSender(
    "support@ghost.ma",
    hdr({ "Resent-From": "not-an-email", "X-Forwarded-For": "203.0.113.9, 10.0.0.1", "X-Original-From": "<<garbage>>" }),
  );
  assert.equal(r.originalSender, null, "must not resolve from garbage or X-Forwarded-For");
  assert.equal(r.source, "none");
});

test("Ghost.ma internal forwarding loop → unresolved (manual review)", () => {
  const r = resolveOriginalSender("support@ghost.ma", hdr({ "Resent-From": "noreply@ghost.ma", "Reply-To": "team@ghost.ma" }));
  assert.equal(r.originalSender, null);
  assert.equal(r.confidence, "none");
});

test("X-Original-From used when From is internal and no Resent-*", () => {
  const r = resolveOriginalSender("support@ghost.ma", hdr({ "X-Original-From": "orig@client.com" }));
  assert.equal(r.originalSender, "orig@client.com");
  assert.equal(r.source, "x-original-from");
  assert.equal(r.confidence, "medium");
});

test("Return-Path is a last resort and never a bounce", () => {
  assert.equal(resolveOriginalSender("support@ghost.ma", hdr({ "Return-Path": "<who@client.com>" })).source, "return-path");
  const bounce = resolveOriginalSender("support@ghost.ma", hdr({ "Return-Path": "<MAILER-DAEMON@mx.zoho.com>" }));
  assert.equal(bounce.originalSender, null);
  const empty = resolveOriginalSender("support@ghost.ma", hdr({ "Return-Path": "<>" }));
  assert.equal(empty.originalSender, null);
});

test("priority: From wins over headers; Resent-From wins over Reply-To", () => {
  assert.equal(resolveOriginalSender("real@x.com", hdr({ "Reply-To": "other@y.com" })).source, "from");
  assert.equal(
    resolveOriginalSender("support@ghost.ma", hdr({ "Resent-From": "a@x.com", "Reply-To": "b@y.com" })).source,
    "resent-from",
  );
});

test("helpers: parseAddresses + isGhostAddress", () => {
  assert.deepEqual(parseAddresses("A <a@x.com>, b@y.com"), ["a@x.com", "b@y.com"]);
  assert.equal(isGhostAddress("support@ghost.ma"), true);
  assert.equal(isGhostAddress("x@mail.ghost.ma"), true);
  assert.equal(isGhostAddress("x@client.com"), false);
});
