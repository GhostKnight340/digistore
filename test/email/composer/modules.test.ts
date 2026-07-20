// Admin Email Composer — module validation, safe URLs, variables, credit rules,
// and idempotency-key stability. Pure logic, no DB. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateModules,
  isSafeUrl,
  substituteVariables,
  extractVariables,
  findMissingVariables,
  resolveCreditForRecipient,
  findCreditModule,
  recipientCreditKey,
  type CreditModule,
  type VariableMap,
} from "../../../src/lib/email/composerModules";

// ── Manual email validation is covered via the service regex; here URLs ──────
test("isSafeUrl accepts http(s), mailto and site-relative; rejects unsafe schemes", () => {
  assert.equal(isSafeUrl("https://ghost.ma"), true);
  assert.equal(isSafeUrl("http://ghost.ma/x"), true);
  assert.equal(isSafeUrl("/account/wallet"), true);
  assert.equal(isSafeUrl("mailto:support@ghost.ma"), true);
  assert.equal(isSafeUrl("javascript:alert(1)"), false);
  assert.equal(isSafeUrl("JavaScript:alert(1)"), false);
  assert.equal(isSafeUrl("data:text/html,<script>"), false);
  assert.equal(isSafeUrl("vbscript:msgbox"), false);
  assert.equal(isSafeUrl(""), false);
});

// ── Module validation ────────────────────────────────────────────────────────
test("a valid text module passes; an empty one fails", () => {
  const ok = validateModules([{ type: "text", id: "a", body: "Bonjour" }]);
  assert.equal(ok.ok, true);
  assert.equal(ok.modules.length, 1);

  const bad = validateModules([{ type: "text", id: "b", body: "" }]);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length >= 1);
});

test("a button with a javascript: URL is rejected", () => {
  const res = validateModules([
    { type: "button", id: "b", label: "Clique", url: "javascript:alert(1)" },
  ]);
  assert.equal(res.ok, false);
  assert.match(res.errors[0].message, /URL/i);
});

test("a button with a safe URL passes", () => {
  const res = validateModules([
    { type: "button", id: "b", label: "Voir", url: "https://ghost.ma/x" },
  ]);
  assert.equal(res.ok, true);
});

test("a credit module requires a positive amount", () => {
  assert.equal(validateModules([{ type: "credit", id: "c", amountMad: 0, title: "t", description: "" }]).ok, false);
  assert.equal(validateModules([{ type: "credit", id: "c", amountMad: -5, title: "t", description: "" }]).ok, false);
  assert.equal(
    validateModules([{ type: "credit", id: "c", amountMad: 5, title: "t", description: "", behavior: "grant" }]).ok,
    true,
  );
});

test("an unknown module type is reported", () => {
  const res = validateModules([{ type: "wat", id: "x" }]);
  assert.equal(res.ok, false);
  assert.match(res.errors[0].message, /inconnu/i);
});

test("a non-array is invalid", () => {
  assert.equal(validateModules("nope").ok, false);
  assert.equal(validateModules(null).ok, false);
});

test("credit behavior defaults to display when not 'grant'", () => {
  const res = validateModules([{ type: "credit", id: "c", amountMad: 5, title: "t", description: "" }]);
  assert.equal(res.ok, true);
  const credit = res.modules[0] as CreditModule;
  assert.equal(credit.behavior, "display");
});

// ── Variable substitution + missing detection ────────────────────────────────
test("substituteVariables replaces known tokens and blanks unknown", () => {
  const vars: VariableMap = { "customer.name": "Amine", "store.name": "ghost.ma" };
  assert.equal(substituteVariables("Bonjour {{customer.name}} de {{store.name}}", vars), "Bonjour Amine de ghost.ma");
  assert.equal(substituteVariables("Solde {{customer.creditBalance}}", vars), "Solde ");
});

test("extractVariables finds all tokens", () => {
  assert.deepEqual(
    extractVariables("{{customer.name}} {{order.number}} {{customer.name}}").sort(),
    ["customer.name", "order.number"],
  );
});

test("findMissingVariables flags unknown tokens and unresolved supported ones", () => {
  const vars: VariableMap = { "customer.name": "Amine" };
  const missing = findMissingVariables(
    ["Bonjour {{customer.name}}", "Commande {{order.number}}", "{{totally.made.up}}"],
    vars,
  );
  assert.ok(missing.includes("order.number"), "supported but unresolved is missing");
  assert.ok(missing.includes("totally.made.up"), "unknown token is missing");
  assert.ok(!missing.includes("customer.name"), "resolved token is not missing");
});

// ── Credit-behavior resolution (the safety core) ─────────────────────────────
const grantModule: CreditModule = {
  type: "credit",
  id: "c",
  amountMad: 5,
  title: "Crédit Ghost offert",
  description: "",
  behavior: "grant",
};

test("an existing customer with 'grant' actually grants", () => {
  const res = resolveCreditForRecipient(grantModule, { kind: "customer", hasAccount: true });
  assert.equal(res.behavior, "grant");
  assert.equal(res.creditStatus, "grant");
  assert.equal(res.amountMad, 5);
});

test("a manual recipient can NEVER receive account credit — grant is downgraded", () => {
  const res = resolveCreditForRecipient(grantModule, { kind: "manual", hasAccount: false });
  assert.equal(res.behavior, "display");
  assert.equal(res.creditStatus, "blocked_no_account");
  assert.ok(res.note && /compte/i.test(res.note));
});

test("display behavior stays display for everyone", () => {
  const displayModule: CreditModule = { ...grantModule, behavior: "display" };
  assert.equal(resolveCreditForRecipient(displayModule, { kind: "customer", hasAccount: true }).creditStatus, "display_only");
  assert.equal(resolveCreditForRecipient(displayModule, { kind: "manual", hasAccount: false }).creditStatus, "display_only");
});

test("findCreditModule returns the single credit module or null", () => {
  assert.equal(findCreditModule([{ type: "divider", id: "d" }]), null);
  assert.equal(findCreditModule([grantModule])?.type, "credit");
});

// ── Idempotency key stability (retry cannot double-grant) ────────────────────
test("recipientCreditKey is deterministic per recipient id", () => {
  assert.equal(recipientCreditKey("rec_123"), "admin-email-credit:rec_123");
  // Stable across calls → a retry (same recipient row id) reuses the same key,
  // so grantCreditTx collapses the second grant to a no-op.
  assert.equal(recipientCreditKey("rec_123"), recipientCreditKey("rec_123"));
  assert.notEqual(recipientCreditKey("rec_123"), recipientCreditKey("rec_456"));
});
