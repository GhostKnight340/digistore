/**
 * Who may place an order.
 *
 * These exist because guest checkout was shipped HALF-DONE: `createOrderAction`
 * was changed to accept guests, but the UI kept `accountReady = isLoggedIn ?
 * accountVerified : false`, so a guest could never actually submit. The feature
 * was reported as working and was not. The first test below is the one that
 * would have caught it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveCheckoutGate, type CheckoutGateInput } from "../../src/lib/checkout/gate";

function input(overrides: Partial<CheckoutGateInput> = {}): CheckoutGateInput {
  return {
    isLoggedIn: false,
    accountVerified: false,
    mode: "guest",
    gateReady: true,
    gateIncompleteReason: null,
    ...overrides,
  };
}

test("a guest with complete details MAY place an order", () => {
  // The regression this file exists for.
  const gate = resolveCheckoutGate(input());
  assert.equal(gate.accountReady, true);
  assert.equal(gate.isGuest, true);
  assert.equal(gate.accountIncomplete, null);
});

test("a guest with incomplete details may not, and is told why", () => {
  const gate = resolveCheckoutGate(
    input({ gateReady: false, gateIncompleteReason: "Ajoutez votre nom complet." }),
  );
  assert.equal(gate.accountReady, false);
  assert.equal(gate.isGuest, true);
  assert.equal(gate.accountIncomplete, "Ajoutez votre nom complet.");
});

test("a guest is ready on valid details — no e-mail verification required", () => {
  // Guest checkout no longer requires e-mail verification: codes deliver only
  // after a human confirms the manual payment, so a mistyped address is a
  // recoverable delivery issue, not a way to obtain codes. resolveCheckoutGate
  // has no verification input for guests — readiness is purely their details
  // (the guest tab reports gateReady once name + e-mail are valid).
  const gate = resolveCheckoutGate(input({ accountVerified: false, gateReady: true }));
  assert.equal(gate.accountReady, true);
  assert.equal(gate.isGuest, true);
});

test("a FILLED but unsubmitted register form may NOT place an order", () => {
  // Otherwise the order is placed without the account the customer asked for.
  const gate = resolveCheckoutGate(input({ mode: "register", gateReady: true }));
  assert.equal(gate.accountReady, false);
  assert.equal(gate.isGuest, false);
});

test("choosing 'Se connecter' without logging in may not place an order", () => {
  const gate = resolveCheckoutGate(
    input({ mode: "login", gateReady: false, gateIncompleteReason: "Connectez-vous pour continuer." }),
  );
  assert.equal(gate.accountReady, false);
  assert.equal(gate.accountIncomplete, "Connectez-vous pour continuer.");
});

test("no choice yet gives a message naming BOTH paths", () => {
  // The customer must be able to see that guest checkout exists.
  const gate = resolveCheckoutGate(input({ mode: null, gateReady: false }));
  assert.equal(gate.accountReady, false);
  assert.match(gate.accountIncomplete ?? "", /sans compte/i);
});

test("a logged-in, verified customer is ready and is not a guest", () => {
  const gate = resolveCheckoutGate(input({ isLoggedIn: true, accountVerified: true, mode: null }));
  assert.equal(gate.accountReady, true);
  assert.equal(gate.isGuest, false);
  assert.equal(gate.accountIncomplete, null);
});

test("a logged-in but UNVERIFIED customer may not place an order", () => {
  const gate = resolveCheckoutGate(input({ isLoggedIn: true, accountVerified: false, mode: null }));
  assert.equal(gate.accountReady, false);
  assert.match(gate.accountIncomplete ?? "", /vérifiez votre adresse/i);
});

test("being logged in overrides any stale guest-tab state", () => {
  // The tab state persists in the component; once authenticated it must not be
  // able to grant or withhold readiness.
  const gate = resolveCheckoutGate({
    isLoggedIn: true,
    accountVerified: true,
    mode: "guest",
    gateReady: false,
    gateIncompleteReason: "stale",
    });
  assert.equal(gate.accountReady, true);
  assert.equal(gate.isGuest, false);
});
