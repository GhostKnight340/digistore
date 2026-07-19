// Payment-page status presentation + customer-safe event notes. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ORDER_STATUS_LABELS,
  customerVisibleEventNote,
  isPendingPayment,
  isRefunded,
  isTerminalStatus,
  orderStatusLabel,
  paymentPageBadge,
  paymentPageHeadline,
  paymentPageInstruction,
} from "../../src/lib/orderStatus";

/** Every status the DB can hold, including the legacy pre-payment aliases. */
const ALL_STATUSES = Object.keys(ORDER_STATUS_LABELS);

const AMBER = "#E8A838";

test("every known status maps to a badge with real French copy, never the raw status", () => {
  for (const status of ALL_STATUSES) {
    const badge = paymentPageBadge(status);
    assert.notEqual(badge.label, status, `${status} badge fell through to the raw status`);
    assert.match(badge.label, /[A-Za-zÀ-ÿ]/);
    assert.ok(badge.color && badge.bg && badge.bd && badge.dot);
  }
});

test("only the pre-payment states get the amber 'pay now' badge", () => {
  for (const status of ALL_STATUSES) {
    const amber = paymentPageBadge(status).dot === AMBER;
    assert.equal(amber, isPendingPayment(status), `${status} has the wrong badge tone`);
  }
});

test("a refunded order is never told to pay again", () => {
  const badge = paymentPageBadge("refunded");
  assert.equal(badge.label, "Remboursée");
  assert.notEqual(badge.dot, AMBER);
  assert.equal(paymentPageHeadline("refunded"), "Commande remboursée");
  assert.match(paymentPageInstruction("refunded") ?? "", /remboursée/);
  assert.match(paymentPageInstruction("refunded") ?? "", /aucun paiement n’est requis/i);
  assert.ok(isRefunded("refunded"));
});

test("only the pre-payment states defer their instruction to the payment method", () => {
  for (const status of ALL_STATUSES) {
    const deferred = paymentPageInstruction(status) === null;
    assert.equal(deferred, isPendingPayment(status), `${status} has no instruction copy`);
  }
});

test("every status has a headline, and the terminal ones say so", () => {
  for (const status of ALL_STATUSES) {
    assert.ok(paymentPageHeadline(status).length > 0);
  }
  assert.equal(paymentPageHeadline("cancelled"), "Commande annulée");
  assert.equal(paymentPageHeadline("delivered"), "Commande livrée");
  assert.equal(paymentPageHeadline("pending_payment"), "Finalisez votre paiement");
});

test("polling stops only on the states that can never change again", () => {
  assert.ok(isTerminalStatus("delivered"));
  assert.ok(isTerminalStatus("cancelled"));
  assert.ok(isTerminalStatus("refunded"));
  // A refused / flagged order still moves — the customer resubmits a proof.
  assert.equal(isTerminalStatus("rejected"), false);
  assert.equal(isTerminalStatus("payment_issue"), false);
  assert.equal(isTerminalStatus("pending_payment"), false);
});

test("payment_issue no longer claims the payment is being verified", () => {
  assert.equal(orderStatusLabel("payment_issue"), "Justificatif à renvoyer");
  // ...and stays distinct from the status that IS under verification.
  assert.notEqual(orderStatusLabel("payment_issue"), orderStatusLabel("payment_submitted"));
});

test("an internal timeline note is withheld from a caller that only knows the public order number", () => {
  const note = "Client suspect — virement d'un tiers, vérifier avec la banque.";
  assert.equal(customerVisibleEventNote(note, false), null);
  assert.equal(customerVisibleEventNote(note, true), note);
  assert.equal(customerVisibleEventNote(null, true), null);
});
