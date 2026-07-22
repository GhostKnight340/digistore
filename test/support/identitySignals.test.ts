// Support identity — pure signal extraction. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractOrderRefs,
  extractPaymentRefs,
  extractPhone,
  extractIdentitySignals,
} from "../../src/lib/ai-ops/support/identitySignals";

test("extractOrderRefs finds all references", () => {
  const refs = extractOrderRefs("Ma commande #000128 et aussi la commande 445 svp, réf GH-S-482913");
  assert.ok(refs.includes("#000128"));
  assert.ok(refs.includes("GH-S-482913"));
});

test("extractPaymentRefs keeps id-like tokens, drops words", () => {
  const refs = extractPaymentRefs("Mon paiement PayPal 5O190127TN364715T merci beaucoup vraiment");
  assert.ok(refs.includes("5O190127TN364715T"));
  assert.ok(!refs.includes("beaucoup"));
});

test("extractPhone normalizes a plausible number", () => {
  assert.equal(extractPhone("appelez moi au +212 6 12 34 56 78"), "+212612345678");
  assert.equal(extractPhone("pas de numéro ici"), null);
});

test("extractIdentitySignals assembles + lowercases", () => {
  const s = extractIdentitySignals({
    email: "Buyer@Example.com",
    orderRef: "#000128",
    phone: null,
    text: "réf paiement 5O190127TN364715T, tel 0612345678",
  });
  assert.equal(s.senderEmail, "buyer@example.com");
  assert.ok(s.orderRefs.includes("#000128"));
  assert.ok(s.paymentRefs.length >= 1);
  assert.ok(s.phone && s.phone.replace(/\D/g, "").length >= 8);
});
