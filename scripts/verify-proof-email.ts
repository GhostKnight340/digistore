// Verifies the "Demander un nouveau justificatif" email renders consistently:
// single greeting, optional Motif block, CTA button (no raw URL printed in the
// HTML body), URL present in plain-text, human order number, accents intact.
// Mirrors the real path: renderEmailTemplate(..., { subject, body: message }).
//
// Usage:  npx tsx scripts/verify-proof-email.ts
import { renderEmailTemplate } from "../src/lib/emailTemplates";
import { defaultStoreSettings } from "../src/lib/storeSettings";

const ORDER = "#000018";
const PAYMENT_URL = "https://ghost.ma/payment/000018";
const MESSAGE = "Nous avons besoin d'un nouveau justificatif de paiement pour votre commande {{order_number}}.";

let failures = 0;
function check(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok - ${message}`);
  } else {
    console.error(`  FAIL - ${message}`);
    failures += 1;
  }
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function render(reason: string, message = MESSAGE, subject = "Nouveau justificatif demandé pour {{order_number}}") {
  return renderEmailTemplate(
    defaultStoreSettings,
    "new_proof_requested",
    {
      customer_name: "Zakariya Finnaoui",
      order_number: ORDER,
      payment_url: PAYMENT_URL,
      reason,
    },
    { subject, body: message },
  );
}

console.log("Case 1 — request WITHOUT reason:");
{
  const r = render("");
  check(countOccurrences(r.html, "Bonjour Zakariya Finnaoui,") === 1, "exactly one greeting in HTML");
  check(countOccurrences(r.text, "Bonjour Zakariya Finnaoui,") === 1, "exactly one greeting in text");
  check(!r.html.includes("Motif de la demande"), "no Motif block when reason empty");
  check(!r.html.includes("Raison :"), "no leftover 'Raison :' label");
  check(!r.html.includes("{{"), "no un-interpolated placeholders in HTML");
  check(r.html.includes("Ajouter un justificatif"), "CTA button label present");
  check(countOccurrences(r.html, PAYMENT_URL) === 1, "payment URL only in the CTA href, not printed in body");
  check(r.text.includes(PAYMENT_URL), "plain-text fallback includes the URL");
  check(r.subject === `Nouveau justificatif demandé pour ${ORDER}`, "subject uses human order number");
  check(r.html.includes(ORDER) && !r.html.includes("clid") , "body references human order number");
}

console.log("\nCase 2 — request WITH reason (accents/apostrophes):");
{
  const reason = "Le reçu envoyé est illisible ou incomplet.";
  const r = render(reason);
  check(r.html.includes("Motif de la demande"), "Motif block shown");
  check(r.html.includes("Le reçu envoyé est illisible ou incomplet."), "reason rendered with accents intact");
  check(countOccurrences(r.html, "Bonjour Zakariya Finnaoui,") === 1, "still exactly one greeting");
  check(r.text.includes("Motif de la demande :"), "plain-text includes Motif label");
  check(r.text.includes(reason), "plain-text includes reason");
  check(!r.html.includes("Nouveau justificatif demandé par l'admin"), "no invented default reason");
}

console.log("\nCase 3 — customized subject & message:");
{
  const r = render("", "Merci de renvoyer un justificatif lisible pour {{order_number}}.", "Action requise sur {{order_number}}");
  check(r.subject === `Action requise sur ${ORDER}`, "custom subject interpolated");
  check(r.html.includes(`Merci de renvoyer un justificatif lisible pour ${ORDER}.`), "custom message rendered in HTML body");
  check(r.text.includes(`Merci de renvoyer un justificatif lisible pour ${ORDER}.`), "custom message rendered in text");
  check(countOccurrences(r.html, "Bonjour Zakariya Finnaoui,") === 1, "no duplicated greeting with custom message");
}

// ─── Reject & refund now share the same clean structure ────────────────────
const ORDER_URL = "https://ghost.ma/order/000018";

function renderReview(key: "payment_rejected" | "refund_update", reason: string, message: string) {
  return renderEmailTemplate(
    defaultStoreSettings,
    key,
    {
      customer_name: "Zakariya Finnaoui",
      order_number: ORDER,
      payment_url: PAYMENT_URL,
      order_url: ORDER_URL,
      reason,
    },
    { subject: "Sujet {{order_number}}", body: message },
  );
}

console.log("\nCase 4 — payment_rejected (clean structure):");
{
  const r = renderReview(
    "payment_rejected",
    "Le justificatif ne correspond pas au montant.",
    "Le paiement de votre commande {{order_number}} n'a pas pu être validé.",
  );
  check(countOccurrences(r.html, "Bonjour Zakariya Finnaoui,") === 1, "exactly one greeting in HTML");
  check(countOccurrences(r.text, "Bonjour Zakariya Finnaoui,") === 1, "exactly one greeting in text");
  check(r.html.includes("Motif du refus"), "Motif du refus block shown");
  check(!r.html.includes("Raison :"), "no inline 'Raison :' label");
  check(countOccurrences(r.html, PAYMENT_URL) === 1, "payment URL only in the CTA href");
  check(r.text.includes(PAYMENT_URL), "plain-text includes the URL");
}

console.log("\nCase 5 — refund_update (clean structure):");
{
  const r = renderReview(
    "refund_update",
    "Remboursement traité, sous 3 à 5 jours ouvrés.",
    "Voici une mise à jour concernant le remboursement de votre commande {{order_number}}.",
  );
  check(countOccurrences(r.html, "Bonjour Zakariya Finnaoui,") === 1, "exactly one greeting in HTML");
  check(r.html.includes("Motif du remboursement"), "Motif du remboursement block shown");
  check(r.html.includes("Remboursement traité, sous 3 à 5 jours ouvrés."), "reason with accents intact");
  check(r.text.includes(ORDER_URL), "plain-text includes the order URL");
  check(!r.html.includes("{{"), "no un-interpolated placeholders");
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll review email checks passed.");
}
