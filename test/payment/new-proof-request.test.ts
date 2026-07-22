import { test } from "node:test";
import assert from "node:assert/strict";

import { renderEmailTemplate } from "../../src/lib/emailTemplates";
import {
  isValidPaymentRecipient,
  validatePaymentProofRequest,
} from "../../src/lib/paymentProofRequest";
import { defaultStoreSettings } from "../../src/lib/storeSettings";

const secureUrl = "https://staging.ghost.ma/payment/unguessable-token";

function render() {
  return renderEmailTemplate(
    defaultStoreSettings,
    "new_proof_requested",
    {
      customer_name: "Zakariya",
      order_number: "#000006",
      payment_url: secureUrl,
      reason: "Le justificatif est illisible.",
    },
    {
      subject: "Nouveau justificatif demandé pour la commande #000006",
      body: "Nous avons besoin d’un nouveau justificatif afin de poursuivre la vérification.",
    },
  );
}

test("new-proof email renders the real heading, reason and CTA", () => {
  const { html } = render();
  assert.match(html, /Un nouveau justificatif est nécessaire/);
  assert.match(html, /Le justificatif est illisible/);
  assert.match(html, /Ajouter un nouveau justificatif/);
});

test("CTA and fallback use the same secure link without printing it as visible HTML text", () => {
  const { html } = render();
  assert.equal(html.split(`href="${secureUrl}"`).length - 1, 2);
  assert.match(html, />cliquez ici<\/a>/);
  const withoutAttributes = html.replace(/href="[^"]*"/g, "");
  assert.equal(withoutAttributes.includes(secureUrl), false);
});

test("request fields and recipient are validated", () => {
  assert.equal(isValidPaymentRecipient("client@example.com"), true);
  assert.equal(isValidPaymentRecipient("missing-address"), false);
  assert.match(
    validatePaymentProofRequest({ subject: "Sujet", message: "Message", reason: "", idempotencyKey: "once" }) ?? "",
    /motif/,
  );
  assert.equal(
    validatePaymentProofRequest({ subject: "Sujet", message: "Message", reason: "Motif", idempotencyKey: "once" }),
    null,
  );
});
