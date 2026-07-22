// Support identity — candidate aggregation. Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateIdentity } from "../../src/lib/ai-ops/support/identityScore";

test("guest identified by their order email alone (no account)", () => {
  const r = aggregateIdentity([{ customerId: null, orderId: "o1", confidence: 0.85, via: "order_email(2)" }]);
  assert.equal(r.identified, true);
  assert.equal(r.orderId, "o1");
  assert.equal(r.customerId, null);
  assert.equal(r.ordersFound, 2);
});

test("picks the highest-confidence customer + order", () => {
  const r = aggregateIdentity([
    { customerId: "c-weak", orderId: null, confidence: 0.6, via: "ticket_history" },
    { customerId: "c-strong", orderId: "o9", confidence: 0.95, via: "order_number" },
  ]);
  assert.equal(r.customerId, "c-strong");
  assert.equal(r.orderId, "o9");
});

test("two weak-but-independent signals corroborate → identified", () => {
  const r = aggregateIdentity([
    { customerId: "c1", orderId: null, confidence: 0.6, via: "ticket_history" },
    { customerId: "c1", orderId: null, confidence: 0.6, via: "phone" },
  ]);
  assert.equal(r.identified, true);
});

test("a single weak signal is NOT enough", () => {
  const r = aggregateIdentity([{ customerId: "c1", orderId: null, confidence: 0.6, via: "phone" }]);
  assert.equal(r.identified, false);
});

test("no candidates → not identified", () => {
  const r = aggregateIdentity([]);
  assert.equal(r.identified, false);
  assert.equal(r.ordersFound, 0);
});
