// Support email intake — pure parsing, eligibility, Svix verification. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { lastCustomerMessageAt, parseReferenceIds, stripQuotedReply, extractOrderRef } from "../../src/lib/ai-ops/support/thread";
import { assessEligibility } from "../../src/lib/ai-ops/support/eligibility";
import { verifyResendSignature, normalizeInboundEmail } from "../../src/lib/support/inboundEmail";

// ── thread helpers ───────────────────────────────────────────────────────────

test("lastCustomerMessageAt picks the newest customer message", () => {
  const t = lastCustomerMessageAt(
    [
      { author: "customer", createdAt: "2026-07-22T10:00:00Z" },
      { author: "admin", createdAt: "2026-07-22T12:00:00Z" },
      { author: "customer", createdAt: "2026-07-22T11:00:00Z" },
    ],
    "2026-07-22T09:00:00Z",
  );
  assert.equal(t, Date.parse("2026-07-22T11:00:00Z"));
});

test("lastCustomerMessageAt falls back to createdAt with no customer replies", () => {
  assert.equal(lastCustomerMessageAt([], "2026-07-22T09:00:00Z"), Date.parse("2026-07-22T09:00:00Z"));
});

test("parseReferenceIds extracts message ids", () => {
  assert.deepEqual(parseReferenceIds("<a@x> <b@y>"), ["<a@x>", "<b@y>"]);
  assert.deepEqual(parseReferenceIds(null), []);
});

test("stripQuotedReply removes quoted history and signature", () => {
  const raw = "Merci pour votre aide.\n\nOn Tue, Jul 22, 2026 at 10:00 AM Support wrote:\n> ancien message\n> encore";
  assert.equal(stripQuotedReply(raw), "Merci pour votre aide.");
  assert.equal(stripQuotedReply("Bonjour\n-- \nJean Dupont"), "Bonjour");
});

test("extractOrderRef finds order references", () => {
  assert.equal(extractOrderRef("Problème avec ma commande #000128"), "#000128");
  assert.equal(extractOrderRef("ref GH-S-482913 svp"), "GH-S-482913");
  assert.equal(extractOrderRef("juste une question"), null);
});

// ── eligibility ──────────────────────────────────────────────────────────────

test("eligibility: purchasing link → eligible", () => {
  assert.equal(assessEligibility({ orderRef: "#128", customerId: null, category: "autre", ordersTotal: 0 }), "eligible");
  assert.equal(assessEligibility({ orderRef: null, customerId: "c1", category: "autre", ordersTotal: 0 }), "eligible");
  assert.equal(assessEligibility({ orderRef: null, customerId: null, category: "autre", ordersTotal: 2 }), "eligible");
});

test("eligibility: unmatched post-purchase → needs_info", () => {
  assert.equal(assessEligibility({ orderRef: null, customerId: null, category: "paiement", ordersTotal: 0 }), "needs_info");
});

test("eligibility: unmatched general → route_manual", () => {
  assert.equal(assessEligibility({ orderRef: null, customerId: null, category: "autre", ordersTotal: 0 }), "route_manual");
});

// ── Svix signature verification ──────────────────────────────────────────────

function sign(secretKeyB64: string, id: string, ts: string, body: string): string {
  const sig = createHmac("sha256", Buffer.from(secretKeyB64, "base64")).update(`${id}.${ts}.${body}`).digest("base64");
  return `v1,${sig}`;
}

test("verifyResendSignature accepts a valid signature", () => {
  const keyB64 = Buffer.from("0123456789abcdef").toString("base64");
  const secret = `whsec_${keyB64}`;
  const now = 1_800_000_000_000;
  const ts = String(Math.floor(now / 1000));
  const body = JSON.stringify({ hello: "world" });
  const signature = sign(keyB64, "msg_1", ts, body);
  assert.equal(verifyResendSignature({ id: "msg_1", timestamp: ts, signature, body, secret, now }), true);
});

test("verifyResendSignature rejects a tampered body and stale timestamp", () => {
  const keyB64 = Buffer.from("0123456789abcdef").toString("base64");
  const secret = `whsec_${keyB64}`;
  const now = 1_800_000_000_000;
  const ts = String(Math.floor(now / 1000));
  const body = JSON.stringify({ hello: "world" });
  const signature = sign(keyB64, "msg_1", ts, body);
  assert.equal(verifyResendSignature({ id: "msg_1", timestamp: ts, signature, body: '{"hello":"evil"}', secret, now }), false);
  // 10 minutes of skew → rejected.
  assert.equal(verifyResendSignature({ id: "msg_1", timestamp: ts, signature, body, secret, now: now + 600_000 }), false);
  assert.equal(verifyResendSignature({ id: null, timestamp: ts, signature, body, secret, now }), false);
});

// ── inbound normalization ────────────────────────────────────────────────────

test("normalizeInboundEmail handles the data+headers shape", () => {
  const n = normalizeInboundEmail({
    id: "evt_1",
    data: {
      from: { email: "Buyer@Example.com", name: "Buyer" },
      to: ["support@ghost.ma"],
      subject: "Ma commande #000128",
      text: "Bonjour, où est ma commande ?",
      headers: [
        { name: "Message-ID", value: "<m1@example.com>" },
        { name: "References", value: "<root@ghost.ma>" },
      ],
    },
  });
  assert.ok(n);
  assert.equal(n!.fromEmail, "buyer@example.com");
  assert.equal(n!.messageId, "<m1@example.com>");
  assert.equal(n!.references, "<root@ghost.ma>");
  assert.equal(n!.subject, "Ma commande #000128");
});

test("normalizeInboundEmail parses a 'Name <addr>' from string, and rejects no-sender", () => {
  const n = normalizeInboundEmail({ data: { from: "Jean <jean@x.com>", subject: "hi", text: "yo" } });
  assert.equal(n!.fromEmail, "jean@x.com");
  assert.equal(n!.fromName, "Jean");
  assert.equal(normalizeInboundEmail({ data: { subject: "x" } }), null);
});
