// The email shell + text composer own the "Bonjour <name>," greeting exactly
// once; a template body that also starts with a greeting must not double it.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { renderEmailTemplate } from "../../src/lib/emailTemplates";
import { defaultStoreSettings } from "../../src/lib/storeSettings";

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

test("body that starts with a greeting is not doubled (HTML + text)", () => {
  const rendered = renderEmailTemplate(
    defaultStoreSettings,
    "welcome",
    { customer_name: "John" },
    { subject: "Bienvenue", body: "Bonjour {{customer_name}},\n\nBienvenue sur ghost.ma." },
  );
  assert.equal(count(rendered.html, "Bonjour John"), 1, "HTML greets once");
  assert.equal(count(rendered.text, "Bonjour John"), 1, "text greets once");
  assert.ok(rendered.html.includes("Bienvenue sur ghost.ma"));
});

test("body without a greeting still gets exactly one greeting", () => {
  const rendered = renderEmailTemplate(
    defaultStoreSettings,
    "welcome",
    { customer_name: "Amina" },
    { subject: "Bienvenue", body: "Bienvenue sur ghost.ma." },
  );
  assert.equal(count(rendered.html, "Bonjour Amina"), 1);
  assert.equal(count(rendered.text, "Bonjour Amina"), 1);
});

test("payment_issue renders its own template (not new_proof_requested)", () => {
  const rendered = renderEmailTemplate(
    defaultStoreSettings,
    "payment_issue",
    {
      customer_name: "Amine",
      order_number: "#000128",
      payment_url: "https://ghost.ma/payment/tok123",
      reason: "Le montant reçu ne correspond pas",
    },
  );
  assert.ok(rendered.subject.includes("Problème avec votre paiement"), "subject is the payment_issue one");
  assert.ok(rendered.html.includes("Voir le paiement"), "CTA is view-payment, not add-proof");
  assert.ok(!rendered.html.includes("Ajouter un justificatif"), "no proof-upload CTA");
  assert.ok(rendered.html.includes("Détail du problème"), "motif label rendered");
});

test("payment_issue with empty reason omits the motif block", () => {
  const rendered = renderEmailTemplate(
    defaultStoreSettings,
    "payment_issue",
    { customer_name: "Amine", order_number: "#000128", payment_url: "https://ghost.ma/payment/tok123", reason: "" },
  );
  assert.ok(!rendered.html.includes("Détail du problème"), "no motif block when reason empty");
});
