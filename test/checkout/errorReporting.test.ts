/**
 * `checkout_error` analytics reporting.
 *
 * The failure mode being prevented is a privacy one: the server's error messages
 * are French prose that can name a product ("… n'est plus disponible"), and free
 * text sent into an analytics property is how PII leaks by accident. Checkout
 * therefore reports a fixed reason-code vocabulary, never the message.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CHECKOUT_ERROR_REASONS,
  classifyCheckoutError,
} from "../../src/lib/checkout/errorReporting";

test("each server error maps to its reason code", () => {
  const cases: Array<[string, string]> = [
    ["Votre panier est vide.", "empty_cart"],
    [
      "Un article de votre panier n'est plus disponible. Actualisez votre panier puis réessayez.",
      "item_unavailable",
    ],
    [
      "Aucun moyen de paiement n'est disponible pour le moment. Réessayez dans quelques minutes.",
      "payment_method_unavailable",
    ],
    ["Quantité invalide pour un article du panier.", "invalid_quantity"],
    ["Numéro de téléphone invalide.", "invalid_phone"],
    [
      "Un compte existe déjà avec cette adresse. Connectez-vous pour finaliser votre commande.",
      "account_exists",
    ],
    ["Vérifiez votre adresse e-mail pour continuer vers le paiement.", "email_unverified"],
    ["Trop de tentatives. Patientez quelques minutes puis réessayez.", "rate_limited"],
  ];
  for (const [message, expected] of cases) {
    assert.equal(classifyCheckoutError(message), expected, `for: ${message}`);
  }
});

test("an unrecognised message degrades to a generic code, never to the message", () => {
  const code = classifyCheckoutError("Quelque chose d'inattendu s'est produit");
  assert.equal(code, "other");
});

test("no reason code leaks the product name from the message", () => {
  // The message that motivated this: it embeds catalogue detail.
  const message =
    "L'article « Carte cadeau PlayStation 500 DH » de votre panier n'est plus disponible.";
  const code = classifyCheckoutError(message);
  assert.equal(code, "item_unavailable");
  assert.ok(!code.includes("PlayStation"));
  assert.ok(!code.includes(" "), "a reason code must be a single token");
});

test("the vocabulary is closed — every output is a known code", () => {
  const allowed = new Set<string>(CHECKOUT_ERROR_REASONS);
  const samples = [
    "",
    "Votre panier est vide.",
    "Code promo invalide.",
    "n'importe quoi",
    "TÉLÉPHONE invalide",
  ];
  for (const sample of samples) {
    assert.ok(allowed.has(classifyCheckoutError(sample)), `unexpected code for: ${sample}`);
  }
});
