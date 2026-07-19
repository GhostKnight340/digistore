// Supplier purchase failure certainty. Pure — no DB, no network.
//
// The rule under test: a failed purchase is only safe to retry when the
// supplier definitively refused it BEFORE spending. Anything where the request
// may have landed (timeout, socket error, 5xx) must come back UNCERTAIN so the
// admin reconciles manually — Reloadly has no server-enforced idempotency key,
// so a blind retry there buys a second real gift card.
//
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyPurchaseFailure,
  isSupplierPurchaseUncertain,
  SupplierPurchaseUncertainError,
  uncertainPurchaseMessage,
} from "../../src/lib/suppliers/purchaseOutcome";

test("a network failure (timeout, abort, socket) is uncertain — the order may have landed", () => {
  assert.equal(
    classifyPurchaseFailure({ isNetworkError: true, status: null }),
    "uncertain",
  );
});

test("a 4xx rejection is clean — the supplier refused before spending", () => {
  for (const status of [400, 401, 403, 404, 409, 422, 429]) {
    assert.equal(
      classifyPurchaseFailure({ isNetworkError: false, status }),
      "clean",
      `status ${status} should be safely retryable`,
    );
  }
});

test("408 / 425 are uncertain despite being 4xx — the server may have started work", () => {
  assert.equal(classifyPurchaseFailure({ isNetworkError: false, status: 408 }), "uncertain");
  assert.equal(classifyPurchaseFailure({ isNetworkError: false, status: 425 }), "uncertain");
});

test("any 5xx is uncertain", () => {
  for (const status of [500, 502, 503, 504]) {
    assert.equal(
      classifyPurchaseFailure({ isNetworkError: false, status }),
      "uncertain",
      `status ${status} must not be blindly retried`,
    );
  }
});

test("an unknown failure with no status is uncertain, never clean", () => {
  assert.equal(classifyPurchaseFailure({ isNetworkError: false, status: null }), "uncertain");
});

test("a network error wins over an accompanying 4xx status", () => {
  // Defensive: if a detector says no response arrived, a stale status must not
  // downgrade the outcome to a safe retry.
  assert.equal(classifyPurchaseFailure({ isNetworkError: true, status: 400 }), "uncertain");
});

test("only SupplierPurchaseUncertainError is recognised as uncertain", () => {
  const uncertain = new SupplierPurchaseUncertainError("msg", "order-1-item-0");
  assert.equal(isSupplierPurchaseUncertain(uncertain), true);
  assert.equal(uncertain.reconciliationRef, "order-1-item-0");
  assert.equal(isSupplierPurchaseUncertain(new Error("plain failure")), false);
  assert.equal(isSupplierPurchaseUncertain(null), false);
  assert.equal(isSupplierPurchaseUncertain("boom"), false);
});

test("the uncertain message tells the admin not to retry, and carries the reference", () => {
  const message = uncertainPurchaseMessage({
    supplierName: "Reloadly",
    reconciliationRef: "ord_42-item_7-0",
    detail: "Reloadly est injoignable.",
  });
  assert.match(message, /NE RELANCEZ PAS/);
  assert.match(message, /ord_42-item_7-0/);
  assert.match(message, /Reloadly/);
  assert.match(message, /manuellement/);
});
