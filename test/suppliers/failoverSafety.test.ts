/**
 * The failover safety rule.
 *
 * Ghost.ma supports a backup supplier per variant. Failing over is correct when
 * the first supplier definitively refused — and catastrophic when it did not,
 * because buying the same product from a second supplier while the first may
 * already have charged us means paying twice for one sale.
 *
 * This file pins that rule down: ONLY a clean refusal (or a supplier we never
 * dispatched to at all) may trigger failover.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mayFailOver } from "../../src/lib/suppliers/fulfillmentEngine";

test("a clean refusal may fail over to a backup supplier", () => {
  assert.equal(
    mayFailOver({
      kind: "failed_clean",
      fulfillmentId: "f1",
      code: "product_unavailable",
      message: "rupture de stock",
    }),
    true,
  );
});

test("a blocked supplier may fail over — nothing was ever dispatched", () => {
  assert.equal(mayFailOver({ kind: "blocked", message: "désactivé" }), true);
});

test("an UNCERTAIN outcome must never fail over", () => {
  // The whole point. The first supplier may already hold a paid order.
  assert.equal(
    mayFailOver({ kind: "uncertain", fulfillmentId: "f2", message: "timeout" }),
    false,
  );
});

test("a processing outcome must never fail over", () => {
  // The order is alive at the supplier; a second purchase would duplicate it.
  assert.equal(
    mayFailOver({ kind: "processing", fulfillmentId: "f3", message: "en cours" }),
    false,
  );
});

test("a successful or already-delivered slot must never fail over", () => {
  assert.equal(mayFailOver({ kind: "ready", fulfillmentId: "f4" }), false);
  assert.equal(mayFailOver({ kind: "already_delivered", fulfillmentId: "f5" }), false);
});
